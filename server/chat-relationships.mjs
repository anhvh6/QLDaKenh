import {all,get,put,transaction} from './store.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {progressFor} from '../public/learner-progress.js';
import {groupLearner} from '../public/group-learner.js';
const readable=(user,c)=>{try{assertChannel(user,c.connectionId);return !c.deletedAt&&!c.groupUnavailable;}catch{return false;}};
export function commonGroups(user,customerId){
 const rows=all('conversations').filter(c=>readable(user,c)),contacts=rows.filter(c=>c.customerId===customerId&&c.threadType!==1&&c.externalUserId);
 const groups=rows.filter(c=>c.threadType===1&&contacts.some(p=>p.connectionId===c.connectionId&&((p.commonGroupIds||[]).includes(String(c.externalUserId))||(c.group?.memberIds||[]).map(String).includes(String(p.externalUserId))||(c.group?.members||[]).some(m=>String(m.id)===String(p.externalUserId)))));
 return groups.map(c=>({id:c.id,name:(c.localGroupName?c.title:c.group?.name||c.title)||(c.customerId?get('customers',c.customerId):null)?.name||'Nhóm',avatar:c.group?.avatar||(c.customerId?get('customers',c.customerId):null)?.zaloAvatar||'',memberCount:c.group?.memberCount||c.group?.members?.length||0}));
}
export function groupMembers(user,id){permission(user,'inbox');const c=get('conversations',id);if(!c||c.threadType!==1||!readable(user,c))fail('Không có quyền xem nhóm này.',403);
 const contacts=all('conversations').filter(p=>p.connectionId===c.connectionId&&p.threadType!==1&&!p.deletedAt),state={journeys:all('journeys'),orders:all('orders'),chatPlanSummaries:all('study_plans').map(p=>({customerId:p.customerId,startDate:p.customer?.start_date,endDate:p.customer?.end_date,status:p.customer?.status}))};
 return {conversationId:c.id,name:(c.localGroupName?c.title:c.group?.name||c.title)||(c.customerId?get('customers',c.customerId):null)?.name||'Nhóm',memberCount:c.group?.memberCount||c.group?.members?.length||0,needsSync:!c.group?.members?.length||!!c.groupNeedsSync,members:(c.group?.members||[]).map(m=>{const contact=contacts.find(p=>String(p.externalUserId)===String(m.id)),p=contact&&get('customers',contact.customerId);return {id:String(m.id),name:p?.name||m.name||String(m.id),avatar:p?.zaloAvatar||p?.avatar||m.avatar||'',conversationId:contact?.id||'',customerId:p?.id||'',stage:p?progressFor(state,p).stage:'NEW'};})};
}
function memberConversation(data,member){if(member.conversationId)return get('conversations',member.conversationId);const c=get('conversations',data.conversationId),p=put('customers',{name:member.name,zaloAvatar:member.avatar,origin:'zalo',tags:[]});return put('conversations',{customerId:p.id,connectionId:c.connectionId,externalUserId:member.id,threadType:0,kind:'message',status:'open',tags:[],mode:c.mode||'api',unread:false,lastAt:'1970-01-01T00:00:00.000Z',lastMessage:''});}
export function relationshipsRoute(path,method,input,user){
 const m=path.match(/^\/api\/care\/conversations\/([^/]+)\/relationships(?:\/(open-member|learner))?$/);if(!m)return;const data=groupMembers(user,m[1]),c=get('conversations',m[1]);
 if(!m[2]&&method==='GET'){const p=groupLearner({customers:all('customers'),conversations:all('conversations')},c);return {...data,learnerCustomerId:p?.id||'',learnerMemberId:c.learnerMemberId||data.members.find(m=>m.customerId===p?.id)?.id||''};}
 if(m[2]==='open-member'&&method==='POST'){const member=data.members.find(p=>p.id===String(input.memberId));if(!member)fail('Thành viên chưa có trong danh sách nhóm.');return transaction(()=>memberConversation(data,member));}
 if(m[2]==='learner'&&method==='POST'){
  if(input.version!==undefined&&input.version!==c.version)fail('Nhóm đã thay đổi. Mở lại hồ sơ.',409);
  const existing=groupLearner({customers:all('customers'),conversations:all('conversations')},c),contacts=all('conversations').filter(v=>v.connectionId===c.connectionId&&v.threadType!==1&&!v.deletedAt);
  const candidates=data.members.filter(m=>m.id!==String(c.group?.ownId));const member=input.memberId?data.members.find(m=>m.id===String(input.memberId)):(c.learnerCustomerId?candidates.find(m=>m.customerId===c.learnerCustomerId):null)||(contacts.some(v=>v.customerId===existing?.id&&v.isFriend!==true)?candidates.find(m=>m.customerId===existing.id):null)||candidates.find(m=>!contacts.some(v=>String(v.externalUserId)===m.id&&v.isFriend===true))||candidates.find(m=>m.customerId===existing?.id)||candidates[0];
  if(!member)fail('Đồng bộ thành viên nhóm trước khi chọn học viên.');
  return transaction(()=>{const person=memberConversation(data,member);if(c.learnerCustomerId!==person.customerId||c.learnerMemberId!==member.id)put('conversations',{...c,learnerCustomerId:person.customerId,learnerMemberId:member.id},c.version);return {...groupMembers(user,c.id),learnerCustomerId:person.customerId,learnerMemberId:member.id};});
 }
}
