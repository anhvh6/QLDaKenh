import {dayKey} from './communication-model.js';
export function messageAgeDays(sent,time){return Math.round((Date.parse(dayKey(time)+'T00:00:00Z')-Date.parse(dayKey(Date.parse(sent))+'T00:00:00Z'))/86400000);}
export function messageTimeMatches(c,sent,time,includeWaiting=false){
 const at=Date.parse(sent);if(!Number.isFinite(at)||at>time)return false;
 if(c.messageTiming==='minutes')return includeWaiting||time-at>=c.waitMinutes*60000;
 const age=messageAgeDays(sent,time);return age>=c.daysFrom&&age<=c.daysTo;
}
export function messageOccurrences(c,time){
 if(c.audienceType!=='message'||c.messageTiming==='minutes'||c.status!=='active'||time<Date.parse(c.startAt)||c.endAt&&time>Date.parse(c.endAt))return [];
 const anchor=Math.max(Date.parse(c.startAt),Date.parse(c.messageActiveSince||c.createdAt||c.startAt)),day=dayKey(time),firstDay=dayKey(anchor),occurrences=[];
 if(c.messageExecution==='now'&&time>=anchor)occurrences.push('activation:'+new Date(anchor).toISOString());
 if(c.messageExecution==='now'&&c.messageRepeat==='once'||c.messageExecution==='now'&&day===firstDay)return occurrences;
 if(c.messageRepeat==='once'&&day!==firstDay)return occurrences;
 const weekday=new Date(day+'T00:00:00Z').getUTCDay()||7;
 if(c.messageRepeat==='weekly'&&!c.messageWeekdays.includes(weekday))return occurrences;
 const times=c.messageRepeat==='once'?c.messageTimes.filter(t=>Date.parse(firstDay+'T'+t+':00+07:00')>=anchor).slice(0,1):c.messageTimes;
 for(const clock of times){const at=Date.parse(day+'T'+clock+':00+07:00');if(at>=anchor&&time>=at&&time-at<30*60000)occurrences.push(new Date(at).toISOString());}
 return occurrences;
}
