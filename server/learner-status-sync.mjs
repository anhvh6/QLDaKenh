import {all,get,put} from './store.mjs';
import {readLearnerStatuses} from './supabase.mjs';
let lastCheck=0,inflight=null;
// Only authoritative source statuses are refreshed; network failures never mark a learner deleted.
export async function refreshLearnerStatuses(){
 if(process.env.PLAN_REMOTE_CATALOG==='0'||Date.now()-lastCheck<30000)return;
 if(inflight)return inflight;
 const plans=new Map(all('study_plans').filter(p=>p.publishedAt).map(p=>[p.customerId,p.id]));const linked=all('customers').filter(c=>c.origin==='taophacdo'||plans.has(c.id)).map(c=>({c,key:c.planCustomerId||c.customer_id||plans.get(c.id)})).filter(r=>r.key);if(!linked.length)return;
 inflight=(async()=>{try{const rows=await readLearnerStatuses(),byId=new Map(rows.map(r=>[r.customer_id,r]));for(const {c,key} of linked){const source=byId.get(key),old=get('learner_source_facts',c.id)||{id:c.id},status=source?(source.status||'ACTIVE'):'DELETED',learnerDeleted=!source||String(status).toUpperCase()==='DELETED';if(old.status!==status||old.learnerDeleted!==learnerDeleted)put('learner_source_facts',{...old,status,learnerDeleted,statusCheckedAt:new Date().toISOString()});}lastCheck=Date.now();}catch{lastCheck=Date.now();}finally{inflight=null;}})();return inflight;
}
