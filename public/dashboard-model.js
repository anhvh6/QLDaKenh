import {activeAppointmentTask} from './reminder-model.js';
const day=86400000;
export const dashboardLabels={prepared:'Nội dung đã chuẩn bị',pending:'Chờ đăng',failed:'Đăng lỗi 48h',messages:'Tin nhắn mới',comments:'Bình luận mới',tasks:'Nhiệm vụ',orders:'Đơn mới'};
export function dashboardData(S,time=Date.now()){
 const latest=new Map();for(const m of [...(S.messageSummaries||[]),...(S.messages||[])]){if(m.deletedAt||['failed','cancelled'].includes(m.status))continue;const old=latest.get(m.conversationId);if(!old||String(m.createdAt)>String(old.createdAt)||m.createdAt===old.createdAt&&m.id>old.id)latest.set(m.conversationId,m);}
 const unanswered=(S.conversations||[]).filter(c=>{const m=latest.get(c.id),at=Date.parse(m?.createdAt);return !c.deletedAt&&!c.careHidden&&!['resolved','closed','done'].includes(c.status)&&m?.direction==='incoming'&&at>=time-7*day&&at<=time;});
 const destinations=new Map();for(const p of S.publications||[]){const key=p.contentId+':'+p.connectionId,old=destinations.get(key);if(!old||String(p.updatedAt||p.createdAt)>String(old.updatedAt||old.createdAt))destinations.set(key,p);}
 const pending=(S.contents||[]).filter(c=>[...destinations.values()].some(p=>p.contentId===c.id&&['scheduled','awaiting_manual','dispatching','processing'].includes(p.status)));
 const failed=(S.contents||[]).filter(c=>[...destinations.values()].some(p=>p.contentId===c.id&&['failed','blocked','unknown'].includes(p.status)&&Date.parse(p.updatedAt||p.createdAt)>=time-2*day&&Date.parse(p.updatedAt||p.createdAt)<=time));
 for(const p of S.copyPlanCalendar||[]){if(['scheduled','preparing','ready','publishing'].includes(p.state))pending.push({...p,dashboardCopy:true});if(['failed','unknown'].includes(p.state)&&Date.parse(p.updatedAt||p.scheduleAt)>=time-2*day&&Date.parse(p.updatedAt||p.scheduleAt)<=time)failed.push({...p,dashboardCopy:true});}
 const tasks=[...(S.staffHandoffs||[]),...(S.tasks||[])].filter(t=>!['resolved','done','completed','cancelled'].includes(t.status)&&!t.completedAt&&activeAppointmentTask(t,time)&&(t.assignedStaffId===S.user.id||t.assignee===S.user.id||t.assigneeId===S.user.id||(t.assigneeIds||[]).includes(S.user.id)));
 return {prepared:S.contents||[],pending,failed,messages:unanswered.filter(c=>c.kind!=='comment'),comments:unanswered.filter(c=>c.kind==='comment'),tasks,orders:(S.orders||[]).filter(o=>o.autoDraft===true&&['draft','new'].includes(o.status)&&(!o.posDisplay||o.posDisplay.status==null||Number(o.posDisplay.status)===0))};
}
export function dashboardDays(S,time=Date.now()){
 const start=new Date(time+7*3600000).toISOString().slice(0,10),midnight=Date.parse(start+'T00:00:00+07:00');
 const groups=new Map(),latest=new Map();
 for(const p of S.publications||[]){const key=p.contentId+':'+p.connectionId+':'+(p.scheduleAt||'');const previous=latest.get(key);if(!previous||String(p.updatedAt||p.createdAt||'')>=String(previous.updatedAt||previous.createdAt||''))latest.set(key,p);}
 for(const p of latest.values()){
  if(!['scheduled','awaiting_manual','dispatching','processing','publishing','accepted','published','manually_confirmed','failed','blocked','unknown'].includes(p.status))continue;
  const c=(S.contents||[]).find(c=>c.id===p.contentId),at=p.scheduleAt||c?.scheduleAt;if(!at)continue;
  const key=p.contentId+':'+at,group=groups.get(key)||{...c,id:c?.id||p.contentId,title:c?.title||p.title,at,scheduleAt:at,type:p.copyPlanId?'copy':'post',planId:p.copyPlanId,statuses:[]};group.statuses.push(p.status);groups.set(key,group);
 }
 const posts=[...groups.values()].map(({statuses,...p})=>({...p,status:statuses.some(s=>['failed','blocked','unknown'].includes(s))?'failed':statuses.every(s=>['published','manually_confirmed'].includes(s))?'published':'scheduled'}));
 posts.push(...(S.copyPlanCalendar||[]).filter(p=>!['cancelled','draft','skipped'].includes(p.state||p.status)&&!(S.publications||[]).some(j=>j.copyPlanItemId===p.id&&j.status!=='cancelled')).map(p=>({...p,at:p.scheduleAt,type:'copy'})));
 const calls=(S.chat_reminders||[]).filter(r=>['pending','done','completed','resolved'].includes(r.status)).map(r=>({...r,at:r.dueAt,type:'call',title:r.title||r.text||r.content||'Call khách hàng'}));
 return [-1,0,1].map(offset=>{const at=midnight+offset*day;return {at,offset,items:[...posts,...calls].filter(x=>Date.parse(x.at)>=at&&Date.parse(x.at)<at+day).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))};});
}
