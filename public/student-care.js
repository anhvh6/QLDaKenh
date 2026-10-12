import {learnerStages,progressFor} from './learner-progress.js';
import {groupLearner} from './group-learner.js';
import {nameStatuses} from './chat-names.js';
export function normalizeCarePermission(p){return {receive:p?.receive!==false,mute:p?.receive===false||p?.mute===true};}
export function stageInfo(state,stage){const info=learnerStages[stage]||learnerStages.NEW,color=state.studentCareSettings?.stages?.[stage]?.color;return {...info,color:/^#[0-9a-f]{6}$/i.test(color||'')?color:info.color};}
export function carePolicy(state,c){
 const learner=groupLearner(state,c)||state.customers?.find(p=>p.id===c.customerId),stage=learner?progressFor(state,learner).stage:'NEW';
 const personal=c.threadType===1?{...c,threadType:0,customerId:learner?.id||c.customerId}:c;
 const policies=[state.studentCareSettings?.stages?.[stage],...nameStatuses(state,personal).filter(r=>r.staffPermissions)];
 const inheritedPermissions={},staffPermissions={};
 const ids=new Set([...(state.users||[]).filter(u=>u.active!==false&&u.active!==0&&['owner','manager','support'].includes(u.role)).map(u=>u.id),...policies.flatMap(p=>Object.keys(p?.staffPermissions||{})),...Object.keys(c.carePermissions||{})]);
 for(const id of ids){let p=normalizeCarePermission();for(const policy of policies)if(policy?.staffPermissions?.[id])p=normalizeCarePermission(policy.staffPermissions[id]);inheritedPermissions[id]=p;staffPermissions[id]=normalizeCarePermission(c.carePermissions?.[id]||p);}
 return {stage,configured:true,manual:Object.keys(c.carePermissions||{}).length>0,inheritedPermissions,staffPermissions,notifyStaffIds:[...ids].filter(id=>staffPermissions[id].receive&&!staffPermissions[id].mute),readStaffIds:[...ids].filter(id=>staffPermissions[id].receive)};
}
export function canReadCare(state,c,user){return normalizeCarePermission(carePolicy(state,c).staffPermissions[user.id]).receive;}
export function receivesCare(state,c,user){const p=normalizeCarePermission(carePolicy(state,c).staffPermissions[user.id]);return p.receive&&!p.mute;}
