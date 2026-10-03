import {all,get,put,db,transaction,audit,now} from './store.mjs';
import {permission,fail,required} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {groupDetails} from './zalo.mjs';

export function chatConversation(user,id){
 permission(user,'inbox');const c=get('conversations',id);
 if(!c||c.kind==='comment')fail('Không tìm thấy hội thoại chat.',404);
 assertChannel(user,c.connectionId);return c;
}
export function patchChat(user,id,input){
 const c=chatConversation(user,id);if(input.version!==c.version)fail('Hội thoại đã thay đổi. Hãy tải lại.',409);
 const next={...c};
 for(const key of ['pinned','archived','unread'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')fail('Giá trị không hợp lệ.');next[key]=input[key];}
 if(input.status!==undefined){if(!['open','pending','resolved'].includes(input.status))fail('Trạng thái không hợp lệ.');next.status=input.status;}
 if(input.tags!==undefined){if(!Array.isArray(input.tags)||input.tags.length>30||input.tags.some(t=>typeof t!=='string'||t.length>40))fail('Nhãn không hợp lệ.');next.tags=[...new Set(input.tags)];}
 if(input.assignee!==undefined||input.assigneeIds!==undefined){
  const ids=input.assigneeIds??(input.assignee?[input.assignee]:[]);
  if(!Array.isArray(ids)||ids.length>20)fail('Danh sách nhân viên không hợp lệ.');
  for(const uid of ids){const u=db.prepare('SELECT id,role FROM users WHERE id=? AND active=1').get(uid);if(!u)fail('Nhân viên không tồn tại.');permission(u,'inbox');assertChannel(u,c.connectionId);}
  next.assigneeIds=[...new Set(ids)];next.assignee=next.assigneeIds[0]||'';
 }
 const result=put('conversations',next,input.version);audit(user.id,'chat_updated',id,{fields:Object.keys(input).filter(k=>k!=='version')});return result;
}
export async function chatRoute(path,method,input,user){
 if(!path.startsWith('/api/chat/'))return;
 permission(user,'inbox');
 if(path==='/api/chat/bulk'&&method==='POST'){
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)fail('Chọn 1–100 hội thoại.');
  return transaction(()=>input.items.map(item=>patchChat(user,item.id,{...input.patch,version:item.version})));
 }
 let match=path.match(/^\/api\/chat\/conversations\/([^/]+)$/);
 if(match&&method==='PATCH')return patchChat(user,match[1],input);
 match=path.match(/^\/api\/chat\/conversations\/([^/]+)\/group$/);
 if(match&&method==='POST'){
  const c=chatConversation(user,match[1]);if(c.threadType!==1)fail('Đây không phải hội thoại nhóm.');
  const connection=get('connections',c.connectionId);if(connection?.provider!=='zalo_personal'||connection.mode!=='api')fail('Đồng bộ thành viên chỉ khả dụng với nhóm Zalo API.');
  const details=await groupDetails(c.connectionId,c.externalUserId);const current=get('conversations',c.id);
  return put('conversations',{...current,group:details,title:details.name||current.title});
 }
 match=path.match(/^\/api\/chat\/conversations\/([^/]+)\/reminders$/);
 if(match&&method==='POST'){
  const c=chatConversation(user,match[1]),due=Date.parse(input.dueAt);
  if(!Number.isFinite(due)||due<=Date.now())fail('Chọn thời gian nhắc trong tương lai.');
  const assignee=input.assignee||user.id,u=db.prepare('SELECT id,role FROM users WHERE id=? AND active=1').get(assignee);
  if(!u)fail('Nhân viên không tồn tại.');permission(u,'inbox');assertChannel(u,c.connectionId);
  const r=put('chat_reminders',{conversationId:c.id,customerId:c.customerId,connectionId:c.connectionId,title:required(input.title,'Nội dung nhắc',500),dueAt:new Date(due).toISOString(),assignee,actor:user.id,status:'pending'});
  audit(user.id,'chat_reminder_created',r.id);return r;
 }
 match=path.match(/^\/api\/chat\/reminders\/([^/]+)$/);
 if(match&&method==='PATCH'){
  const r=get('chat_reminders',match[1]);if(!r)fail('Không tìm thấy nhắc hẹn.',404);chatConversation(user,r.conversationId);
  if(!['done','cancelled'].includes(input.status))fail('Trạng thái không hợp lệ.');
  const result=put('chat_reminders',{...r,status:input.status,completedAt:now()},input.version);audit(user.id,'chat_reminder_updated',r.id);return result;
 }
 match=path.match(/^\/api\/chat\/messages\/([^/]+)$/);
 if(match&&method==='PATCH'){
  const m=get('messages',match[1]);if(!m)fail('Không tìm thấy tin nhắn.',404);chatConversation(user,m.conversationId);
  if(typeof input.pinned!=='boolean')fail('Trạng thái ghim không hợp lệ.');
  return put('messages',{...m,pinned:input.pinned,pinnedBy:input.pinned?user.id:null},input.version);
 }
 fail('Chức năng chat không tồn tại.',404);
}
