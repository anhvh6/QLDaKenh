import {progressState} from './consultation-review.mjs';
import {progressFor,stageRank} from '../public/learner-progress.js';
import {groupLearner} from '../public/group-learner.js';
import {all,get,put,db,audit,now,transaction} from './store.mjs';
import {permission,fail,required,reply} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {createNativeReminder} from './zalo.mjs';
import {reminderRecipients} from '../public/reminder-model.js';

function notifyRecipients(r,event,title,body){
 const c=get('conversations',r.conversationId);if(!c||c.deletedAt)return;
 for(const id of reminderRecipients(r)){const u=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id);if(!u?.active)continue;try{permission(u,'inbox');assertChannel(u,c.connectionId);}catch{continue;}
 put('notifications',{id:event==='due'&&id===r.assignee?'chat-reminder:'+r.id:'chat-reminder:'+event+':'+r.id+':'+id,title,body,route:'inbox',conversationId:c.id,reminderId:r.id,recipientId:id,read:false});}
}
export function closeReminderTasks(id){for(const t of all('staff_handoffs').filter(t=>t.reminderId===id&&t.status!=='resolved'))put('staff_handoffs',{...t,status:'resolved',resolvedAt:now(),completedAt:now()});}
function upcomingStaffAlert(r){if(r.staffAdvanceAlertedAt)return;const name=get('customers',r.customerId)?.name||'Khách hàng',time=new Date(r.dueAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});transaction(()=>{notifyRecipients(r,'advance','Sắp đến giờ call cho khách',name+' · Giờ call: '+time);put('chat_reminders',{...get('chat_reminders',r.id),staffAdvanceAlertedAt:now()});});}

