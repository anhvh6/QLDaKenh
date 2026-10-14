import {openAsBlob,statSync} from 'node:fs';
import {join,basename} from 'node:path';
import {dataDir,get,put} from './store.mjs';

const uploads=new Map();
export async function facebookMedia(channel,asset,request,token){
 if(!/^\/uploads\/asset_[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(asset.url||''))throw Error('Media không hợp lệ.');
 const file=join(dataDir,'uploads',basename(asset.url)),stat=statSync(file),id=channel.id+':'+asset.id;
 const fingerprint=[asset.version||0,stat.size,stat.mtimeMs].join(':'),cached=get('facebook_media_cache',id);
 if(cached?.fingerprint===fingerprint)return {type:asset.type,payload:{attachment_id:cached.attachmentId}};
 if(uploads.has(id))return uploads.get(id);
 const job=(async()=>{
  const form=new FormData();form.set('message',JSON.stringify({attachment:{type:asset.type,payload:{is_reusable:true}}}));form.set('filedata',await openAsBlob(file,{type:asset.mime||'application/octet-stream'}),asset.name||basename(file));
  let result;try{result=await request(`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}/${encodeURIComponent(channel.accountId)}/message_attachments`,{method:'POST',headers:{Authorization:'Bearer '+token},body:form});}catch(error){throw Object.assign(new Error('Không tải được media lên Facebook: '+error.message),{unknown:false});}
  if(!result.attachment_id)throw Error('Facebook chưa xác nhận tải media.');
  put('facebook_media_cache',{id,fingerprint,attachmentId:String(result.attachment_id)});
  return {type:asset.type,payload:{attachment_id:String(result.attachment_id)}};
 })();uploads.set(id,job);try{return await job;}finally{uploads.delete(id);}
}
export async function facebookMessageMedia(channel,assets,request,token){
 // Upload in small parallel batches; publication remains one grouped image message.
 const prepared=[];for(let i=0;i<assets.length;i+=3)prepared.push(...await Promise.all(assets.slice(i,i+3).map(a=>facebookMedia(channel,a,request,token))));
 const messages=[];let images=[];const flush=()=>{if(images.length){messages.push(images.length===1?{attachment:images[0]}:{attachments:images});images=[];}};
 for(const media of prepared){if(media.type==='image')images.push(media);else{flush();messages.push({attachment:media});}}flush();return messages;
}
