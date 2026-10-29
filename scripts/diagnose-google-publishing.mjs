// No publishing/upload calls. Local DB is read-only; a token refresh probe does
// not save or print credentials. Profile probes only report success/failure.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createDecipheriv} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {execFileSync} from 'node:child_process';
import {googleRefreshClient} from '../server/google-oauth-client.mjs';
import {googleAPIError} from '../server/google-api-error.mjs';
try{loadEnvFile('.env');}catch{}
try{const apps=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']})),env=apps.find(a=>a.name==='qlda-kenh')?.pm2_env||{};for(const k of ['DATA_DIR','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'])if(!process.env[k]&&env[k])process.env[k]=String(env[k]);}catch{}
const dir=resolve(process.env.DATA_DIR||'data'),db=new DatabaseSync(join(dir,'hub.sqlite'),{readOnly:true});
db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
const key=readFileSync(join(dir,'encryption.key'));
const records=kind=>db.prepare('SELECT data FROM records WHERE kind=?').all(kind).map(r=>JSON.parse(r.data));
function credential(id){const row=db.prepare('SELECT value FROM secrets WHERE id=?').get(id);if(!row)return {};const b=Buffer.from(row.value,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}
const publications=records('publications');
for(const c of records('connections').filter(c=>['blogger','youtube'].includes(c.provider)&&!c.deletedAt&&c.status!=='disconnected')){
 const s=credential(c.id),client=googleRefreshClient(s),hide=value=>{let v=String(value||'');for(const secret of [s.token,s.refreshToken,client.clientId,client.clientSecret].filter(Boolean))v=v.split(secret).join('[redacted]');return v.replace(/https?:\/\/\S+/g,'[url]').slice(0,700);};
 const failures=publications.filter(p=>p.connectionId===c.id&&['failed','unknown','blocked'].includes(p.status)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,8);
 console.log(JSON.stringify({channel:c.id,provider:c.provider,hasRefreshToken:!!s.refreshToken,hasClient:!!client.clientId&&!!client.clientSecret,expired:!!s.expiresAt&&Number(s.expiresAt)<Date.now(),failures:failures.map(p=>({id:p.id,status:p.status,hasExternalId:!!p.externalId,error:hide(p.error),failure:p.publicationFailure,otherPublishedSameContent:publications.some(q=>q.id!==p.id&&q.connectionId===p.connectionId&&q.contentId&&q.contentId===p.contentId&&q.status==='published')}))}));
 let token=s.token;
 if(s.refreshToken){const start=Date.now();try{const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.clientId,client_secret:client.clientSecret,refresh_token:s.refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)}),data=await r.json(),error=googleAPIError('https://oauth2.googleapis.com/token',data);console.log(JSON.stringify({channel:c.id,probe:'oauth-refresh',http:r.status,ms:Date.now()-start,code:error?.code,message:hide(error?.message),receivedAccessToken:!!data.access_token}));if(!r.ok||!data.access_token)continue;token=data.access_token;}catch(e){console.log(JSON.stringify({channel:c.id,probe:'oauth-refresh',error:hide(e.cause?.code||e.code||e.name)}));continue;}}
 const url=c.provider==='youtube'?'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true':`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(c.accountId)}`;
 try{const r=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)}),data=await r.json(),error=googleAPIError(url,data);console.log(JSON.stringify({channel:c.id,probe:'channel-read',http:r.status,code:error?.code,message:hide(error?.message),accountMatches:c.provider==='youtube'?(data.items||[]).some(x=>x.id===c.accountId):String(data.id)===String(c.accountId)}));}catch(e){console.log(JSON.stringify({channel:c.id,probe:'channel-read',error:hide(e.cause?.code||e.code||e.name)}));}
}
db.close();
