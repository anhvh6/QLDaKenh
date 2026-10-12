import {learnerStages,progressFor} from './learner-progress.js';
import {groupLearner} from './group-learner.js';
import {nameStatuses} from './chat-names.js';
const unique=ids=>[...new Set(ids||[])];
export function stageInfo(state,stage){
 const info=learnerStages[stage]||learnerStages.NEW,color=state.studentCareSettings?.stages?.[stage]?.color;
 return {...info,color:/^#[0-9a-f]{6}$/i.test(color||'')?color:info.color};
}
export function carePolicy(state,conversation){
 const learner=groupLearner(state,conversation)||state.customers?.find(p=>p.id===conversation.customerId);
 const stage=learner?progressFor(state,learner).stage:'NEW';
 const stagePolicy=state.studentCareSettings?.stages?.[stage];
 const personal=conversation.threadType===1?{...conversation,threadType:0,customerId:learner?.id||conversation.customerId}:conversation;
 const rules=nameStatuses(state,personal).filter(r=>r.staffConfigured===true);
 const policies=[...(stagePolicy?.staffConfigured?[stagePolicy]:[]),...rules];
 const inherited=unique(policies.flatMap(p=>p.notifyStaffIds||[]));
 const manual=conversation.notificationAssignment==='manual'||(conversation.notificationAssignment!=='stage'&&conversation.assigneeIds?.length);
 const notifyStaffIds=manual?unique(conversation.assigneeIds??(conversation.assignee?[conversation.assignee]:[])):inherited;
 return {stage,manual:Boolean(manual),configured:policies.length>0||Boolean(manual),readConfigured:policies.length>0,notifyStaffIds,readStaffIds:unique([...policies.flatMap(p=>[...(p.readStaffIds||[]),...(p.notifyStaffIds||[])]),...notifyStaffIds])};
}
export function canReadCare(state,conversation,user){
 if(['owner','manager'].includes(user.role))return true;
 const policy=carePolicy(state,conversation);
 return !policy.readConfigured||policy.readStaffIds.includes(user.id);
}
export function receivesCare(state,conversation,user){
 const policy=carePolicy(state,conversation);
 return policy.configured?policy.notifyStaffIds.includes(user.id):true;
}
