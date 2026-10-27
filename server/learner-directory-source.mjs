import {createHash} from 'node:crypto';
import {db,getSupabaseHeaders,SUPABASE_URL,all,get,put} from './store.mjs';
import {createAggregateStore} from './overview-cache.mjs';
const aggregates=createAggregateStore(db),key='customer-directory:learners:v1';
let attemptedAt=0,lastError='',pending=null;
export const learnerDirectoryColumns='id,customer_id,customer_name,sdt,email,dia_chi,status,is_deposit,deposit_amount,is_consultation,start_date,end_date,duration_days,video_date,is_customized,gia_tien,san_pham,created_at,updated_at';
export const learnerDirectoryId=id=>'learner_'+createHash('sha256').update(String(id)).digest('hex').slice(0,32);
export async function readAllDirectoryLearners(readPage){
 const rows=[],ids=new Set();let offset=0;
 while(offset<100000){
  const batch=await readPage(offset,500);
  if(!Array.isArray(batch))throw Error('Nguồn học viên chưa trả danh sách hợp lệ.');
  if(!batch.length)return rows;
  for(const row of batch){if(!row.customer_id||ids.has(row.customer_id))throw Error('Mã học viên bị thiếu hoặc trùng; giữ bản đồng bộ đầy đủ trước đó.');ids.add(row.customer_id);rows.push(Object.fromEntries(learnerDirectoryColumns.split(',').filter(k=>row[k]!==undefined).map(k=>[k,row[k]])));}
  offset+=batch.length;
 }
 throw Error('Chưa đọc hết nguồn học viên; không thay thế dữ liệu đầy đủ.');
}
export function cachedDirectoryLearners(){return aggregates.read(key);}
export async function refreshDirectoryLearners({readPage,force=false}={}){
 if(process.env.PLAN_REMOTE_CATALOG==='0'&&!readPage)return null;
 if(pending)return pending;
 if(!force&&Date.now()-attemptedAt<60000)return cachedDirectoryLearners();
 attemptedAt=Date.now();
 pending=aggregates.refresh(key,async()=>{
  const headers=readPage?null:await getSupabaseHeaders();
  const rows=await readAllDirectoryLearners(readPage||(async(offset,limit)=>{
   const url=SUPABASE_URL+'/rest/v1/customers?'+new URLSearchParams({select:learnerDirectoryColumns,order:'customer_id.asc,id.asc',offset:String(offset),limit:String(limit)});
   const res=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
   if(!res.ok)throw Error('Nguồn học viên HTTP '+res.status);return res.json();
  }));
  if(!rows.length&&cachedDirectoryLearners()?.sourceRows)throw Error('Nguồn học viên trả rỗng; giữ bản đầy đủ.');
  lastError='';return {rows,sourceRows:rows.length,learnerCount:rows.filter(r=>r.status!=='DELETED').length};
 },{minInterval:force?0:60000}).catch(()=>{lastError='Chưa cập nhật được nguồn QL Phác đồ. Đang giữ dữ liệu đồng bộ gần nhất.';return cachedDirectoryLearners();}).finally(()=>pending=null);
 return pending;
}
export async function directoryLearnerSource(){
 if(process.env.PLAN_REMOTE_CATALOG==='0')return {rows:[],disabled:true,ready:true,learnerCount:0,updatedAt:null};
 const cached=cachedDirectoryLearners();if(cached){void refreshDirectoryLearners();return {...cached,ready:true,error:lastError|| (cached.refreshFailed?'Chưa cập nhật được nguồn QL Phác đồ. Đang giữ bản đồng bộ gần nhất.':'')};}
 const result=await refreshDirectoryLearners();return result?{...result,ready:true,error:lastError}:{rows:[],ready:false,learnerCount:0,error:lastError||'Chưa đồng bộ được dữ liệu QL Phác đồ.'};
}
export function mapDirectoryLearner(row,id,previous={}){
 return {...previous,id,customer_id:row.customer_id,planCustomerId:row.customer_id,origin:'taophacdo',name:row.customer_name||previous.name||row.customer_id,phone:previous.phone||row.sdt||'',email:previous.email||row.email||'',address:previous.address||row.dia_chi||'',status:row.status,is_deposit:row.is_deposit,deposit_amount:row.deposit_amount,is_consultation:row.is_consultation,start_date:row.start_date,end_date:row.end_date,duration_days:row.duration_days,video_date:row.video_date,is_customized:row.is_customized,gia_tien:row.gia_tien,san_pham:row.san_pham,remoteUpdatedAt:row.updated_at,tags:previous.tags||[]};
}
export function directoryCanonicalLinks(customers,plans=[],canonicalIds=null){
 const links=new Map(),assigned=new Map(),validIds=new Set(customers.filter(c=>!c.mergedInto&&!c.deletedAt&&!c.purgePending).map(c=>c.id));
 const assign=(canonical,id)=>{if(!canonical||canonicalIds&&!canonicalIds.has(String(canonical))||links.has(String(canonical))||assigned.has(id)&&assigned.get(id)!==String(canonical))return;links.set(String(canonical),id);assigned.set(id,String(canonical));};
 for(const c of customers){if(!validIds.has(c.id))continue;for(const id of [c.planCustomerId,c.customer_id])assign(id,c.id);}
 for(const p of plans)if(p.customerId&&validIds.has(p.customerId))for(const id of [p.customer?.customer_id,p.id])assign(id,p.customerId);
 return links;
}

export function mergeDirectoryLearners(source,remoteRows){
 const links=directoryCanonicalLinks(source.customers,source.study_plans,new Set(remoteRows.map(r=>String(r.customer_id)))),customers=new Map(source.customers.map(c=>[c.id,c])),represented=new Set();
 for(const row of remoteRows){if(row.status==='DELETED'){const id=links.get(String(row.customer_id));if(id&&customers.has(id))customers.set(id,{...customers.get(id),status:'DELETED',learnerDeleted:true});continue;}const id=links.get(String(row.customer_id))||learnerDirectoryId(row.customer_id),previous=customers.get(id);if(previous?.mergedInto||previous?.purgePending)continue;customers.set(id,mapDirectoryLearner(row,id,previous));represented.add(id);}
 return {...source,customers:[...customers.values()],remoteLearnerIds:represented,chatPlanSummaries:[...(source.chatPlanSummaries||[]),...[...represented].map(id=>customers.get(id)).filter(c=>c.video_date||c.is_customized).map(c=>({customerId:c.id,startDate:c.start_date,endDate:c.end_date,status:c.status}))]};
}
// Opening a verified source-only learner creates a lightweight local identity on demand.
// It does not copy all 898 learners into every chat snapshot or create conversations.
export function materializeDirectoryLearner(user,id){
 if(!/^learner_[a-f0-9]{32}$/.test(id)||!['owner','manager'].includes(user.role))return null;
 const row=cachedDirectoryLearners()?.rows?.find(r=>r.status!=='DELETED'&&learnerDirectoryId(r.customer_id)===id);if(!row)return null;
 const links=directoryCanonicalLinks(all('customers'),all('study_plans'),new Set(cachedDirectoryLearners().rows.map(r=>String(r.customer_id)))),existing=links.get(String(row.customer_id));if(existing)return get('customers',existing);
 return put('customers',mapDirectoryLearner(row,id,{createdBy:user.id}));
}
