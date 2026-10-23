import {calendarEvents,calendarDayKey,calendarDayItems} from './calendar-model.js';
import {activeAppointmentTask} from './reminder-model.js';
const day=86400000;
export const dashboardLabels={prepared:'Nội dung đã chuẩn bị',pending:'Chờ đăng',failed:'Đăng lỗi 48h',messages:'Tin nhắn mới',comments:'Bình luận mới',tasks:'Nhiệm vụ',orders:'Đơn mới'};
export function dashboardData(S,time=Date.now()){
 const latest=new Map();for(const m of [...(S.messageSummaries||[]),...(S.messages||[])]){if(m.deletedAt||['failed','cancelled'].includes(m.status))continue;const old=latest.get(m.conversationId);if(!old||String(m.createdAt)>String(old.createdAt)||m.createdAt===old.createdAt&&m.id>old.id)latest.set(m.conversationId,m);}
 const unanswered=(S.conversations||[]).filter(c=>{const m=latest.get(c.id),at=Date.parse(m?.createdAt);return !c.deletedAt&&!c.careHidden&&!['resolved','closed','done'].includes(c.status)&&m?.direction==='incoming'&&at>=time-7*day&&at<=time;});
 const destinations=new Map();for(const p of S.publications||[]){const key=p.contentId+':'+p.connectionId,old=destinations.get(key);if(!old||String(p.updatedAt||p.createdAt)>String(old.updatedAt||old.createdAt))destinations.set(key,p);}
 const representedContents=new Set([...destinations.values()].map(p=>p.contentId));
 const pendingIds=new Set(),failedIds=new Set();for(const p of destinations.values()){if(['scheduled','awaiting_manual','dispatching','processing'].includes(p.status))pendingIds.add(p.contentId);if(['failed','blocked','unknown'].includes(p.status)&&Date.parse(p.updatedAt||p.createdAt)>=time-2*day&&Date.parse(p.updatedAt||p.createdAt)<=time)failedIds.add(p.contentId);}
 const pending=(S.contents||[]).filter(c=>pendingIds.has(c.id)),failed=(S.contents||[]).filter(c=>failedIds.has(c.id));
 for(const p of S.copyPlanCalendar||[]){if(p.contentId&&representedContents.has(p.contentId))continue;if(['scheduled','preparing','ready','publishing'].includes(p.state))pending.push({...p,dashboardCopy:true});if(['failed','unknown'].includes(p.state)&&Date.parse(p.updatedAt||p.scheduleAt)>=time-2*day&&Date.parse(p.updatedAt||p.scheduleAt)<=time)failed.push({...p,dashboardCopy:true});}
 const tasks=[...(S.staffHandoffs||[]),...(S.tasks||[])].filter(t=>!['resolved','done','completed','cancelled'].includes(t.status)&&!t.completedAt&&activeAppointmentTask(t,time)&&(t.assignedStaffId===S.user.id||t.assignee===S.user.id||t.assigneeId===S.user.id||(t.assigneeIds||[]).includes(S.user.id)));
 return {prepared:S.contents||[],pending,failed,messages:unanswered.filter(c=>c.kind!=='comment'),comments:unanswered.filter(c=>c.kind==='comment'),tasks,orders:(S.orders||[]).filter(o=>o.autoDraft===true&&['draft','new'].includes(o.status)&&(!o.posDisplay||o.posDisplay.status==null||Number(o.posDisplay.status)===0))};
}
export function dashboardDays(S,time=Date.now(),startOffset=0){
 const midnight=Date.parse(calendarDayKey(new Date(time).toISOString())+'T00:00:00+07:00'),events=calendarEvents(S);
 return [startOffset,startOffset+1].map(offset=>{const at=midnight+offset*day;return {at,offset,items:calendarDayItems(events,calendarDayKey(new Date(at).toISOString()))};});
}
