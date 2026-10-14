const zone='Asia/Ho_Chi_Minh';
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function chatTimeParts(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;const p=Object.fromEntries(clock.formatToParts(date).map(p=>[p.type,p.value]));return {day:`${p.year}-${p.month}-${p.day}`,minute:`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`,time:`${p.hour}:${p.minute}`,date:`${p.day}/${p.month}`};}
export function messageTimeline(messages,now=new Date()){
 const today=chatTimeParts(now)?.day,yesterday=chatTimeParts(new Date(new Date(now).getTime()-86400000))?.day,result=new Map();let lastDay='',lastMinute='';
 for(const message of messages){const p=chatTimeParts(message.createdAt);if(!p){result.set(message.id,{time:'',firstMinute:false,separator:''});continue;}
 result.set(message.id,{time:p.time,firstMinute:p.minute!==lastMinute,separator:p.day!==lastDay&&p.day<today?`${p.time} ${p.day===yesterday?'hôm qua':p.date}`:''});lastDay=p.day;lastMinute=p.minute;
 }return result;
}
export function nearMessage(x,y,rects,padding=36){return rects.some(r=>x>=r.left-padding&&x<=r.right+padding&&y>=r.top-padding&&y<=r.bottom+padding);}
