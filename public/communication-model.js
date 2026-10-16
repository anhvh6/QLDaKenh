import {progressFor,deletedLearner} from './learner-progress.js';
export const communicationProviders={zalo_personal:'Zalo cá nhân',facebook:'Facebook Messenger',zalo:'Zalo OA'};
export const dayKey=time=>new Date(Number(time)+7*3600000).toISOString().slice(0,10);
const dayNumber=value=>Date.parse(String(value).slice(0,10)+'T00:00:00Z')/86400000;
export function scheduledOccurrence(c,time){
 if(c.newSendImmediately||c.mode!=='automatic'||time<Date.parse(c.startAt)||c.endAt&&time>Date.parse(c.endAt))return null;
 const startDay=dayKey(Date.parse(c.startAt)),today=dayKey(time),elapsed=dayNumber(today)-dayNumber(startDay),step=c.repeat==='once'?0:c.intervalDays;
 if(elapsed<0||c.repeat==='once'&&elapsed!==0||step&&elapsed%step!==0)return null;
 const at=Date.parse(today+'T'+c.sendTime+':00+07:00');if(at<Date.parse(c.startAt)||c.endAt&&at>Date.parse(c.endAt)||time<at||time-at>=30*60000)return null;
 return new Date(at).toISOString();
}
export function matchingCommunicationStage(c,customer,conversation,state,time){
 if(!customer||customer.mergedInto||deletedLearner(customer))return null;
 const progress=progressFor(state.communicationState||{...state,chatNameSettings:{...state.chatNameSettings,expiringDays:Math.max(1,c.beforeExpiryDays)}},customer,time),today=dayNumber(dayKey(time)),end=progress.endDate||'',start=progress.startDate||'';
 const remaining=end?dayNumber(end)-today:null,stage=progress.stage;
 for(const wanted of c.stages){
  if(wanted==='EXPIRING'&&remaining!==null&&remaining>=0&&remaining<=c.beforeExpiryDays)return wanted;
  if(wanted==='EXPIRED'&&remaining!==null&&today-dayNumber(end)>=Math.max(1,c.afterExpiryDays))return wanted;
  if(wanted==='STUDYING'&&start&&stage==='STUDYING'&&today-dayNumber(start)>=c.afterStudyDays)return wanted;
  if(wanted==='DEPOSIT'&&stage==='DEPOSIT'){
   const events=(state.journeyEvents||[]).filter(e=>e.customerId===customer.id&&e.to==='DEPOSIT'&&e.from!=='DEPOSIT').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
   const at=events[0]?.createdAt||customer.learnerProgress?.depositAt||(customer.learnerProgress?.stage==='DEPOSIT'?customer.learnerProgress.updatedAt:null)||customer.depositAt;
   if(at&&today-dayNumber(dayKey(Date.parse(at)))>=c.afterDepositDays)return wanted;
  }
  if(wanted==='NEW'&&stage==='NEW'){
   const ids=new Set((state.firstContactByCustomer?[]:state.conversations).filter(v=>v.customerId===customer.id&&v.threadType!==1&&v.kind!=='comment').map(v=>v.id));
   const history=(state.firstContactByCustomer?[]:state.messages||[]).filter(m=>ids.has(m.conversationId)&&!m.deletedAt&&['incoming','outgoing'].includes(m.direction)).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
   const first=state.firstContactByCustomer?.get(customer.id)||history[0];if(!first||first.direction!=='incoming'||first.conversationId!==conversation.id||Date.parse(first.createdAt)<Math.max(Date.parse(c.newSince||c.startAt),Date.parse(c.startAt))||Date.parse(first.createdAt)>time)continue;
   if(c.newNonFriendOnly&&conversation.provider==='zalo_personal'&&conversation.isFriend!==false)continue;
   return wanted;
  }
  if(!['NEW','EXPIRING','EXPIRED','STUDYING','DEPOSIT'].includes(wanted)&&stage===wanted)return wanted;
 }
 return null;
}
