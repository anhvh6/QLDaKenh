import {statSync,readFileSync} from 'node:fs';
import {join,basename} from 'node:path';
import {dataDir,secret} from './store.mjs';
import {publicMediaUrl} from './public-media.mjs';

export function validateInstagramImages(assets){
 for(const asset of assets){
  if(asset.type!=='image'||asset.mime&&!['image/jpeg','image/png'].includes(asset.mime))throw Error('Ảnh chat Instagram cần định dạng JPG hoặc PNG.');
  if(!/^\/uploads\/asset_[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(asset.url||''))throw Error('Ảnh Instagram không hợp lệ.');
  const file=join(dataDir,'uploads',basename(asset.url)),size=statSync(file).size;
  if(!size||size>8*1024*1024)throw Error('Ảnh chat Instagram phải nhỏ hơn hoặc bằng 8 MB.');
  // Older quick-reply downloads have no MIME metadata. Check the actual file bytes.
  const head=readFileSync(file).subarray(0,8);
  if(!(head[0]===255&&head[1]===216&&head[2]===255)&&!head.equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Ảnh chat Instagram cần là tệp JPG hoặc PNG hợp lệ.');
 }
}

export async function sendInstagramMessage(channel,conversation,text,assets,token,request){
 if(!conversation.lastInboundAt||!Number.isFinite(Date.parse(conversation.lastInboundAt))||Date.now()-Date.parse(conversation.lastInboundAt)>86400000)throw Error('Ngoài cửa sổ nhắn tin Instagram 24 giờ. Khách cần gửi tin nhắn cho kênh trước.');
 // This connector uses Facebook Login and a Page token, so Send API targets the linked Page.
 const pageId=secret(channel.id).pageId;
 if(!pageId)throw Error('Kết nối Instagram thiếu Facebook Page liên kết. Kết nối lại Instagram trong Cài đặt trước khi gửi.');
 validateInstagramImages(assets);
 // Validate every attachment before sending the first part, so invalid media cannot send only the text.
 const media=assets.map(asset=>({attachment:{type:'image',payload:{url:publicMediaUrl(asset)}}}));
 const messages=[...(text?[{text}]:[]),...media],externalMessages=[];
 if(!messages.length)throw Error('Nhập nội dung hoặc chọn ảnh.');
 try{
  for(const message of messages){
   const r=await request(`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}/${encodeURIComponent(pageId)}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:conversation.externalUserId},messaging_type:'RESPONSE',message}),signal:AbortSignal.timeout(45000)});
   if(!r.message_id)throw Object.assign(Error('Instagram chưa xác nhận tin nhắn. Kiểm tra ứng dụng gốc trước khi thử lại.'),{unknown:true});
   externalMessages.push({id:String(r.message_id)});
  }
 }catch(error){if(externalMessages.length)throw Object.assign(Error('Một phần tin nhắn Instagram đã gửi. Kiểm tra ứng dụng gốc trước khi gửi lại. '+error.message),{unknown:true,externalMessages});throw error;}
 return {message_id:externalMessages[0].id,externalMessages};
}
