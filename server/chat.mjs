import {learnerStages,progressFor} from '../public/learner-progress.js';
import {all,get,put,db,transaction,audit,now} from './store.mjs';
import {permission,fail,required} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {groupDetails,changeGroup,newGroup,friendAction} from './zalo.mjs';
import {defaultNameSettings,nameConditions} from '../public/chat-names.js';
const groupJobs=new Set();
const friendJobs=new Set();

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
 const progressMatch=path.match(/^\/api\/chat\/conversations\/([^/]+)\/progress$/);
 if(progressMatch&&method==='POST'){
  const c=chatConversation(user,progressMatch[1]);if(c.threadType===1)fail('Chọn hồ sơ học viên cụ thể, không gán tiến trình cho cả nhóm.');
  const p=get('customers',c.customerId);if(!p)fail('Không tìm thấy khách.',404);if(input.customerVersion!==p.version)fail('Hồ sơ đã thay đổi. Mở lại tiến trình.',409);
  if(!learnerStages[input.stage])fail('Tiến trình không hợp lệ.');const note=String(input.note||'').trim();if(note.length>2000)fail('Ghi chú quá dài.');
  const current=progressFor({journeys:all('journeys'),orders:all('orders'),chatPlanSummaries:all('study_plans').map(r=>{const o=get('orders',r.lastOrderId);return {customerId:r.customerId,startDate:r.customer?.start_date,endDate:r.customer?.end_date,status:o&&(o.status==='cancelled'||o.paid<o.total)?'REVOKED':r.customer?.status};}),chatNameSettings:get('settings','chat-names')},p);
  if(['STUDYING','EXPIRING','EXPIRED'].includes(input.stage)&&(current.source!=='plan'||current.stage!==input.stage))fail('Bước học phải khớp phác đồ đã kích hoạt và thời hạn. Hãy cập nhật phác đồ trước.');
  if(current.source==='plan'&&input.stage!==current.stage)fail('Phác đồ đang xác định tiến trình. Cập nhật phác đồ trước khi chuyển bước.');
  const next={stage:input.stage,source:'staff',updatedBy:user.id,updatedAt:now(),note};
  if(input.stage==='DEPOSIT'){const amount=Number(input.depositAmount);if(!Number.isInteger(amount)||amount<=0||amount>1e12)fail('Nhập số tiền cọc hợp lệ.');if(input.paymentConfirmed!==true)fail('Xác nhận đã kiểm tra giao dịch đặt cọc.');next.depositAmount=amount;next.paymentReference=String(input.paymentReference||'').slice(0,200);}
  if(input.stage==='APPOINTMENT'){const at=Date.parse(input.appointmentAt);if(!Number.isFinite(at))fail('Nhập lịch tư vấn cụ thể.');next.appointmentAt=new Date(at).toISOString();}
  if(input.stage==='CONSULTED'&&!note)fail('Ghi nhận kết quả tư vấn trước khi chuyển bước.');
  if(input.stage==='PAID'){const amount=Number(input.paidAmount),fee=Number(input.courseFee);if(!Number.isInteger(amount)||amount<0||!Number.isInteger(fee)||fee<=0||fee>1e12||amount>1e12)fail('Nhập học phí và số tiền đã kiểm tra.');if(input.paymentConfirmed!==true)fail('Xác nhận đã kiểm tra thanh toán.');if(amount<fee&&(input.paidOverride!==true||!note))fail('Số tiền ít hơn học phí: chọn Đã thanh toán đủ và ghi lý do chính sách.');next.paidAmount=amount;next.courseFee=fee;next.paidOverride=amount<fee;next.paymentReference=String(input.paymentReference||'').slice(0,200);}
  return transaction(()=>{const result=put('customers',{...p,learnerProgress:{...p.learnerProgress,...next}},p.version);put('journey_events',{customerId:p.id,from:current.stage,to:input.stage,actor:user.id,reason:note,source:'chat_progress'});audit(user.id,'learner_progress_updated',p.id,{from:current.stage,to:input.stage});return result;});
 }
 if(path==='/api/chat/name-settings'&&method==='PUT'){
  if(user.role!=='owner')fail('Chỉ chủ hệ thống được cấu hình màu tên.',403);
  const prev=get('settings','chat-names');if(input.version!==(prev?.version||0))fail('Cấu hình đã thay đổi. Hãy tải lại.',409);
  if(!Number.isInteger(input.expiringDays)||input.expiringDays<1||input.expiringDays>90)fail('Ngưỡng sắp hết hạn phải từ 1–90 ngày.');
  if(!Array.isArray(input.rules)||input.rules.length>50)fail('Tối đa 50 quy tắc.');
  const ids=new Set(),rules=input.rules.map(r=>{if(!r||typeof r!=='object')fail('Quy tắc không hợp lệ.');if(typeof r.id!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(r.id)||ids.has(r.id))fail('Mã quy tắc không hợp lệ hoặc trùng.');ids.add(r.id);if(!Object.hasOwn(nameConditions,r.condition)||!/^#[0-9a-f]{6}$/i.test(r.color)||typeof r.enabled!=='boolean')fail('Điều kiện hoặc màu không hợp lệ.');return {id:r.id,label:required(r.label,'Tên trạng thái',80),color:r.color,condition:r.condition,enabled:r.enabled,value:r.condition==='tag'?required(r.value,'Tên nhãn',40):''};});
  const result=put('settings',{id:defaultNameSettings.id,expiringDays:input.expiringDays,rules},prev?.version);audit(user.id,'chat_name_settings_updated',result.id);return result;
 }
 let nameMatch=path.match(/^\/api\/chat\/conversations\/([^/]+)\/(rename|name-statuses|friend)$/);
 if(nameMatch&&['POST','PATCH'].includes(method)){
  const c=chatConversation(user,nameMatch[1]),action=nameMatch[2],p=get('customers',c.customerId);
  if(input.version!==c.version)fail('Hội thoại đã thay đổi. Hãy mở lại thao tác.',409);
  if(action==='rename'){
   const name=required(input.name,'Tên hiển thị',200);
   if(c.threadType!==1&&input.customerVersion!==p?.version)fail('Hồ sơ khách đã thay đổi. Hãy mở lại thao tác.',409);
   return transaction(()=>{if(c.threadType!==1){if(!p)fail('Không tìm thấy hồ sơ khách.',404);put('customers',{...p,name,nameEditedLocally:true},p.version);}const result=put('conversations',{...c,...(c.threadType===1?{title:name,localGroupName:true}:{title:undefined})},c.version);audit(user.id,'chat_display_name_updated',c.id,{scope:c.threadType===1?'conversation':'customer'});return result;});
  }
  if(c.threadType===1)fail('Chỉ áp dụng cho chat cá nhân.');
  if(action==='name-statuses'){
   if(!p)fail('Không tìm thấy hồ sơ khách.',404);if(input.customerVersion!==p.version)fail('Hồ sơ khách đã thay đổi. Hãy mở lại thao tác.',409);
   const rules=(get('settings','chat-names')||defaultNameSettings).rules,ids=input.statusIds;
   if(!Array.isArray(ids)||ids.length>50||ids.some(id=>!rules.some(r=>r.id===id&&r.condition==='manual')))fail('Chỉ gán các trạng thái thủ công đã cấu hình.');
   const result=put('customers',{...p,chatStatusIds:[...new Set(ids)]},p.version);audit(user.id,'chat_name_statuses_updated',p.id);return result;
  }
  const ch=get('connections',c.connectionId);if(ch?.provider!=='zalo_personal'||ch.mode!=='api'||ch.status!=='connected')fail('Cần kênh Zalo cá nhân API đã kết nối.');
  if(!['request','remove','sync'].includes(input.action))fail('Thao tác kết bạn không hợp lệ.');
  if(input.action!=='sync'&&input.confirm!==true)fail('Cần xác nhận thao tác trên Zalo.');
  const key=c.connectionId+':'+c.externalUserId;if(friendJobs.has(key))fail('Đang cập nhật quan hệ Zalo.',409);friendJobs.add(key);
  try{const result=await friendAction(c.connectionId,c.externalUserId,input.action,String(input.message||'').slice(0,250));const current=get('conversations',c.id);const updated=put('conversations',{...current,...result,friendSyncedAt:now()});audit(user.id,'zalo_friend_'+input.action,c.id);return updated;}finally{friendJobs.delete(key);}
 }
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
  return put('conversations',{...current,group:details,groupNeedsSync:false,title:current.localGroupName?current.title:(details.name||current.title)});
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
  try{await changeGroup(c.connectionId,c.externalUserId,action,input);audit(user.id,'zalo_group_'+action,c.id);return put('conversations',{...get('conversations',c.id),...(action==='rename'?{title:input.name,localGroupName:false}:{}),...(['leave','disband'].includes(action)?{archived:true,groupUnavailable:true}:{}),groupNeedsSync:true});}finally{groupJobs.delete(c.connectionId);}
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
