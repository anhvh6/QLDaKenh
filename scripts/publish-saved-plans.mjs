// One-time migration of saved chat plans into the normal QL Phác đồ tables.
import {all,put,now,db} from '../server/store.mjs';
import {readPublishedPlan,publishStudyPlan} from '../server/supabase.mjs';
let count=0;
for(const p of all('study_plans')){
 if(p.publishedAt)continue;
 const existing=await readPublishedPlan(p.id);
 if(existing)throw new Error('Hồ sơ đã tồn tại: '+p.id+'. Cần đối chiếu trước khi chuyển.');
 const profile={...p.customer,trang_thai:0,status:'ACTIVE'};
 const result=await publishStudyPlan(profile,p.tasks,{createdAt:p.createdAt||p.updatedAt,creatorEmail:db.prepare('SELECT email FROM users WHERE id=?').get(p.savedBy)?.email});
 if(!result)throw new Error('Nguồn QL Phác đồ chưa được bật.');
 put('study_plans',{...p,customer:result,publishedAt:now(),remoteUpdatedAt:result.updated_at},p.version);
 count++;
}
console.log(JSON.stringify({published:count,remaining:all('study_plans').filter(p=>!p.publishedAt).length}));
