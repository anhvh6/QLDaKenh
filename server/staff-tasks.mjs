import {all,put,now,audit} from './store.mjs';
// Completion follows a successful staff reply, never an AI reply or internal note.
export function finishMentionTasks(user,conversationId,messageId){
 if(user.botId)return;
 for(const task of all('staff_handoffs').filter(h=>h.source==='mention'&&h.taskType!=='consultation-review'&&h.conversationId===conversationId&&h.assignedStaffId===user.id&&h.status!=='resolved')){
  put('staff_handoffs',{...task,status:'resolved',resolvedBy:user.id,resolvedAt:now(),resolvedMessageId:messageId},task.version);
  audit(user.id,'mention_task_resolved',task.id,{messageId});
 }
}
