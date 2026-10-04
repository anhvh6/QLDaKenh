import {chatName} from './chat-names.js';
export const defaultFilters={type:'all',phone:'all',reply:'all',archive:'active',pinned:false,connectionId:'',tags:[],tagMode:'any',assignees:[],assigneeMode:'any',dateField:'lastAt',from:'',to:'',sort:'newest',customerId:''};
export const assignedIds=c=>[...new Set([...(c.assigneeIds||[]),...(c.assignee?[c.assignee]:[])])];
export const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
export function filterThreads(S,q='',status='all',f=defaultFilters){
 const customers=new Map(S.customers.map(c=>[c.id,c])),texts=new Map();
 if(q)for(const m of S.messages)texts.set(m.conversationId,(texts.get(m.conversationId)||'')+' '+m.text);
 return S.conversations.filter(c=>c.kind!=='comment').map(c=>({...c,customerName:chatName(c,customers.get(c.customerId))})).filter(c=>{
  const p=customers.get(c.customerId)||{},tags=c.tags||[],ids=assignedIds(c),phone=p.phone||p.sdt;
  if(status!=='all'&&(status==='unread'?!c.unread:c.status!==status))return false;
  if(q&&!normalize([c.customerName,p.phone,p.email,c.lastMessage,texts.get(c.id)].join(' ')).includes(normalize(q)))return false;
  if(f.type==='group'&&c.threadType!==1||f.type==='personal'&&c.threadType===1||f.type==='stranger'&&c.isFriend!==false)return false;
  if(f.phone==='yes'&&!phone||f.phone==='no'&&phone)return false;
  if(f.reply==='waiting'&&!c.waitingSince||f.reply==='read-waiting'&&(!c.waitingSince||c.unread))return false;
  if(f.archive==='active'&&c.archived||f.archive==='archived'&&!c.archived)return false;
  if(f.pinned&&!c.pinned||f.connectionId&&c.connectionId!==f.connectionId||f.customerId&&c.customerId!==f.customerId)return false;
  if(f.tags.length){const match=t=>t==='__none__'?!tags.length:tags.includes(t);if(!(f.tagMode==='all'?f.tags.every(match):f.tags.some(match)))return false;}
  if(f.assignees.length){const match=id=>id==='__none__'?!ids.length:ids.includes(id);if(!(f.assigneeMode==='all'?f.assignees.every(match):f.assignees.some(match)))return false;}
  const stamp=Date.parse(c[f.dateField]||c.lastAt||c.createdAt);
  if(f.from&&!(stamp>=Date.parse(f.from+'T00:00:00+07:00'))||f.to&&!(stamp<=Date.parse(f.to+'T23:59:59.999+07:00')))return false;
  return true;
 }).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(f.sort==='waiting'?(Date.parse(a.waitingSince)||Infinity)-(Date.parse(b.waitingSince)||Infinity):f.sort==='oldest'?Date.parse(a.lastAt||0)-Date.parse(b.lastAt||0):Date.parse(b.lastAt||0)-Date.parse(a.lastAt||0)));
}
export function safeLink(url){try{const u=new URL(url,typeof location==='object'?location.origin:'http://localhost');return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
