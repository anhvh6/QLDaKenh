import {all,get} from './store.mjs';
import {permission,fail} from './domain.mjs';
import {assertCustomer,planFor} from './taophacdo.mjs';
import {readPlanSources,readLearner,readPlanProfile,readLearnerActivity,readPlanCatalog} from './supabase.mjs';

const localPlan=c=>all('study_plans').find(p=>p.customerId===c.id);
const allowed=(user,c)=>{try{assertCustomer(user,c.id);return true;}catch{return false;}};
export async function listPlanSources(user,targetId){
 permission(user,'customers');assertCustomer(user,targetId);
 const customers=all('customers'),target=get('customers',targetId),seen=new Set([target?.customer_id,target?.planCustomerId]);
 const sources=customers.filter(c=>c.id!==targetId&&allowed(user,c)&&(localPlan(c)||c.origin==='taophacdo')).map(c=>{const p=localPlan(c);seen.add(c.customer_id||p?.customer.customer_id);return {id:c.id,name:c.name,phone:c.phone||'',customer_id:c.id,customer_name:c.name,sdt:c.phone||'',start_date:p?.customer.start_date||c.start_date,duration_days:p?.customer.duration_days||c.duration_days};});
 if(['owner','manager'].includes(user.role))for(const c of await readPlanSources())if(c.customer_id&&!seen.has(c.customer_id)){seen.add(c.customer_id);sources.push({id:'remote:'+c.customer_id,name:c.customer_name||c.customer_id,phone:c.sdt||'',customer_name:c.customer_name||c.customer_id,sdt:c.sdt||'',start_date:c.start_date,duration_days:c.duration_days,customer_id:'remote:'+c.customer_id});}
 return sources;
}
export async function getPlanSource(user,targetId,id){
 permission(user,'customers');assertCustomer(user,targetId);
 if(id===targetId)fail('Chọn học viên khác.');
 let data,tasks,canonical;
 if(String(id).startsWith('remote:')){if(!['owner','manager'].includes(user.role))fail('Bạn không có quyền đọc phác đồ nguồn này.',403);canonical=id.slice(7);}
 else {const c=get('customers',id);if(!c)fail('Không tìm thấy phác đồ nguồn.',404);assertCustomer(user,id);const p=localPlan(c);if(p?.publishedAt){canonical=p.id;}else if(p){data=p.customer;tasks=p.tasks||[];}else if(c.origin==='taophacdo')canonical=c.customer_id;}
 if(canonical){data=await readLearner(canonical);if(data){data={...data,...await readPlanProfile(canonical)};tasks=(await readLearnerActivity(canonical,data.is_customized)).tasks;}}
 if(!data)fail('Không tải được phác đồ nguồn. Vui lòng thử lại.',404);
 const target=get('customers',targetId);if(data.customer_id===(target?.planCustomerId||target?.customer_id))fail('Chọn học viên khác.');
 if(!data.is_customized)tasks=planFor(data,(await readPlanCatalog()).tasks,[]);
 const keys=['customer_id','customer_name','sdt','start_date','duration_days','video_date','ma_vd','note','chewing_status','sidebar_blocks_json','app_title','app_slogan','is_customized','require_google_auth','require_device_limit'];
 return {customer:Object.fromEntries(keys.map(k=>[k,data[k]])),tasks:(tasks||[]).filter(t=>!t.is_deleted)};
}
