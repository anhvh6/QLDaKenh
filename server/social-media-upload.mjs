import {openAsBlob,statSync} from 'node:fs';
import {basename,join} from 'node:path';
import {get,dataDir} from './store.mjs';
export async function socialMediaBlob(p){
 const assets=(p.assets||[]).map(id=>get('assets',id)).filter(a=>a&&a.active!==false&&a.type===p.type);
 if(assets.length!==1)throw Error('Kênh này cần đúng một tệp ảnh hoặc video đính kèm.');
 const asset=assets[0];if(!/^\/uploads\/asset_[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(asset.url||''))throw Error('Đường dẫn tệp media không hợp lệ.');
 const path=join(dataDir,'uploads',basename(asset.url)),size=statSync(path).size;
 if(!size||size>100*1024*1024)throw Error('Media cần lớn hơn 0 và không quá 100 MB cho cổng này.');
 const mime=asset.mime||({'mp4':'video/mp4','webm':'video/webm','jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png'}[asset.url.split('.').pop()]);
 if(!mime?.startsWith(p.type+'/'))throw Error('Loại tệp không khớp định dạng bài đăng.');
 return {blob:await openAsBlob(path,{type:mime}),name:basename(path),mime,size};
}
export async function uploadSocialMedia(c,p,token,request){
 const file=await socialMediaBlob(p),headers={Authorization:'Bearer '+token};
 if(c.provider==='bluesky'){
  if(p.type==='image'&&file.size>1000000)throw Error('Bluesky: ảnh cần không quá 1 MB.');
  if(p.type==='video'&&file.mime!=='video/mp4')throw Error('Bluesky: hãy dùng video MP4.');
  const r=await request('https://bsky.social/xrpc/com.atproto.repo.uploadBlob',{method:'POST',headers:{...headers,'Content-Type':file.mime},body:file.blob,signal:AbortSignal.timeout(600000)});
  if(!r.blob?.ref)throw Error('Bluesky chưa xác nhận tải media.');
  return p.type==='video'?{$type:'app.bsky.embed.video',video:r.blob}:{$type:'app.bsky.embed.images',images:[{alt:String(p.title||''),image:r.blob}]};
 }
 const form=new FormData();
 if(c.provider==='tumblr'){
  const media={type:file.mime,identifier:'upload'},block=p.type==='video'?{type:'video',media}:{type:'image',media:[media]};
  form.set('json',JSON.stringify({content:[...(p.caption?[{type:'text',text:p.caption}]:[]),block],state:p.visibility==='private'?'private':'published'}));
  form.set('upload',file.blob,file.name);return form;
 }
 form.set('file',file.blob,file.name);
 let r=await request('https://mastodon.social/api/v2/media',{method:'POST',headers,body:form,signal:AbortSignal.timeout(600000)});
 if(!r.id)throw Error('Mastodon chưa trả mã media.');
 for(let i=0;!r.url&&i<30;i++){await new Promise(resolve=>setTimeout(resolve,2000));r=await request('https://mastodon.social/api/v1/media/'+encodeURIComponent(r.id),{headers});}
 if(!r.url)throw Error('Mastodon vẫn xử lý media; chưa tạo bài đăng.');
 return [r.id];
}
