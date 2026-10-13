import {progressState} from './consultation-review.mjs';
import {progressFor,stageRank} from '../public/learner-progress.js';
import {groupLearner} from '../public/group-learner.js';
import {all,get,put,db,audit,now,transaction} from './store.mjs';
import {permission,fail,required} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {createNativeReminder} from './zalo.mjs';

export async function createChatReminder(user,c,input,platform=createNativeReminder){
 const due=Date.parse(input.dueAt);if(!Number.isFinite(due)||due<=Date.now())fail('Chọn thời gian nhắc trong tương lai.');
 const assignee=input.assignee||user.id,u=db.prepare('SELECT id,role FROM users WHERE id=? AND active=1').get(assignee);
 if(!u)fail('Nhân viên không tồn tại.');permission(u,'inbox');assertChannel(u,c.connectionId);
 const learner=groupLearner({customers:all('customers').map(p=>({...p,...(get('learner_source_facts',p.id)||{}),id:p.id})),conversations:all('conversations')},c);
 const title=required(input.title,'Nội dung nhắc',500),ch=get('connections',c.connectionId);
 let r=put('chat_reminders',{conversationId:c.id,customerId:learner?.id||c.customerId,connectionId:c.connectionId,title,phone:String(input.phone||learner?.phone||(c.customerId?get('customers',c.customerId)?.phone:'')||'').slice(0,50),dueAt:new Date(due).toISOString(),assignee,actor:user.id,status:'pending',platformStatus:input.platform?'creating':'not_requested'});
 if(input.platform){
  if(ch?.provider!=='zalo_personal'||ch.mode!=='api'||!c.externalUserId)r=put('chat_reminders',{...r,platformStatus:'unsupported',platformError:'Kênh này chưa hỗ trợ nhắc hẹn trên nền tảng; đã lưu nhắc trong hệ thống.'});
  else try{const result=await platform(c.connectionId,c.externalUserId,c.threadType,title,due);if(!result?.id&&!result?.reminderId)throw new Error('Zalo không trả mã lịch hẹn. Chưa xác nhận lịch đã tạo; kiểm tra trên Zalo trước khi thử lại.');r=put('chat_reminders',{...r,platformStatus:'created',platformId:String(result?.id||result?.reminderId||'')});}catch(error){r=put('chat_reminders',{...r,platformStatus:'failed',platformError:platformFailure(error),platformErrorCode:error?.code??null});}
 }
 const customerId=learner?.id||c.customerId;if(customerId)transaction(()=>{const latest=get('customers',customerId);if(!latest)return;const facts=get('learner_source_facts',customerId)||{},state=progressState();state.chat_reminders=state.chat_reminders.filter(x=>x.id!==r.id);const current=progressFor(state,{...latest,...facts,id:latest.id});if(stageRank(current.stage)>stageRank('APPOINTMENT'))return;put('customers',{...latest,learnerProgress:{...latest.learnerProgress,stage:'APPOINTMENT',appointmentAt:r.dueAt,source:'reminder',manualOverride:true,planOverride:false,...(current.source==='deleted'?{deletedResetAt:facts.statusCheckedAt||''}:{}),updatedAt:now(),updatedBy:user.id}},latest.version);if(current.stage!=='APPOINTMENT')put('journey_events',{customerId:latest.id,from:current.stage,to:'APPOINTMENT',actor:user.id,source:'chat_reminder',reminderId:r.id});});
 audit(user.id,'chat_reminder_created',r.id,{platformStatus:r.platformStatus});return r;
}
export function reminderTick(time=Date.now()){
 return transaction(()=>{let count=0;for(const r of all('chat_reminders').filter(r=>r.status==='pending'&&!r.alertedAt&&Date.parse(r.dueAt)<=time)){
  const c=get('conversations',r.conversationId),u=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(r.assignee);if(!c||c.deletedAt||!u?.active)continue;
  try{assertChannel(u,c.connectionId);}catch{continue;}
  put('notifications',{id:'chat-reminder:'+r.id,title:'Đến giờ nhắc hẹn',body:r.title,route:'inbox',conversationId:c.id,recipientId:r.assignee,read:false});
  put('chat_reminders',{...r,alertedAt:now()});count++;
 }return count;});
}

export function platformFailure(error){const code=error?.code,message=String(error?.message||'').trim();const detail=message&& !['null','undefined'].includes(message)?message:'Zalo từ chối tạo lịch nhưng không cung cấp nội dung lỗi. Kiểm tra trạng thái kết nối và quyền tạo nhắc hẹn của cuộc trò chuyện.';return (detail+(code!==null&&code!==undefined?' (mã Zalo: '+String(code)+')':'')).slice(0,500);}
