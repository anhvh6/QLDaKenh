import webpush from 'web-push';
import {createHash} from 'node:crypto';
import {all,get,put,remove,secret,saveSecret,db,now} from './store.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
const preferences=p=>Object.fromEntries(['sound','messages','reminders','handoffs'].map(k=>[k,p?.[k]!==false]));
export function validSubscription(s){
 try{const u=new URL(s?.endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com','notify.windows.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))&&s.endpoint.length<2048&&/^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh)&&/^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth);}catch{return false;}
}
export function pushKeys(){let keys=secret('web-push-vapid');if(!keys.publicKey){keys=webpush.generateVAPIDKeys();saveSecret('web-push-vapid',keys);}return keys;}
export async function pushRoute(path,method,input,user){
 if(!path.startsWith('/api/push/'))return;
 if(path==='/api/push/config'&&method==='GET')return {publicKey:pushKeys().publicKey};
 if(path==='/api/push/subscribe'&&method==='POST'){
  if(!validSubscription(input.subscription))fail('Đăng ký thông báo không hợp lệ.');
  const id=createHash('sha256').update(input.subscription.endpoint).digest('hex'),old=get('push_subscriptions',id);
  if(all('push_subscriptions').filter(s=>s.userId===user.id).length>=20&&!old)fail('Đã đạt giới hạn 20 thiết bị.');
  put('push_subscriptions',{id,userId:user.id,subscription:input.subscription,preferences:preferences(input.preferences),cursor:old?.userId===user.id?old.cursor:now(),cursorId:old?.userId===user.id?old.cursorId:'',seen:old?.userId===user.id?old.seen:[]});return {ok:true};
 }
 if(path==='/api/push/unsubscribe'&&method==='POST'){
  for(const s of all('push_subscriptions'))if(s.userId===user.id&&s.subscription.endpoint===input.endpoint)remove('push_subscriptions',s.id);return {ok:true};
 }
 if(path==='/api/push/test'&&method==='POST'){
  const s=all('push_subscriptions').find(s=>s.userId===user.id&&s.subscription.endpoint===input.endpoint);if(!s)fail('Hãy bật thông báo trên thiết bị trước.');
  try{await sendPush(s,{title:'Thông báo thử',body:'Thiết bị đã kết nối thông báo MeGa Phương.',url:'/#inbox',tag:'push-test',badge:1});}catch(error){if([404,410].includes(error.statusCode))remove('push_subscriptions',s.id);fail('Không gửi được thông báo thử. Hãy bật lại thông báo trên thiết bị.',502);}return {ok:true};
 }
}
export async function sendPush(s,payload){const keys=pushKeys();return webpush.sendNotification(s.subscription,JSON.stringify({...payload,silent:!s.preferences.sound}),{vapidDetails:{subject:'https://quanlydakenh.vercel.app',...keys},TTL:3600,timeout:10000});}
// Only generic alerts cross the push provider. Customer names, messages and IDs stay on our server.
export function eventFor(kind,r,user,p){
 if(kind==='notifications'){
  if(r.read||(r.recipientId&&r.recipientId!==user.id)||(!p.reminders&&r.id.startsWith('chat-reminder:')))return null;
 }else if(kind==='messages'){
  if(!p.messages||r.direction!=='incoming'||r.deletedAt)return null;
  try{permission(user,'inbox');}catch{return null;}
 }else if(kind==='staff_handoffs'){
  if(!p.handoffs||r.assignedStaffId!==user.id||['done','resolved','completed','cancelled'].includes(r.status)||r.completedAt)return null;
 }else return null;
 const c=r.conversationId?get('conversations',r.conversationId):null;
 if(r.conversationId){if(!c||c.deletedAt)return null;try{assertChannel(user,c.connectionId);}catch{return null;}}
 const type=kind==='messages'?'message':kind==='staff_handoffs'?'handoff':r.id.startsWith('chat-reminder:')?'reminder':'notification';
 return {title:{message:'Có tin nhắn mới',handoff:'Yêu cầu nhân viên xử lý',reminder:'Đến giờ nhắc hẹn',notification:'Có thông báo mới'}[type],body:'Mở MeGa Phương để xem nội dung.',url:'/#'+(type==='handoff'?'handoffs':'inbox'),tag:'hub-'+type};
}
let busy=false;
export async function pushTick(send=sendPush){
 if(busy)return;busy=true;
 try{for(const s of all('push_subscriptions')){
  if(s.retryAt&&s.retryAt>Date.now())continue;
  const user=db.prepare('SELECT id,role FROM users WHERE id=? AND active=1').get(s.userId);
  if(!user||!db.prepare('SELECT 1 FROM sessions WHERE user_id=? AND expires>? LIMIT 1').get(s.userId,Date.now()))continue;
  const until=now(),seen=new Set(s.seen||[]),rows=db.prepare("SELECT kind,id,data,updated_at FROM records WHERE kind IN ('notifications','messages','staff_handoffs') AND (updated_at>? OR (updated_at=? AND id>?)) AND updated_at<=? ORDER BY updated_at,id LIMIT 500").all(s.cursor,s.cursor,s.cursorId||'',until);
  let cursor=s.cursor,cursorId=s.cursorId||'',failed=false,sent=0;
  for(const row of rows){
   const r={...JSON.parse(row.data),id:row.id},key=row.kind+':'+r.id;
   const payload=!seen.has(key)&&Date.parse(r.createdAt)>=Date.parse(s.createdAt)&&Date.parse(r.createdAt)>Date.now()-3600000?eventFor(row.kind,r,user,s.preferences):null;
   if(payload){try{await send(s,{...payload,badge:all('notifications').filter(n=>!n.read&&(!n.recipientId||n.recipientId===user.id)).length||1});sent++;}catch(error){if([404,410].includes(error.statusCode))remove('push_subscriptions',s.id);else put('push_subscriptions',{...s,cursor,cursorId,seen:[...seen].slice(-600),retryAt:Date.now()+60000});failed=true;break;}}
   seen.add(key);cursor=row.updated_at;cursorId=row.id;if(sent>=5)break;
  }
  if(!failed)put('push_subscriptions',{...s,cursor:rows.length?cursor:until,cursorId:rows.length?cursorId:'',seen:[...seen].slice(-600),retryAt:null});
 }}finally{busy=false;}
}
