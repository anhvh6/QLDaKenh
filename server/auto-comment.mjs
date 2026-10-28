import {all,get,put,secret,now,db} from './store.mjs';
import {sendMessage,remote,refreshedToken} from './connectors.mjs';
import {assertChannel} from './taophacdo.mjs';
const invalid=message=>Object.assign(Error(message),{status:400});
const supported=new Set(['facebook','instagram','threads','youtube','x','mastodon']);
export function validateAutoComment(value,channels=[],user){
 if(!value?.enabled)return {enabled:false,text:'',assetIds:[]};
 if(!Array.isArray(value.assetIds||[]))throw invalid('Danh sách ảnh bình luận không hợp lệ.');
 const text=String(value.text||'').trim(),assetIds=[...new Set(value.assetIds||[])];
 if(assetIds.length>1)throw invalid('Tự động comment: tối đa 1 ảnh.');
 if(!text&&!assetIds.length)throw invalid('Nhập nội dung hoặc đính kèm ảnh cho tự động comment.');
 if(text.length>10000)throw invalid('Bình luận vượt 10.000 ký tự.');
 for(const id of assetIds){const a=get('assets',id);if(!a||a.active===false||a.type!=='image'||!(a.scopes||['post']).includes('post'))throw invalid('Ảnh bình luận không còn dùng cho đăng bài.');if(user&&a.connectionId)assertChannel(user,a.connectionId);}
 for(const id of channels){const c=get('connections',id);if(!c)throw invalid('Không tìm thấy kênh bình luận.');if(!supported.has(c.provider)||c.mode!=='api')throw invalid(c.name+': chưa hỗ trợ tự động comment.');if(assetIds.length&&!['facebook','threads'].includes(c.provider))throw invalid(c.name+': tự động comment chỉ hỗ trợ văn bản; bỏ ảnh hoặc bỏ kênh này.');const max={threads:500,x:280,mastodon:500,instagram:2200}[c.provider];if(max&&Array.from(text).length>max)throw invalid(c.name+': bình luận vượt '+max+' ký tự.');if(!text&& !['facebook','threads'].includes(c.provider))throw invalid(c.name+': cần nội dung văn bản.');}
 return {enabled:true,text,assetIds};
}
export async function sendPostComment(c,p,config,{request=remote,send=sendMessage,tokenFor=refreshedToken}={}){
 const assets=config.assetIds.map(id=>get('assets',id));
 if(c.provider==='instagram'){
  const r=await request('https://graph.facebook.com/'+(c.apiVersion||process.env.META_GRAPH_VERSION||'v25.0')+'/'+encodeURIComponent(p.externalId)+'/comments',{method:'POST',headers:{Authorization:'Bearer '+secret(c.id).token,'Content-Type':'application/json'},body:JSON.stringify({message:config.text})});return r;
 }
 if(c.provider==='youtube')return request('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet',{method:'POST',headers:{Authorization:'Bearer '+await tokenFor(c),'Content-Type':'application/json'},body:JSON.stringify({snippet:{videoId:p.externalId,topLevelComment:{snippet:{textOriginal:config.text}}}})});
 return send(c,{kind:'comment',externalCommentId:String(p.externalId)},config.text,{assetRefs:assets});
}
let busy=false;
export async function autoCommentTick(send=sendPostComment){
 if(busy)return;busy=true;try{
 const rows=db.prepare("SELECT id FROM records WHERE kind='publications' AND json_extract(data,'$.status')='published' AND json_extract(data,'$.autoComment.enabled')=1 AND (json_extract(data,'$.autoCommentStatus') IS NULL OR json_extract(data,'$.autoCommentStatus')='retry') LIMIT 10").all();
 for(const row of rows){let p=get('publications',row.id);if(p.autoCommentRetryAt&&Date.parse(p.autoCommentRetryAt)>Date.now())continue;const c=get('connections',p.connectionId);if(!c||c.status!=='connected')continue;
 try{const config=validateAutoComment(p.autoComment,[c.id]);if(!p.externalId)throw Error('Bài đăng chưa có ID nền tảng; cần đối soát trước khi comment.');
 p=put('publications',{...p,autoCommentStatus:'sending',autoCommentAttempts:(p.autoCommentAttempts||0)+1,autoCommentError:''});
 const result=await send(c,p,config);const id=result?.id||result?.externalId;if(!id)throw Object.assign(Error('Chưa nhận mã xác nhận bình luận; kiểm tra bài gốc trước khi gửi lại.'),{unknown:true});
 put('publications',{...get('publications',p.id),autoCommentStatus:'sent',autoCommentExternalId:String(id),autoCommentSentAt:now(),autoCommentError:''});
 }catch(error){const retry=error.providerStatus===429&&(p.autoCommentAttempts||0)<3,status=retry?'retry':p.autoCommentStatus==='sending'&&(!error.providerStatus||error.providerStatus>=500)?'unknown':'failed';
 put('publications',{...get('publications',p.id),autoCommentStatus:status,autoCommentError:error.message,autoCommentRetryAt:retry?new Date(Date.now()+60000*(p.autoCommentAttempts||1)).toISOString():''});
 if(!retry)put('notifications',{id:'auto-comment:'+p.id,title:'Tự động comment cần kiểm tra',body:error.message,connectionId:c.id,route:'content',read:false});}
 }
 }finally{busy=false;}
}
export function recoverAutoComments(){for(const p of all('publications').filter(p=>p.autoCommentStatus==='sending'))put('publications',{...p,autoCommentStatus:'unknown',autoCommentError:'Máy chủ khởi động lại khi đang gửi bình luận. Kiểm tra bài gốc để tránh gửi trùng.'});}
