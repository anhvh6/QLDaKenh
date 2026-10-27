import {all,kindsRevision,get} from './store.mjs';
import {permission} from './domain.mjs';
import {permittedChannels} from './taophacdo.mjs';
import {studyPlanStatus} from './plan-access.mjs';
import {StateCache} from './state-cache.mjs';
import {buildCustomerDirectory,directorySearch} from './customer-directory-model.mjs';
const kinds=['customers','conversations','orders','journeys','study_plans','learner_source_facts','plan_handoffs','teams','team_members','channel_teams'];
const cache=new StateCache({ttl:15000,limit:12});
export function customerDirectory(user,params=new URLSearchParams()){
 permission(user,'customers');const revision=kindsRevision(kinds),key=user.id+':'+user.role;let rows=cache.get(key,revision);
 if(!rows){
  const allowed=permittedChannels(user),source=Object.fromEntries(kinds.map(k=>[k,all(k)]));
  source.conversations=source.conversations.filter(c=>!c.deletedAt&&!c.purgePending&&(!allowed||allowed.has(c.connectionId)));
  if(allowed){const ids=new Set(source.conversations.map(c=>c.customerId));for(const c of source.conversations)if(c.threadType===1&&c.learnerCustomerId)ids.add(c.learnerCustomerId);for(const c of source.customers)if(c.createdBy===user.id)ids.add(c.id);for(const j of source.journeys)if(j.assignee===user.id)ids.add(j.customerId);source.customers=source.customers.filter(c=>ids.has(c.id));for(const kind of ['orders','journeys','study_plans','plan_handoffs'])source[kind]=source[kind].filter(r=>ids.has(r.customerId));source.learner_source_facts=source.learner_source_facts.filter(f=>ids.has(f.id));}
  const facts=new Map(source.learner_source_facts.map(f=>[f.id,f]));source.customers=source.customers.map(c=>({...c,...(facts.get(c.id)||{}),id:c.id}));
  source.chatPlanSummaries=source.study_plans.map(p=>({customerId:p.customerId,startDate:p.customer?.start_date,endDate:p.customer?.end_date,status:studyPlanStatus(p,p.lastOrderId?get('orders',p.lastOrderId):null)}));
  rows=cache.set(key,revision,buildCustomerDirectory(source));
 }
 const query=directorySearch(params.get('q')?.slice(0,200)),filtered=query?rows.filter(c=>directorySearch([c.name,c.phone,c.email,c.address,...c.groups.map(g=>g.name)].join(' ')).includes(query)):rows;
 const pageSize=50,pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),page=Math.min(pageCount,Math.max(1,Math.floor(Number(params.get('page'))||1)));
 return {rows:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize,pageCount};
}
