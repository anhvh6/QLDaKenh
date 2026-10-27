// Read-only: inspect existing Meta containers; never create or publish a post.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createDecipheriv} from 'node:crypto';
import {resolve,join} from 'node:path';
const dir=resolve(process.env.DATA_DIR||'data'),db=new DatabaseSync(join(dir,'hub.sqlite'),{readOnly:true});
db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
const key=readFileSync(join(dir,'encryption.key'));
const records=kind=>db.prepare('SELECT data FROM records WHERE kind=?').all(kind).map(r=>JSON.parse(r.data));
function credential(id){const row=db.prepare('SELECT value FROM secrets WHERE id=?').get(id);if(!row)return {};const b=Buffer.from(row.value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());}
const channels=new Map(records('connections').map(c=>[c.id,c]));
const jobs=records('publications').filter(p=>['failed','processing','unknown'].includes(p.status)&&p.containerId&&['instagram','threads'].includes(channels.get(p.connectionId)?.provider)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,6);
for(const p of jobs){
 const c=channels.get(p.connectionId),token=credential(c.id).token;
 const clean=value=>String(value||'').split(token||'__no_token__').join('[redacted]').replace(/https?:\/\/\S+/g,'[url]').slice(0,1400);
 const base=c.provider==='threads'?'https://graph.threads.net/v1.0':`https://graph.facebook.com/${/^v\d+\.\d+$/.test(c.apiVersion||'')?c.apiVersion:'v25.0'}`;
 const start=Date.now();
 try{const r=await fetch(`${base}/${encodeURIComponent(p.containerId)}?fields=${c.provider==='threads'?'status,error_message':'status_code,status'}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)}),data=await r.json();console.log(JSON.stringify({publication:p.id,provider:c.provider,localStatus:p.status,http:r.status,ms:Date.now()-start,containerStatus:clean(data.status_code||data.status),detail:clean(data.error_message||data.status),providerCode:data.error?.code,subcode:data.error?.error_subcode,error:clean(data.error?.message)}));}catch(error){console.log(JSON.stringify({publication:p.id,probe:'container',ms:Date.now()-start,error:error.cause?.code||error.code||error.name}));}
 if(p.mediaUrl){const start=Date.now();try{const r=await fetch(p.mediaUrl,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(12000)});await r.body?.cancel();console.log(JSON.stringify({publication:p.id,probe:'media-range',http:r.status,ms:Date.now()-start,type:r.headers.get('content-type'),length:r.headers.get('content-length'),range:r.headers.get('content-range'),serverTiming:r.headers.get('server-timing')}));}catch(error){console.log(JSON.stringify({publication:p.id,probe:'media-range',ms:Date.now()-start,error:error.cause?.code||error.code||error.name}));}}
}
db.close();
