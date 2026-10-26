import {prepareLearnerLookups,cloneLearnerLookups} from '../public/learner-lookups.js';
import {createHash} from 'node:crypto';
import {all,get,put,db,audit,recordRevision,kindsRevision} from './store.mjs';
import {fail,permission} from './domain.mjs';
import {learnerStages} from '../public/learner-progress.js';
import {carePolicy,canReadCare,receivesCare,visibleCare,careTaskAccess} from '../public/student-care.js';
import {studyPlanStatus} from './plan-access.mjs';
import {reminderRecipients} from '../public/reminder-model.js';

let careSnapshot=null;
// Reuse pure permission calculations only while the complete source snapshot is unchanged.
// Task deadlines are still evaluated on every request by careTaskAccess.
const policySnapshots=new WeakMap();
function carePolicies(source){
 const cached=policySnapshots.get(source.conversations);
 if(cached&&Date.now()-cached.at<30000)return cached.policies;
 const policies=new Map(source.conversations.map(c=>[c.id,carePolicy(source,c)]));
 policySnapshots.set(source.conversations,{at:Date.now(),policies});return policies;
}
export function studentCareState(){
 const users=db.prepare('SELECT id,name,role,active FROM users').all(),revision=kindsRevision(['staff_handoffs','chat_reminders','customers','learner_source_facts','conversations','connections','orders','journeys','plan_handoffs','settings','study_plans'])+':'+JSON.stringify(users);
 if(db.isTransaction)careSnapshot=null;
 if(careSnapshot?.revision===revision)return cloneLearnerLookups(careSnapshot.state);
 const facts=new Map(all('learner_source_facts').map(f=>[f.id,f]));
 const customers=all('customers').map(c=>{const f=facts.get(c.id);if(!f)return c;const {id,version,createdAt,updatedAt,sourceUpdatedAt,...fields}=f;return {...c,...fields};});
 const state={staff_handoffs:all('staff_handoffs'),chat_reminders:all('chat_reminders'),users,customers,conversations:all('conversations'),connections:all('connections'),orders:all('orders'),journeys:all('journeys'),plan_handoffs:all('plan_handoffs'),chatNameSettings:get('settings','chat-names'),studentCareSettings:get('settings','student-care')||{version:0,stages:{}},chatPlanSummaries:all('study_plans').map(p=>({customerId:p.customerId,startDate:p.customer?.start_date,endDate:p.customer?.end_date,status:studyPlanStatus(p,get('orders',p.lastOrderId))}))};
 prepareLearnerLookups(state);if(!db.isTransaction)careSnapshot={revision,state};return cloneLearnerLookups(state);
}
export function assertCareConversation(user,c){
 // Reading/replying remains allowed through search; channel scope is checked by callers.
 // Receive/mute controls card visibility and notifications, not content access.
 if(!canReadCare(null,c,user))fail('Bạn chưa được cấp quyền đọc thông tin cho trạng thái học viên này.',403);
}
export function notifyCareMessage(conversation,message){
 if(message.direction!=='incoming'||message.history||conversation.deletedAt)return;
 const state=studentCareState(),policy=carePolicy(state,conversation);
 if(!policy.configured)return;
 for(const id of state.users.filter(u=>receivesCare(state,conversation,u,policy)).map(u=>u.id)){
  const user=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id);if(!user?.active||!['owner','manager','support'].includes(user.role))continue;
  if(user.role==='support'){const teams=new Set(all('team_members').filter(m=>m.userId===id).map(m=>m.teamId));if(!all('channel_teams').some(m=>m.connectionId===conversation.connectionId&&teams.has(m.teamId)))continue;}
  const notificationId='care-message:'+message.id+':'+id;if(get('notifications',notificationId))continue;
  put('notifications',{id:notificationId,recipientId:id,conversationId:conversation.id,messageId:message.id,title:(conversation.kind==='comment'?'Bình luận mới · ':'Tin nhắn mới · ')+(conversation.threadType===1?conversation.title||conversation.group?.name||'Nhóm':get('customers',conversation.customerId)?.name||'Khách hàng'),body:String(message.text||'Khách gửi tệp hoặc hình ảnh').slice(0,350),route:conversation.kind==='comment'?'comments':'inbox',read:false});
 }
}
export function staffIds(input,label){
 if(!Array.isArray(input)||input.length>100||input.some(id=>typeof id!=='string'))fail('Danh sách '+label+' không hợp lệ.');
 for(const id of input){const user=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id);if(!user?.active||!['owner','manager','support'].includes(user.role))fail('Nhân viên không có quyền chăm sóc.');}
 return [...new Set(input)];
}
export function validateCareStaff(input){
 const permissions=input.staffPermissions||{};
 if(typeof permissions!=='object'||Array.isArray(permissions)||Object.keys(permissions).length>100)fail('Quyền nhân viên không hợp lệ.');
 staffIds(Object.keys(permissions),'nhân viên');
 const staffPermissions={};for(const [id,p] of Object.entries(permissions)){if(!p||typeof p.receive!=='boolean'||typeof p.mute!=='boolean')fail('Quyền nhân viên không hợp lệ.');staffPermissions[id]={receive:p.receive,mute:!p.receive||p.mute};}
 return {staffPermissions};
}
export function filterCareNotifications(rows,user,source=studentCareState(),policies=new Map()){
 const conversations=new Map(source.conversations.map(c=>[c.id,c])),access=new Map();
 return rows.filter(n=>{if(n.recipientId&&n.recipientId!==user.id)return false;if(!n.conversationId)return true;
  if(n.reminderId){const r=(source.chat_reminders||[]).find(r=>r.id===n.reminderId);const c=conversations.get(n.conversationId);if(c&&!c.deletedAt&&r?.conversationId===c.id&&reminderRecipients(r).includes(user.id))return true;}
  if(!access.has(n.conversationId)){const c=conversations.get(n.conversationId);access.set(n.conversationId,!!c&&!c.deletedAt&&canReadCare(source,c,user)&&receivesCare(source,c,user,policies.get(c.id)||carePolicy(source,c)));}
  return access.get(n.conversationId);
 });
}
function exceptionPreview(stages,previous,includeAll=false,source=studentCareState(),policies=new Map()){
 const rows=[];
 for(const c of source.conversations){if(c.deletedAt||!Object.keys(c.carePermissions||{}).length)continue;const stage=(policies.get(c.id)||carePolicy(source,c)).stage;
 if(includeAll||JSON.stringify(stages[stage])!==JSON.stringify(previous?.stages?.[stage])){
  if(!stages[stage])continue;
  for(const [id,p] of Object.entries(c.carePermissions||{})){const u=source.users.find(u=>u.id===id&&u.active);if(u)rows.push({stage,stageName:learnerStages[stage].name,employee:u.name,employeeId:id,conversationId:c.id,conversationVersion:c.version,customer:c.threadType===1?c.title||c.group?.name||'Nhóm':source.customers.find(x=>x.id===c.customerId)?.name||'Khách hàng',receive:p.receive,mute:!p.receive||p.mute});}
 }
 }
 rows.sort((a,b)=>a.stage.localeCompare(b.stage)||a.employee.localeCompare(b.employee)||a.customer.localeCompare(b.customer));
 return {rows,exceptionToken:createHash('sha256').update(JSON.stringify({version:previous?.version||0,stages,rows})).digest('hex')};
}
export function scopeCareChats(state,user,{includeExceptions=true}={}){
 const source=studentCareState();
 const policies=carePolicies(source);
 if(includeExceptions&&user.role==='owner')state.careExceptions=exceptionPreview(Object.fromEntries(Object.keys(learnerStages).map(k=>[k,{}])),source.studentCareSettings,true,source,policies).rows;
 if(Array.isArray(state.notifications))state.notifications=filterCareNotifications(state.notifications,user,source,policies);
 state.notificationConversationIds=state.conversations.filter(c=>receivesCare(source,c,user,policies.get(c.id))).map(c=>c.id);
 state.conversationCare=state.conversations.map(c=>({id:c.id,...policies.get(c.id)}));
 state.conversations=state.conversations.map(c=>({...c,careHidden:!visibleCare(source,c,user,policies.get(c.id)),careTaskPrompt:!policies.get(c.id).staffPermissions[user.id]?.receive&&careTaskAccess(source,c,user).prompt}));
 const ids=new Set(state.conversations.map(c=>c.id));
 state.messages=state.messages.filter(m=>ids.has(m.conversationId));
 state.conversationCare=state.conversationCare.filter(c=>ids.has(c.id));
 state.notificationConversationIds=state.notificationConversationIds.filter(id=>ids.has(id));
 for(const key of ['staffHandoffs','chatMentions','chatbotRuns','chat_reminders','consultation_reviews','template_runs'])if(Array.isArray(state[key]))state[key]=state[key].filter(r=>ids.has(r.conversationId));
 if(Array.isArray(state.chatbotConversations))state.chatbotConversations=state.chatbotConversations.filter(c=>ids.has(c.id));
 return state;
}
export async function studentCareRoute(path,method,input,user){
 if(path==='/api/chat/student-care-exceptions'){
  permission(user,'inbox');if(user.role!=='owner')fail('Chỉ chủ hệ thống được sửa ngoại lệ.',403);
  if(method==='GET'){const source=studentCareState();return exceptionPreview(Object.fromEntries(Object.keys(learnerStages).map(k=>[k,{}])),source.studentCareSettings,true).rows;}
  if(method==='PATCH'){
   const c=get('conversations',input.conversationId);if(!c||c.deletedAt)fail('Không tìm thấy hội thoại.',404);
   if(input.version!==c.version)fail('Hội thoại đã thay đổi. Hãy tải lại.',409);
   staffIds([input.employeeId],'nhân viên');const permissions={...c.carePermissions};
   if(input.reset===true)delete permissions[input.employeeId];else permissions[input.employeeId]=validateCareStaff({staffPermissions:{[input.employeeId]:input.permission}}).staffPermissions[input.employeeId];
   const result=put('conversations',{...c,carePermissions:permissions},c.version);audit(user.id,'care_exception_updated',c.id,{employeeId:input.employeeId});return result;
  }
 }

 if(!((path==='/api/chat/student-care-settings'&&method==='PUT')||(path==='/api/chat/student-care-settings/preview'&&method==='POST')))return;
 permission(user,'inbox');if(user.role!=='owner')fail('Chỉ chủ hệ thống được cấu hình trạng thái học viên.',403);
 const previous=get('settings','student-care');if(input.version!==(previous?.version||0))fail('Cấu hình đã thay đổi. Hãy tải lại.',409);
 if(!input.stages||typeof input.stages!=='object'||Array.isArray(input.stages)||Object.keys(input.stages).some(key=>!learnerStages[key]))fail('Tiến trình không hợp lệ.');
 const stages={};for(const [key,p] of Object.entries(input.stages)){if(!p||!/^#[0-9a-f]{6}$/i.test(p.color||''))fail('Màu tiến trình không hợp lệ.');stages[key]={color:p.color,...validateCareStaff(p)};}
 const preview=exceptionPreview(stages,previous);
 if(method==='POST')return preview;
 if(preview.rows.length&&input.exceptionToken!==preview.exceptionToken)fail('Có ngoại lệ đang áp dụng. Hãy xem bảng xác nhận trước khi lưu lại.',409);
 const result=put('settings',{id:'student-care',stages},previous?.version);audit(user.id,'student_care_settings_updated',result.id);return result;
}
