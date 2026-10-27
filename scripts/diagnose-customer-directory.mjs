// Outputs counts only. Does not print names, phones, learner IDs, tokens or messages.
import {all,db} from '../server/store.mjs';
import {refreshDirectoryLearners,mergeDirectoryLearners} from '../server/learner-directory-source.mjs';
import {customerDirectory} from '../server/customer-directory.mjs';
const source=await refreshDirectoryLearners({force:true});
if(!source){console.log(JSON.stringify({ready:false,error:'Chưa đồng bộ được nguồn học viên.'}));process.exitCode=1;}
else{
 const user=db.prepare("SELECT id,role FROM users WHERE role='owner' AND active=1 LIMIT 1").get();if(!user)throw Error('Không tìm thấy quản trị đang hoạt động.');
 const data={customers:all('customers'),study_plans:all('study_plans')},expected=mergeDirectoryLearners(data,source.rows).remoteLearnerIds,seen=new Set();let first;
 for(let page=1;;page++){const result=await customerDirectory(user,new URLSearchParams({page:String(page)}));first||=result;for(const row of result.rows)seen.add(row.id);if(page>=result.pageCount)break;}
 const overview=db.prepare("SELECT payload FROM dashboard_aggregates WHERE aggregate_key='learners:v1'").get(),summary=overview?JSON.parse(overview.payload):null;
 const missing=[...expected].filter(id=>!seen.has(id)).length;
 console.log(JSON.stringify({ready:true,sourceRows:source.sourceRows,learners:source.learnerCount,directoryTotal:first.total,representedLearners:expected.size,missingLearners:missing,overviewLearners:summary?.stats?.total??null,refreshFailed:source.refreshFailed,updatedAt:source.updatedAt}));if(missing||source.refreshFailed)process.exitCode=1;
}
