import {prepareLearnerLookups} from '../public/learner-lookups.js';
import {progressFor,learnerStages} from '../public/learner-progress.js';
const text=(...values)=>values.find(v=>typeof v==='string'&&v.trim())?.trim()||'';
export const directorySearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
export function buildCustomerDirectory(source){
 const customers=new Map(source.customers.filter(c=>!c.mergedInto&&!c.deletedAt&&!c.purgePending).map(c=>[c.id,c]));
 const orders=new Map(),plans=new Set((source.study_plans||[]).map(p=>p.customerId)),facts=new Set((source.learner_source_facts||[]).filter(f=>f.sourceUpdatedAt||f.hasEffectivePlan||f.status).map(f=>f.id));
 for(const h of source.plan_handoffs||[])if(h.customerId)plans.add(h.customerId);
 for(const o of source.orders||[]){const summary=orders.get(o.customerId)||{count:0,paid:0};summary.count++;summary.paid+=Number(o.paid)||0;orders.set(o.customerId,summary);}
 const details=new Map((source.study_plans||[]).map(p=>[p.customerId,p.customer||{}]));
 const phone=c=>text(c.phone,c.sdt,c.learnerRegistration?.sdt,details.get(c.id)?.sdt),address=c=>text(c.address,c.dia_chi,c.learnerRegistration?.dia_chi,details.get(c.id)?.dia_chi);
 const hasPlan=c=>source.remoteLearnerIds?.has(c.id)||(!(c.learnerDeleted||c.status==='DELETED')&&(c.origin==='taophacdo'||plans.has(c.id)||facts.has(c.id)));
 const deposit=c=>c.is_deposit===true||c.learnerRegistration?.is_deposit===true||Number(c.deposit_amount)>0||Number(c.learnerRegistration?.deposit_amount)>0||['DEPOSIT','PAID'].includes(c.learnerProgress?.stage);
 const eligible=c=>!!(phone(c)||address(c)||orders.has(c.id)||hasPlan(c)||deposit(c));
 const statusIds=new Set((source.journeys||[]).filter(j=>j.stage&&!['NEW','MOI'].includes(j.stage)).map(j=>j.customerId));
 const hasStatus=c=>statusIds.has(c.id)||!!(learnerStages[c.learnerProgress?.stage]&&c.learnerProgress.stage!=='NEW');
 const personalIds=new Set(),groupIds=new Set(),contacts=new Map();
 for(const c of source.conversations||[]){if(c.deletedAt||c.purgePending)continue;if(c.threadType===1){groupIds.add(c.customerId);continue;}personalIds.add(c.customerId);if(c.kind==='comment')continue;const key=JSON.stringify([c.connectionId,String(c.externalUserId)]),list=contacts.get(key)||[];list.push(c);contacts.set(key,list);}
 const included=new Set([...customers.values()].filter(c=>eligible(c)&&(!groupIds.has(c.id)||personalIds.has(c.id)||hasPlan(c))).map(c=>c.id)),groups=new Map();
 for(const group of source.conversations||[]){
  if(group.threadType!==1||group.deletedAt||group.purgePending)continue;
  const members=new Set([...(group.group?.memberIds||[]),...(group.group?.members||[]).map(m=>m.id)].map(String));members.delete(String(group.group?.ownId));
  const candidates=[...new Set([...members].flatMap(id=>(contacts.get(JSON.stringify([group.connectionId,id]))||[]).map(c=>c.customerId)))].map(id=>customers.get(id)).filter(Boolean);
  if(group.learnerCustomerId&&customers.has(group.learnerCustomerId)&&!candidates.some(c=>c.id===group.learnerCustomerId))candidates.unshift(customers.get(group.learnerCustomerId));
  const own=String(group.group?.ownId),staff=new Set((group.group?.members||[]).filter(m=>['owner','admin'].includes(m.role)).map(m=>String(m.id)));
  const contactIds=customer=>[...members].filter(member=>(contacts.get(JSON.stringify([group.connectionId,member]))||[]).some(c=>c.customerId===customer.id));
  const qualified=candidates.filter(c=>(eligible(c)||hasStatus(c))&&!contactIds(c).includes(own)&&(!contactIds(c).some(id=>staff.has(id))||hasPlan(c)||hasStatus(c)||group.learnerAssignmentSource==='manual'&&c.id===group.learnerCustomerId));
  const selected=group.learnerAssignmentSource==='manual'?qualified.find(c=>c.id===group.learnerCustomerId):null;
  const ownProfile=customers.get(group.customerId),profile=ownProfile&&(hasPlan(ownProfile)||hasStatus(ownProfile))?ownProfile:null;
  const strong=qualified.filter(c=>hasPlan(c)||hasStatus(c));
  const groupName=directorySearch(group.title||group.group?.name||ownProfile?.name||'');
  const named=qualified.filter(c=>{const name=directorySearch(c.name).trim();return name.length>=4&&(groupName===name||groupName.startsWith(name+' -')||groupName.startsWith(name+' |'));});
  const representative=selected||profile||(strong.length===1?strong[0]:null)||(named.length===1?named[0]:null);

  if(!representative)continue;included.add(representative.id);const rows=groups.get(representative.id)||[];rows.push({id:group.id,name:group.title||group.group?.name||customers.get(group.customerId)?.name||'Nhóm'});groups.set(representative.id,rows);
 }
 const state=prepareLearnerLookups({...source,chatPlanSummaries:source.chatPlanSummaries||[]});
 return [...included].map(id=>{const c=customers.get(id),summary=orders.get(id),stage=progressFor(state,c).stage;return {id,name:c.name||'Khách hàng',phone:phone(c),address:address(c),email:text(c.email,c.learnerRegistration?.email,details.get(c.id)?.email),tags:Array.isArray(c.tags)?c.tags:[],stage,stageName:learnerStages[stage]?.name||'Khách hàng',orderCount:summary?.count||0,paidTotal:summary?.paid||0,groups:groups.get(id)||[]};}).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
}