export async function createChatReminder(user,c,input,platform=createNativeReminder){
 const due=Date.parse(input.dueAt);if(!Number.isFinite(due)||due<=Date.now())fail('Chọn thời gian nhắc trong tương lai.');
 const ids=input.assigneeIds??[input.assignee||user.id];if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'))fail('Chọn ít nhất một nhân viên nhận thông báo.');
 const assigneeIds=[...new Set(ids)],assignee=assigneeIds[0];for(const id of assigneeIds){const u=db.prepare('SELECT id,role FROM users WHERE id=? AND active=1').get(id);if(!u)fail('Nhân viên không tồn tại.');permission(u,'inbox');assertChannel(u,c.connectionId);}
 const learner=groupLearner({customers:all('customers').map(p=>({...p,...(get('learner_source_facts',p.id)||{}),id:p.id})),conversations:all('conversations')},c);
 const title=required(input.title,'Nội dung nhắc',500),ch=get('connections',c.connectionId);
 const enabled=input.customerReminder===true,minutes=Number(input.reminderMinutes||15),reminderText=String(input.reminderText||'').trim();
 if(!Number.isInteger(minutes)||minutes<1||minutes>10080)fail('Thời gian nhắc khách phải là số nguyên từ 1 đến 10080 phút.');
 if(enabled){if(!reminderText||reminderText.length>2000)fail('Nhập nội dung nhắc khách (tối đa 2000 ký tự).');if(due-minutes*60000<=Date.now())fail('Thời điểm gửi nhắc khách phải ở tương lai.');if(!['facebook','zalo_personal','zalo'].includes(ch?.provider))fail('Kênh này chưa hỗ trợ tự động gửi tin nhắn cho khách.');}
 let r=transaction(()=>{const r=put('chat_reminders',{conversationId:c.id,customerId:learner?.id||c.customerId,connectionId:c.connectionId,title,phone:String(input.phone||learner?.phone||(c.customerId?get('customers',c.customerId)?.phone:'')||'').slice(0,50),dueAt:new Date(due).toISOString(),assignee,actor:user.id,status:'pending',platformStatus:input.platform?'creating':'not_requested',customerReminder:enabled,reminderMinutes:minutes,reminderText,customerReminderAt:new Date(due-minutes*60000).toISOString(),customerReminderStatus:enabled?'pending':'disabled'});
 const saved=put('chat_reminders',{...r,assigneeIds});for(const id of assigneeIds)put('staff_handoffs',{id:'appointment:'+r.id+':'+id,source:'mention',taskType:'appointment',reminderId:r.id,conversationId:c.id,customerId:r.customerId,connectionId:c.connectionId,assignedStaffId:id,actor:user.id,dueAt:r.dueAt,reason:title,status:'open',questions:[]});notifyRecipients(saved,'created','Lịch call mới', (learner?.name||'Khách hàng')+' · '+title+' · '+new Date(due).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}));return saved;});
 put('settings',{id:'chat-reminder-defaults-'+user.id,enabled,minutes,text:reminderText});
 if(input.platform){
  if(ch?.provider!=='zalo_personal'||ch.mode!=='api'||!c.externalUserId)r=put('chat_reminders',{...get('chat_reminders',r.id),platformStatus:'unsupported',platformError:'Kênh này chưa hỗ trợ nhắc hẹn trên nền tảng; đã lưu nhắc trong hệ thống.'});
  else try{const result=await platform(c.connectionId,c.externalUserId,c.threadType,title,due);if(!result?.id&&!result?.reminderId)throw new Error('Zalo không trả mã lịch hẹn. Chưa xác nhận lịch đã tạo; kiểm tra trên Zalo trước khi thử lại.');r=put('chat_reminders',{...get('chat_reminders',r.id),platformStatus:'created',platformId:String(result?.id||result?.reminderId||'')});}catch(error){r=put('chat_reminders',{...get('chat_reminders',r.id),platformStatus:'failed',platformError:platformFailure(error),platformErrorCode:error?.code??null});}
 }
 const customerId=learner?.id||c.customerId;if(customerId)transaction(()=>{const latest=get('customers',customerId);if(!latest)return;const facts=get('learner_source_facts',customerId)||{},state=progressState();state.chat_reminders=state.chat_reminders.filter(x=>x.id!==r.id);const current=progressFor(state,{...latest,...facts,id:latest.id});if(stageRank(current.stage)>stageRank('APPOINTMENT'))return;put('customers',{...latest,learnerProgress:{...latest.learnerProgress,stage:'APPOINTMENT',appointmentAt:r.dueAt,source:'reminder',manualOverride:true,planOverride:false,...(current.source==='deleted'?{deletedResetAt:facts.statusCheckedAt||''}:{}),updatedAt:now(),updatedBy:user.id}},latest.version);if(current.stage!=='APPOINTMENT')put('journey_events',{customerId:latest.id,from:current.stage,to:'APPOINTMENT',actor:user.id,source:'chat_reminder',reminderId:r.id});});
 audit(user.id,'chat_reminder_created',r.id,{platformStatus:r.platformStatus});return r;
}
let customerTickRunning=false;
export async function customerReminderTick(time=Date.now(),send=reply){
 if(customerTickRunning)return;customerTickRunning=true;
 try{for(const r of all('chat_reminders').filter(r=>r.status==='pending'&&r.customerReminder&&r.customerReminderStatus==='pending'&&Date.parse(r.customerReminderAt)<=time)){
  if(Date.parse(r.dueAt)<=time){put('chat_reminders',{...r,customerReminderStatus:'skipped',customerReminderError:'Đã qua giờ hẹn; không gửi nhắc muộn.'});continue;}
  upcomingStaffAlert(r);
  try{
   const c=r.conversationId?get('conversations',r.conversationId):null,user=r.actor?db.prepare('SELECT id,role,active FROM users WHERE id=?').get(r.actor):null;
   if(!c||c.deletedAt||!user?.active)fail('Hội thoại hoặc nhân viên tạo lịch không còn hoạt động.');permission(user,'inbox');assertChannel(user,c.connectionId);
   // Persist before the external call. A restart must never send the same reminder twice.
   put('chat_reminders',{...get('chat_reminders',r.id),customerReminderStatus:'sending'});
   const msg=await send(user,c.id,{text:r.reminderText,version:c.version});
   put('chat_reminders',{...get('chat_reminders',r.id),customerReminderStatus:'sent',customerReminderMessageId:msg.id,customerReminderSentAt:now()});
  }catch(error){put('chat_reminders',{...get('chat_reminders',r.id),customerReminderStatus:error.unknown?'unknown':'failed',customerReminderError:error.message});put('notifications',{id:'chat-reminder-error:'+r.id,title:'Không gửi được nhắc hẹn cho khách',body:error.message,route:'inbox',conversationId:r.conversationId,recipientId:r.actor,read:false});}
 }}finally{customerTickRunning=false;}
}
export function recoverCustomerReminders(){for(const r of all('chat_reminders').filter(r=>r.customerReminderStatus==='sending')){put('chat_reminders',{...r,customerReminderStatus:'unknown',customerReminderError:'Máy chủ khởi động lại lúc gửi; kiểm tra hội thoại trước khi gửi lại.'});put('notifications',{id:'chat-reminder-error:'+r.id,title:'Cần kiểm tra nhắc hẹn',body:'Máy chủ khởi động lại lúc gửi nhắc khách. Kiểm tra hội thoại trước khi gửi lại.',route:'inbox',conversationId:r.conversationId,recipientId:r.actor,read:false});}}
export function reminderTick(time=Date.now()){
 for(const t of all('staff_handoffs').filter(t=>t.taskType==='appointment'&&t.status!=='resolved')){const r=get('chat_reminders',t.reminderId);if(!r||r.status!=='pending'||Date.parse(r.dueAt)<=time)closeReminderTasks(t.reminderId);}
 return transaction(()=>{let count=0;for(const r of all('chat_reminders').filter(r=>r.status==='pending'&&!r.alertedAt&&Date.parse(r.dueAt)<=time)){
  notifyRecipients(r,'due','Đến giờ nhắc hẹn',r.title);
  put('chat_reminders',{...r,alertedAt:now()});count++;
 }return count;});
}

export function platformFailure(error){const code=error?.code,message=String(error?.message||'').trim();const detail=message&& !['null','undefined'].includes(message)?message:'Zalo từ chối tạo lịch nhưng không cung cấp nội dung lỗi. Kiểm tra trạng thái kết nối và quyền tạo nhắc hẹn của cuộc trò chuyện.';return (detail+(code!==null&&code!==undefined?' (mã Zalo: '+String(code)+')':'')).slice(0,500);}
