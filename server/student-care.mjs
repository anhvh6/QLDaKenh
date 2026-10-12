import {all,get,put,db,audit} from './store.mjs';
import {fail,permission} from './domain.mjs';
import {learnerStages} from '../public/learner-progress.js';
import {carePolicy,canReadCare,receivesCare} from '../public/student-care.js';
import {studyPlanStatus} from './plan-access.mjs';

export function studentCareState(){
 return {customers:all('customers'),conversations:all('conversations'),connections:all('connections'),orders:all('orders'),journeys:all('journeys'),plan_handoffs:all('plan_handoffs'),chatNameSettings:get('settings','chat-names'),studentCareSettings:get('settings','student-care')||{version:0,stages:{}},chatPlanSummaries:all('study_plans').map(p=>({customerId:p.customerId,startDate:p.customer?.start_date,endDate:p.customer?.end_date,status:studyPlanStatus(p,get('orders',p.lastOrderId))}))};
}
export function assertCareConversation(user,c){
 if(['owner','manager'].includes(user.role))return;
 if(!canReadCare(studentCareState(),c,user))fail('Bạn chưa được cấp quyền đọc thông tin cho trạng thái học viên này.',403);
}
export function notifyCareMessage(conversation,message){
 if(message.direction!=='incoming'||message.history||conversation.deletedAt)return;
 const state=studentCareState(),policy=carePolicy(state,conversation);
 if(!policy.configured)return;
 for(const id of policy.notifyStaffIds){
  const user=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id);if(!user?.active||!['owner','manager','support'].includes(user.role))continue;
  if(user.role==='support'){const teams=new Set(all('team_members').filter(m=>m.userId===id).map(m=>m.teamId));if(!all('channel_teams').some(m=>m.connectionId===conversation.connectionId&&teams.has(m.teamId)))continue;}
  const notificationId='care-message:'+message.id+':'+id;if(get('notifications',notificationId))continue;
  put('notifications',{id:notificationId,recipientId:id,conversationId:conversation.id,messageId:message.id,title:'Tin nhắn mới · '+(conversation.threadType===1?conversation.title||conversation.group?.name||'Nhóm':get('customers',conversation.customerId)?.name||'Khách hàng'),body:String(message.text||'Khách gửi tệp hoặc hình ảnh').slice(0,350),route:'inbox',read:false});
 }
}
export function staffIds(input,label){
 if(!Array.isArray(input)||input.length>100||input.some(id=>typeof id!=='string'))fail('Danh sách '+label+' không hợp lệ.');
 for(const id of input){const user=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id);if(!user?.active||!['owner','manager','support'].includes(user.role))fail('Nhân viên không có quyền chăm sóc.');}
 return [...new Set(input)];
}
export function validateCareStaff(input){
 if(input.staffConfigured!==undefined&&typeof input.staffConfigured!=='boolean')fail('Cấu hình nhân viên không hợp lệ.');
 return {staffConfigured:input.staffConfigured===true,notifyStaffIds:staffIds(input.notifyStaffIds||[],'nhận thông tin'),readStaffIds:staffIds(input.readStaffIds||[],'đọc thông tin')};
}
export function scopeCareChats(state,user){
 const source=studentCareState();
 if(Array.isArray(state.notifications))state.notifications=state.notifications.filter(n=>!n.recipientId||n.recipientId===user.id);
 state.notificationConversationIds=state.conversations.filter(c=>receivesCare(source,c,user)).map(c=>c.id);
 state.conversationCare=state.conversations.map(c=>({id:c.id,...carePolicy(source,c)}));
 state.conversations=state.conversations.filter(c=>canReadCare(source,c,user));
 const ids=new Set(state.conversations.map(c=>c.id));
 state.messages=state.messages.filter(m=>ids.has(m.conversationId));
 state.conversationCare=state.conversationCare.filter(c=>ids.has(c.id));
 state.notificationConversationIds=state.notificationConversationIds.filter(id=>ids.has(id));
 for(const key of ['staffHandoffs','chatMentions','chatbotRuns','chat_reminders','consultation_reviews','template_runs'])if(Array.isArray(state[key]))state[key]=state[key].filter(r=>ids.has(r.conversationId));
 if(Array.isArray(state.chatbotConversations))state.chatbotConversations=state.chatbotConversations.filter(c=>ids.has(c.id));
 return state;
}
export async function studentCareRoute(path,method,input,user){
 if(path!=='/api/chat/student-care-settings'||method!=='PUT')return;
 permission(user,'inbox');if(user.role!=='owner')fail('Chỉ chủ hệ thống được cấu hình trạng thái học viên.',403);
 const previous=get('settings','student-care');if(input.version!==(previous?.version||0))fail('Cấu hình đã thay đổi. Hãy tải lại.',409);
 if(!input.stages||typeof input.stages!=='object'||Array.isArray(input.stages)||Object.keys(input.stages).some(key=>!learnerStages[key]))fail('Tiến trình không hợp lệ.');
 const stages={};for(const [key,p] of Object.entries(input.stages)){if(!p||!/^#[0-9a-f]{6}$/i.test(p.color||''))fail('Màu tiến trình không hợp lệ.');stages[key]={color:p.color,...validateCareStaff(p)};}
 const result=put('settings',{id:'student-care',stages},previous?.version);audit(user.id,'student_care_settings_updated',result.id);return result;
}
