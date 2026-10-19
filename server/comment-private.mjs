import {all,get,put,db,transaction} from './store.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
export function openCommentPrivateChat(user,id){
 permission(user,'inbox');const source=get('conversations',id);if(!source||source.kind!=='comment'||source.deletedAt||source.remoteDeleted)fail('Không tìm thấy bình luận.',404);assertChannel(user,source.connectionId);
 const channel=get('connections',source.connectionId);if(channel?.status!=='connected'||!['facebook','instagram'].includes(channel.provider))fail('Kênh này chưa hỗ trợ nhắn riêng từ bình luận.',409);
 return transaction(()=>{
 const peers=all('conversations').filter(c=>c.connectionId===source.connectionId&&c.kind==='message'&&!c.deletedAt&&!c.remoteDeleted);
 const existing=peers.find(c=>c.privateReplySourceId===source.id)||peers.find(c=>c.customerId===source.customerId)||peers.find(c=>source.externalUserId!==source.externalCommentId&&c.externalUserId===source.externalUserId);if(existing)return existing;
 const root=db.prepare("SELECT data FROM records INDEXED BY idx_messages_live_order WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction')='incoming' AND json_extract(data,'$.externalId')=? LIMIT 1").get(source.id,source.externalCommentId),createdAt=root?JSON.parse(root.data).createdAt:source.createdAt;
 return put('conversations',{id:'comment-private-'+source.id,kind:'message',mode:source.mode,connectionId:source.connectionId,customerId:source.customerId,externalUserId:source.externalUserId!==source.externalCommentId?source.externalUserId:'',status:'open',tags:[...(source.tags||[])],assignee:user.id,privateReplySourceId:source.id,privateReplyCommentId:source.externalCommentId,privateReplyCommentAt:createdAt,lastAt:source.lastAt||source.createdAt,lastMessage:'',unread:false});
 });
}
export async function sendCommentPrivateReply(channel,conv,text,options,request,token,time=Date.now()){
 if(options.assetRefs?.length)throw Error('Tin nhắn riêng đầu tiên từ bình luận chỉ dùng văn bản.');
 if(!text.trim())throw Error('Nhập nội dung tin nhắn riêng.');
 const created=Date.parse(conv.privateReplyCommentAt||'');if(!Number.isFinite(created)||time-created>7*86400000)throw Error('Bình luận đã quá thời hạn nhắn riêng 7 ngày. Khách cần nhắn cho kênh trước khi tiếp tục.');
 const prior=db.prepare("SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction')='outgoing' AND json_extract(data,'$.status') IN ('accepted','sent','unknown') LIMIT 1").get(conv.id);
 if(prior||conv.privateReplySentAt)throw Error('Đã gửi hoặc chưa xác định kết quả tin nhắn riêng cho bình luận này. Cần chờ khách phản hồi trước khi gửi tiếp.');
 const base='https://graph.facebook.com/'+(channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0');
 const url=channel.provider==='instagram'?base+'/'+encodeURIComponent(channel.accountId)+'/messages':base+'/'+encodeURIComponent(conv.privateReplyCommentId)+'/private_replies';
 const body=channel.provider==='instagram'?{recipient:{comment_id:conv.privateReplyCommentId},message:{text}}:{message:text};
 const result=await request(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!result.message_id&&!result.id)throw Object.assign(Error('Nền tảng chưa xác nhận gửi tin nhắn riêng. Kiểm tra ứng dụng gốc trước khi thử lại.'),{unknown:true});
 return {...result,privateReply:true};
}
