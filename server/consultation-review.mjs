import {studyPlanStatus} from './plan-access.mjs';
import {all,get,put,db,now,transaction,audit} from './store.mjs';
import {fail,permission} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {progressFor,stageRank} from '../public/learner-progress.js';
import {groupLearner} from '../public/group-learner.js';

export function consultationEligible(c,p,state=progressState(),time=Date.now()){
 if(!c||c.deletedAt||c.kind==='comment'||!p)return false;
 const learner=c.threadType===1?groupLearner({customers:all('customers').map(p=>({...p,...(get('learner_source_facts',p.id)||{}),id:p.id})),conversations:all('conversations')},c):p;
 return !!learner&&learner.id===p.id&&stageRank(progressFor(state,learner,time).stage)<=stageRank('APPOINTMENT');
}

export function progressState(){return {journeys:all('journeys'),orders:all('orders'),chat_reminders:all('chat_reminders'),chatNameSettings:get('settings','chat-names'),chatPlanSummaries:all('study_plans').map(p=>({customerId:p.customerId,startDate:p.customer?.start_date,endDate:p.customer?.end_date,status:studyPlanStatus(p,get('orders',p.lastOrderId))}))};}
export function consultationTick(time=Date.now()){
 const state=progressState();return transaction(()=>{let count=0;for(const r of all('consultation_reviews').filter(r=>r.status==='open')){const p=get('customers',r.customerId),facts=get('learner_source_facts',r.customerId);if(!consultationEligible(get('conversations',r.conversationId),p?{...p,...facts,id:p.id}:null,state,time)){put('consultation_reviews',{...r,status:'resolved',answer:'NO_LONGER_ELIGIBLE',answeredAt:now()});const task=get('staff_handoffs',r.id);if(task)put('staff_handoffs',{...task,status:'resolved',resolvedAt:now()});}}for(const r of all('chat_reminders')){
  if(r.status==='cancelled'||r.consultationAnsweredAt||Date.parse(r.dueAt)+3600000>time||!Number.isFinite(Date.parse(r.dueAt)))continue;
  const c=get('conversations',r.conversationId),stored=get('customers',r.customerId),facts=get('learner_source_facts',r.customerId),p=stored?{...stored,...Object.fromEntries(['is_deposit','deposit_amount','is_consultation','gia_tien','san_pham','start_date','end_date','status','hasEffectivePlan'].filter(k=>facts?.[k]!==undefined).map(k=>[k,facts[k]]))}:null,id='consultation:'+r.id;
  if(!consultationEligible(c,p,state,time)||get('consultation_reviews',id))continue;
  const stage=progressFor(state,p,time).stage,assigned=get('settings','progress-staff')?.assignments?.[stage];
  const candidates=[assigned,c.assignee,r.assignee,...db.prepare("SELECT id FROM users WHERE active=1 AND role='owner'").all().map(u=>u.id)];
  const staff=candidates.map(id=>db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id||'')).find(u=>{if(!u?.active)return false;try{permission(u,'inbox');assertChannel(u,c.connectionId);return true;}catch{return false;}});
  if(!staff)continue;
  put('consultation_reviews',{id,conversationId:c.id,customerId:p.id,reminderId:r.id,dueAt:r.dueAt,status:'open',assignedStaffId:staff.id});
  put('staff_handoffs',{id,source:'mention',taskType:'consultation-review',conversationId:c.id,customerId:p.id,assignedStaffId:staff.id,questions:[],reason:'Xác nhận kết quả tư vấn của '+p.name,status:'open'});
  put('notifications',{id,title:'Cần cập nhật kết quả tư vấn',body:p.name+' · Lịch tư vấn đã qua 1 giờ',route:'inbox',conversationId:c.id,recipientId:staff.id,read:false});count++;
 }return count;});
}
export function checkConsultation(user,id,customerId,version){const r=get('consultation_reviews',id);if(!r||r.status!=='open')fail('Câu hỏi đã được nhân viên khác xử lý. Tải lại hội thoại.',409);if(customerId&&r.customerId!==customerId)fail('Câu hỏi không thuộc học viên này.',403);const c=get('conversations',r.conversationId);permission(user,'inbox');assertChannel(user,c.connectionId);if(version!==undefined&&version!==r.version)fail('Câu hỏi vừa thay đổi. Tải lại hội thoại.',409);return r;}
export function finishConsultation(user,id,answer){const r=checkConsultation(user,id);put('consultation_reviews',{...r,status:'resolved',answer,answeredAt:now(),answeredBy:user.id},r.version);const reminder=get('chat_reminders',r.reminderId);if(reminder)put('chat_reminders',{...reminder,consultationAnsweredAt:now()});const task=get('staff_handoffs',id);if(task)put('staff_handoffs',{...task,status:'resolved',resolvedAt:now(),resolvedBy:user.id});audit(user.id,'consultation_review_answered',id,{answer});}
export function consultationRoute(path,method,input,user){const m=path.match(/^\/api\/chat\/consultation-reviews\/([^/]+)$/);if(!m||method!=='POST')return undefined;return transaction(()=>{const r=checkConsultation(user,decodeURIComponent(m[1]),null,input.version);if(!['NOT_CONSULTED','CONSULTED'].includes(input.answer))fail('Mở hồ sơ đặt cọc hoặc đủ tiền và lưu để hoàn tất câu hỏi.');if(input.answer==='CONSULTED'){const p=get('customers',r.customerId);const from=progressFor(progressState(),p).stage;if(stageRank(from)>stageRank('CONSULTED'))fail('Học viên đã ở tiến trình cao hơn. Mở hồ sơ để kiểm tra.',409);put('customers',{...p,learnerProgress:{...p.learnerProgress,stage:'CONSULTED',manualOverride:true,source:'consultation-review',planOverride:false,updatedAt:now(),updatedBy:user.id}},p.version);put('journey_events',{customerId:p.id,from,to:'CONSULTED',source:'chat_progress',actor:user.id});}finishConsultation(user,r.id,input.answer);return get('consultation_reviews',r.id);});}
