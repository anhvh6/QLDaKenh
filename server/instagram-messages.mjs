import {statSync} from 'node:fs';
import {join,basename} from 'node:path';
import {dataDir} from './store.mjs';
import {publicMediaUrl} from './public-media.mjs';

export async function sendInstagramMessage(channel,conversation,text,assets,token,request){
 if(!conversation.lastInboundAt||!Number.isFinite(Date.parse(conversation.lastInboundAt))||Date.now()-Date.parse(conversation.lastInboundAt)>86400000)throw Error('Ngoài cửa sổ nhắn tin Instagram 24 giờ. Khách cần gửi tin nhắn cho kênh trước.');
 // Validate every attachment before sending the first part, so invalid media cannot send only the text.
 const media=assets.map(asset=>{
  if(asset.type!=='image'||!['image/jpeg','image/png'].includes(asset.mime))throw Error('Ảnh chat Instagram cần định dạng JPG hoặc PNG.');
  if(!/^\/uploads\/asset_[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(asset.url||''))throw Error('Ảnh Instagram không hợp lệ.');
  const size=statSync(join(dataDir,'uploads',basename(asset.url))).size;
  if(!size||size>8*1024*1024)throw Error('Ảnh chat Instagram phải nhỏ hơn hoặc bằng 8 MB.');
  return {attachment:{type:'image',payload:{url:publicMediaUrl(asset)}}};
 });
 const messages=[...(text?[{text}]:[]),...media],externalMessages=[];
 if(!messages.length)throw Error('Nhập nội dung hoặc chọn ảnh.');
 try{
  for(const message of messages){
   const r=await request(`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}/${encodeURIComponent(channel.accountId)}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:conversation.externalUserId},message}),signal:AbortSignal.timeout(media.length?45000:20000)});
   if(!r.message_id)throw Object.assign(Error('Instagram chưa xác nhận tin nhắn. Kiểm tra ứng dụng gốc trước khi thử lại.'),{unknown:true});
   externalMessages.push({id:String(r.message_id)});
  }
 }catch(error){if(externalMessages.length)throw Object.assign(Error('Một phần tin nhắn Instagram đã gửi. Kiểm tra ứng dụng gốc trước khi gửi lại. '+error.message),{unknown:true,externalMessages});throw error;}
 return {message_id:externalMessages[0].id,externalMessages};
}
