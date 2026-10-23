// Shared event identity for overview and month calendar. Keep one current card
// per content/day, with the latest attempt for each destination on that day.
export function calendarDayKey(value){const time=Date.parse(value);return Number.isFinite(time)?new Date(time+7*3600000).toISOString().slice(0,10):'';}
const activeStatuses=new Set(['scheduled','preparing','ready','awaiting_manual','dispatching','processing','publishing','accepted','published','manually_confirmed','failed','blocked','unknown']);
const successful=new Set(['published','manually_confirmed']);
function newer(a,b){const at=x=>Date.parse(x.updatedAt||x.createdAt||'')||0;return at(a)>at(b)||at(a)===at(b)&&(Number(a.version||0)>Number(b.version||0)||Number(a.version||0)===Number(b.version||0)&&(successful.has(a.status)||!successful.has(b.status)));}
function latestRows(rows,key){const map=new Map();for(const row of rows){const id=key(row),old=map.get(id);if(!old||newer(row,old))map.set(id,row);}return [...map.values()];}
export function calendarEvents(S){
 const contents=new Map((S.contents||[]).map(c=>[c.id,c])),conversations=new Map((S.conversations||[]).map(c=>[c.id,c]));
 const latest=latestRows((S.publications||[]).map(p=>({...p,scheduleAt:p.scheduleAt||contents.get(p.contentId)?.scheduleAt})),p=>p.id||[p.contentId,p.connectionId,p.scheduleAt].join(':'));
 const attempts=latestRows(latest.filter(p=>activeStatuses.has(p.status)&&calendarDayKey(p.scheduleAt)),p=>[p.contentId||p.id,p.connectionId,calendarDayKey(p.scheduleAt)].join(':'));
 const groups=new Map(),representedCopies=new Set();
 for(const p of attempts){
  const day=calendarDayKey(p.scheduleAt),key=(p.contentId||p.id)+':'+day,c=contents.get(p.contentId),g=groups.get(key)||{id:c?.id||p.contentId||p.id,contentId:p.contentId,publicationId:p.id,title:c?.title||p.title||'Bài đăng',at:p.scheduleAt,scheduleAt:p.scheduleAt,type:p.copyPlanId?'copy':'post',planId:p.copyPlanId,channels:[],statuses:[],eventKey:'post:'+key};
  if(p.copyPlanItemId)representedCopies.add(p.copyPlanItemId+':'+day);
  if(p.connectionId&&!g.channels.includes(p.connectionId))g.channels.push(p.connectionId);
  g.statuses.push(p.status);groups.set(key,g);
 }
 const events=[...groups.values()].map(({statuses,...g})=>({...g,status:statuses.some(s=>['failed','blocked','unknown'].includes(s))?'failed':statuses.every(s=>successful.has(s))?'published':statuses.find(s=>!successful.has(s))||'scheduled'}));
 for(const item of latestRows(S.copyPlanCalendar||[],i=>i.id)){
  const day=calendarDayKey(item.scheduleAt);if(!day||!activeStatuses.has(item.state)||representedCopies.has(item.id+':'+day)||item.contentId&&groups.has(item.contentId+':'+day))continue;
  events.push({...item,at:item.scheduleAt,type:'copy',status:item.state,eventKey:'copy:'+item.id+':'+day});
 }
 for(const r of latestRows(S.chat_reminders||[],r=>r.id)){
  if(!['pending','done','completed','resolved'].includes(r.status)||!calendarDayKey(r.dueAt))continue;
  const connectionId=r.connectionId||conversations.get(r.conversationId)?.connectionId;
  events.push({...r,at:r.dueAt,type:'call',channels:connectionId?[connectionId]:[],eventKey:'appointment:'+r.id});
 }
 return events.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.eventKey.localeCompare(b.eventKey));
}
export function calendarDayItems(events,day){return events.filter(item=>calendarDayKey(item.at)===day);}
export function calendarDayPreview(items,expanded=false){return {visible:expanded?items:items.slice(0,3),hidden:expanded?0:Math.max(0,items.length-3)};}
