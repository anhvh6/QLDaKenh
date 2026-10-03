import {all,get,put,db,transaction,audit,now} from './store.mjs';
import {permission,fail,required} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {groupDetails,changeGroup,newGroup} from './zalo.mjs';
const groupJobs=new Set();

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
 if(path==='/api/chat/groups'&&method==='POST'){
  if(!['owner','manager'].includes(user.role))fail('Cần quyền quản lý để tạo nhóm Zalo.',403);
  assertChannel(user,input.connectionId);const ch=get('connections',input.connectionId);if(ch?.provider!=='zalo_personal'||ch.mode!=='api')fail('Chọn kênh Zalo API.');
  const name=required(input.name,'Tên nhóm',50),ids=input.memberIds;if(!Array.isArray(ids)||new Set(ids).size<2||ids.length>100)fail('Chọn 2–100 thành viên.');
  for(const id of ids)if(!all('conversations').some(c=>c.connectionId===ch.id&&c.threadType!==1&&c.externalUserId===id))fail('Thành viên chưa có trong danh bạ đã đồng bộ.');
  if(input.confirm!==true)fail('Cần xác nhận tạo nhóm trên Zalo.');if(groupJobs.has(ch.id))fail('Đang xử lý nhóm trên kênh này.',409);groupJobs.add(ch.id);
  try{const c=await newGroup(ch.id,name,[...new Set(ids)]);audit(user.id,'zalo_group_created',c.id);return c;}finally{groupJobs.delete(ch.id);}
 }
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
  return put('conversations',{...current,group:details,groupNeedsSync:false,title:details.name||current.title});
 }
 match=path.match(/^\/api\/chat\/conversations\/([^/]+)\/group-action$/);
 if(match&&method==='POST'){
  if(!['owner','manager'].includes(user.role))fail('Cần quyền quản lý để thay đổi nhóm Zalo.',403);
  const c=chatConversation(user,match[1]),ch=get('connections',c.connectionId);if(c.threadType!==1||ch?.provider!=='zalo_personal'||ch.mode!=='api')fail('Chỉ áp dụng với nhóm Zalo API.');
  if(input.version!==c.version)fail('Thông tin nhóm đã thay đổi. Mở lại hộp thao tác.',409);
  const action=input.action;if(!['rename','add','remove','leave','disband'].includes(action))fail('Thao tác nhóm không hợp lệ.');
  if(input.confirm!==true)fail('Cần xác nhận thay đổi nhóm trên Zalo.');
  if(['leave','disband'].includes(action)&&input.confirmName!==(c.title||c.group?.name))fail('Nhập chính xác tên nhóm để xác nhận.');
  if(action==='rename')input.name=required(input.name,'Tên nhóm',50);
  if(['add','remove'].includes(action)&&(!Array.isArray(input.memberIds)||!input.memberIds.length||input.memberIds.length>100||input.memberIds.some(id=>typeof id!=='string'||!/^\d+$/.test(id))))fail('Danh sách thành viên không hợp lệ.');
  if(groupJobs.has(c.connectionId))fail('Đang xử lý nhóm trên kênh này.',409);groupJobs.add(c.connectionId);
  try{await changeGroup(c.connectionId,c.externalUserId,action,input);audit(user.id,'zalo_group_'+action,c.id);return put('conversations',{...get('conversations',c.id),...(action==='rename'?{title:input.name}:{}),...(['leave','disband'].includes(action)?{archived:true,groupUnavailable:true}:{}),groupNeedsSync:true});}finally{groupJobs.delete(c.connectionId);}
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
  if(input.version!==r.version)fail('Nhắc hẹn đã thay đổi. Hãy tải lại.',409);
  if(!['done','cancelled'].includes(input.status))fail('Trạng thái không hợp lệ.');
  const result=put('chat_reminders',{...r,status:input.status,completedAt:now()},input.version);audit(user.id,'chat_reminder_updated',r.id);return result;
 }
 match=path.match(/^\/api\/chat\/messages\/([^/]+)$/);
 if(match&&method==='PATCH'){
  const m=get('messages',match[1]);if(!m)fail('Không tìm thấy tin nhắn.',404);chatConversation(user,m.conversationId);
  if(input.version!==m.version)fail('Tin nhắn đã thay đổi. Hãy tải lại.',409);
  if(typeof input.pinned!=='boolean')fail('Trạng thái ghim không hợp lệ.');
  return put('messages',{...m,pinned:input.pinned,pinnedBy:input.pinned?user.id:null},input.version);
 }
 fail('Chức năng chat không tồn tại.',404);
}
