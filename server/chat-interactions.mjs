import {db,get,put,all,transaction,audit,now} from './store.mjs';
import {permission,fail,reply} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {sendMessageReaction} from './zalo.mjs';
const typing=new Map(),busy=new Set();
export const reactionEmoji={heart:'❤️',like:'👍',haha:'😆',wow:'😮',cry:'😢',angry:'😡'};
function conversation(user,id){permission(user,'inbox');const c=get('conversations',id);if(!c||c.deletedAt)fail('Không tìm thấy hội thoại.',404);assertChannel(user,c.connectionId);return c;}
export async function interactionRoute(path,method,input,user,send=sendMessageReaction,forwardSend=reply){
 if(path==='/api/chat/messages/forward'&&method==='POST'){
  permission(user,'inbox');
  const {operationId,messageIds,targetIds}=input;
  if(typeof operationId!=='string'||!/^[-a-zA-Z0-9]{16,100}$/.test(operationId)||!Array.isArray(messageIds)||!messageIds.length||messageIds.length>50||!Array.isArray(targetIds)||!targetIds.length||targetIds.length>20||[...messageIds,...targetIds].some(id=>typeof id!=='string'))fail('Chọn tối đa 50 tin và 20 nơi nhận.');
  if(new Set(messageIds).size!==messageIds.length||new Set(targetIds).size!==targetIds.length)fail('Danh sách bị trùng.');
  const key=user.id+':'+operationId,existing=get('chat_forward_jobs',key),spec=JSON.stringify({messageIds,targetIds});
  if(existing){if(existing.spec!==spec)fail('Lượt chuyển tiếp đã dùng cho lựa chọn khác.',409);if(existing.complete)return {results:existing.results};fail('Lượt chuyển tiếp đang xử lý hoặc chưa rõ kết quả; kiểm tra hội thoại nhận trước khi gửi lại.',409);}
  const rows=messageIds.map(id=>{const m=get('messages',id);if(!m||m.deletedAt||m.direction==='note')fail('Không chuyển tiếp tin đã xóa hoặc ghi chú nội bộ.');conversation(user,m.conversationId);return m;});
  const targets=targetIds.map(id=>{const c=conversation(user,id),ch=get('connections',c.connectionId);if(c.kind==='comment'||c.groupUnavailable||!ch||ch.mode!=='demo'&&ch.status!=='connected')fail('Nơi nhận chưa sẵn sàng gửi tin.');return c;});
  const content=rows.map(m=>{const links=(m.attachments||[]).filter(a=>!a.assetId).map(a=>{try{const u=new URL(a.url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}).filter(Boolean),text=[m.text,...links].filter(Boolean).join('\n'),assetIds=[...new Set((m.attachments||[]).map(a=>a.assetId).filter(Boolean))];if(!text.trim()&&!assetIds.length)fail('Tin này chưa có nội dung hoặc media để chuyển tiếp.');if(text.length>5000||assetIds.length>10)fail('Nội dung chuyển tiếp vượt giới hạn gửi.');for(const id of assetIds){const a=get('assets',id);if(!a||a.active===false)fail('Media không còn khả dụng.');if(a.connectionId)assertChannel(user,a.connectionId);}return {text,assetIds};});
  put('chat_forward_jobs',{id:key,spec,actor:user.id,results:[],complete:false});const results=[];
  for(const c of targets){for(let i=0;i<content.length;i++){try{const m=await forwardSend(user,c.id,{...content[i],note:false,version:get('conversations',c.id).version});results.push({targetId:c.id,sourceId:rows[i].id,messageId:m.id,ok:true});}catch(err){results.push({targetId:c.id,sourceId:rows[i].id,ok:false,error:String(err.message).slice(0,350)});}put('chat_forward_jobs',{...get('chat_forward_jobs',key),results});}}
  put('chat_forward_jobs',{...get('chat_forward_jobs',key),complete:true});audit(user.id,'messages_forwarded',operationId,{messageIds,targetIds,sent:results.filter(r=>r.ok).length});return {results};
 }
 const presence=path.match(/^\/api\/chat\/conversations\/([^/]+)\/typing$/);
 if(presence){const c=conversation(user,presence[1]),key=c.id+':'+user.id;if(method==='POST'){if(typeof input.active!=='boolean')fail('Trạng thái không hợp lệ.');if(input.active)typing.set(key,{conversationId:c.id,userId:user.id,until:Date.now()+6000});else typing.delete(key);}if(['GET','POST'].includes(method)){const people=[];for(const [id,p] of typing){if(p.until<Date.now()){typing.delete(id);continue;}if(p.conversationId!==c.id||p.userId===user.id)continue;const u=db.prepare('SELECT id,name,role FROM users WHERE id=? AND active=1').get(p.userId);if(!u)continue;try{assertChannel(u,c.connectionId);}catch{continue;}people.push({id:u.id,name:u.name});}return {users:people};}}
 const reaction=path.match(/^\/api\/chat\/messages\/([^/]+)\/reaction$/);
 if(reaction&&method==='POST'){
  const m=get('messages',reaction[1]);if(!m||m.deletedAt||m.direction==='note')fail('Không thể thả cảm xúc vào tin này.',404);const c=conversation(user,m.conversationId),ch=get('connections',c.connectionId);if(!reactionEmoji[input.reaction])fail('Cảm xúc không hợp lệ.');if(busy.has(m.id))fail('Đang gửi cảm xúc. Chờ một chút.',409);
  busy.add(m.id);try{
   if(ch?.mode!=='demo'){if(ch?.provider!=='zalo_personal')fail('Kênh này chưa hỗ trợ gửi cảm xúc.',400);if(!m.externalId||!m.externalClientId)fail('Chưa đủ mã tin nhắn từ nền tảng. Hãy đồng bộ lại.',409);await send(c.connectionId,c.externalUserId,c.threadType,m.externalId,m.externalClientId,input.reaction);}
   const current=get('messages',m.id),reactor=ch?.mode==='demo'?user.id:'platform:'+c.connectionId,result=put('messages',{...current,reactions:[...(current.reactions||[]).filter(r=>r.reactor!==reactor),{reactor,actor:user.id,reaction:input.reaction,emoji:reactionEmoji[input.reaction]}]});audit(user.id,'message_reacted',m.id,{reaction:input.reaction});return result;
  }finally{busy.delete(m.id);}
 }
 if(path==='/api/chat/messages/delete'&&method==='POST'){
  if(input.confirm!==true||!Array.isArray(input.items)||!input.items.length||input.items.length>100)fail('Chọn 1–100 tin nhắn và xác nhận xóa.');
  return transaction(()=>{const ids=new Set(),rows=input.items.map(item=>{if(ids.has(item.id))fail('Tin nhắn bị lặp.');ids.add(item.id);const m=get('messages',item.id);if(!m||m.deletedAt)fail('Không tìm thấy tin nhắn.',404);conversation(user,m.conversationId);if(m.version!==item.version||m.status==='sending')fail('Tin nhắn vừa thay đổi. Tải lại trước khi xóa.',409);return m;});if(new Set(rows.map(m=>m.conversationId)).size!==1)fail('Chọn tin nhắn trong cùng hội thoại.');for(const m of rows){put('messages',{...m,deletedAt:now(),deletedBy:user.id},m.version);audit(user.id,'message_hidden',m.id);}return {deletedIds:rows.map(m=>m.id)};});
 }
}
