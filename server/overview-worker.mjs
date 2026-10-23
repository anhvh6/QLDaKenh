import {getSupabaseHeaders,SUPABASE_URL,all} from './store.mjs';
import {planProducts} from './product-catalog.mjs';
import {computeLearnerOverview,learnerOverviewColumns} from './overview-source.mjs';
export async function refreshLearnerOverview(store){
 if(process.env.PLAN_REMOTE_CATALOG==='0')return;
 return store.refresh('learners:v1',async()=>{
  const headers=await getSupabaseHeaders();
  return computeLearnerOverview(async(offset,limit)=>{
   const response=await fetch(SUPABASE_URL+'/rest/v1/customers?select='+learnerOverviewColumns+'&order=customer_id.asc&offset='+offset+'&limit='+limit,{headers,signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error('Nguồn số liệu học viên HTTP '+response.status);return response.json();
  },planProducts(all('products'),{includeInactive:true}));
 },{minInterval:60000});
}
