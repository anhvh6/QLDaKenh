// Read-only: inspect existing Meta containers; never create or publish a post.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createDecipheriv} from 'node:crypto';
import {resolve,join} from 'node:path';
const dir=resolve(process.env.DATA_DIR||'data'),db=new DatabaseSync(join(dir,'hub.sqlite'),{readOnly:true});
db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
const key=readFileSync(join(dir,'encryption.key'));
const records=kind=>db.prepare('SELECT data FROM records WHERE kind=?').all(kind).map(r=>JSON.parse(r.data));
function credential(id){const row=db.prepare('SELECT value FROM secrets WHERE id=?').get(id);if(!row)return {};const b=Buffer.from(row.value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());}
let localPort=Number(process.env.PORT||4317);
try{const processes=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}));const app=processes.find(p=>p.name==='qlda-kenh');if(app?.pm2_env?.PORT)localPort=Number(app.pm2_env.PORT);}catch{}
if(existsSync('.env')){const match=readFileSync('.env','utf8').match(/^\s*PORT\s*=\s*["']?(\d+)/m);if(localPort===4317&&match)localPort=Number(match[1]);}
if(!Number.isInteger(localPort)||localPort<1||localPort>65535)localPort=4317;
console.log(JSON.stringify({probe:'local-port',port:localPort}));
const assets=new Map(records('assets').map(a=>[a.id,a]));
const channels=new Map(records('connections').map(c=>[c.id,c]));
const jobs=records('publications').filter(p=>['failed','processing','unknown'].includes(p.status)&&p.containerId&&['instagram','threads'].includes(channels.get(p.connectionId)?.provider)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,6);
for(const p of jobs){
 const c=channels.get(p.connectionId),token=credential(c.id).token;
 const a=assets.get(p.assets?.[0]),file=a?.url?.match(/^\/uploads\/(asset_[\w-]+\.[a-z0-9]+)$/)?.[1],disk=file?join(dir,'uploads',file):null;console.log(JSON.stringify({publication:p.id,probe:'local-file',exists:!!disk&&existsSync(disk),bytes:disk&&existsSync(disk)?statSync(disk).size:null,mediaHost:p.mediaUrl?new URL(p.mediaUrl).hostname:null}));
 if(disk&&existsSync(disk)){try{const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height,pix_fmt:format=duration,size,format_name','-of','json',disk],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}));console.log(JSON.stringify({publication:p.id,probe:'media-codecs',streams:info.streams,format:info.format}));}catch(error){console.log(JSON.stringify({publication:p.id,probe:'media-codecs',error:error.code||'probe-failed'}));}}
 const clean=value=>String(value||'').split(token||'__no_token__').join('[redacted]').replace(/https?:\/\/\S+/g,'[url]').slice(0,1400);
 const base=c.provider==='threads'?'https://graph.threads.net/v1.0':`https://graph.facebook.com/${/^v\d+\.\d+$/.test(c.apiVersion||'')?c.apiVersion:'v25.0'}`;
 const start=Date.now();
 try{const r=await fetch(`${base}/${encodeURIComponent(p.containerId)}?fields=${c.provider==='threads'?'status,error_message':'status_code,status'}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)}),data=await r.json();console.log(JSON.stringify({publication:p.id,provider:c.provider,localStatus:p.status,http:r.status,ms:Date.now()-start,containerStatus:clean(data.status_code||data.status),detail:clean(data.error_message||data.status),providerCode:data.error?.code,subcode:data.error?.error_subcode,error:clean(data.error?.message)}));}catch(error){console.log(JSON.stringify({publication:p.id,probe:'container',ms:Date.now()-start,error:error.cause?.code||error.code||error.name}));}
 if(p.mediaUrl){for(const [route,origin] of [['public',null],['vps-http','http://36.50.55.233'],['local','http://127.0.0.1:'+localPort]]){const start=Date.now();try{const url=new URL(p.mediaUrl);if(origin){const target=new URL(origin);url.protocol=target.protocol;url.host=target.host;}const r=await fetch(url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(12000)});let detail='';if(r.status>=400&&String(r.headers.get('content-type')).startsWith('text/'))detail=clean((await r.text()).slice(0,500));else await r.body?.cancel();console.log(JSON.stringify({publication:p.id,probe:'media-range',route,http:r.status,ms:Date.now()-start,type:r.headers.get('content-type'),length:r.headers.get('content-length'),range:r.headers.get('content-range'),serverTiming:r.headers.get('server-timing'),proxyError:r.headers.get('x-vercel-error'),detail}));}catch(error){console.log(JSON.stringify({publication:p.id,probe:'media-range',route,ms:Date.now()-start,error:error.cause?.code||error.code||error.name}));}}}

}
for(const p of records('publications').filter(p=>channels.get(p.connectionId)?.provider==='bluesky'&&['failed','unknown','processing'].includes(p.status)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,5)){
 console.log(JSON.stringify({publication:p.id,provider:'bluesky',localStatus:p.status,hasExternalId:!!p.externalId,socialVerification:!!p.socialVerification,attempts:p.attempts,phase:p.publicationFailure?.phase||'not-recorded',failureHost:p.publicationFailure?.host||'',failureHttp:p.publicationFailure?.http||null,mediaStage:!!p.publicationFailure?.mediaStage}));
 if(!/^at:\/\//.test(p.externalId||''))continue;
 for(const host of ['public.api.bsky.app','api.bsky.app']){const start=Date.now();try{const r=await fetch('https://'+host+'/xrpc/app.bsky.feed.getPosts?'+new URLSearchParams({uris:p.externalId}),{headers:{Accept:'application/json','User-Agent':'QLDaKenh/2.1'},signal:AbortSignal.timeout(12000)}),type=r.headers.get('content-type')||'';let posts=[];if(type.includes('json'))posts=(await r.json()).posts||[];else await r.body?.cancel();console.log(JSON.stringify({publication:p.id,probe:'bluesky-post-read',host,http:r.status,type,ms:Date.now()-start,postFound:posts.some(x=>x.uri===p.externalId),videoReady:posts.some(x=>x.uri===p.externalId&&x.embed?.playlist)}));}catch(error){console.log(JSON.stringify({publication:p.id,probe:'bluesky-post-read',host,error:error.cause?.code||error.code||error.name}));}}
}
db.close();
