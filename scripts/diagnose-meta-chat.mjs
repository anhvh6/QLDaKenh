// Read-only SQLite and provider GETs. Never print tokens, message bodies or peer IDs.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createDecipheriv} from 'node:crypto';
import {resolve,join} from 'node:path';
const dir=resolve(process.env.DATA_DIR||'data'),db=new DatabaseSync(join(dir,'hub.sqlite'),{readOnly:true});
db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
const key=readFileSync(join(dir,'encryption.key')),deadline=AbortSignal.timeout(90000);
const records=kind=>db.prepare('SELECT data FROM records WHERE kind=?').all(kind).map(r=>JSON.parse(r.data));
const channels=records('connections').filter(c=>c.provider==='instagram'&&!c.deletedAt&&c.status==='connected'&&c.mode==='api');
const conversations=records('conversations');
function credential(id){const row=db.prepare('SELECT value FROM secrets WHERE id=?').get(id);if(!row)return {};const b=Buffer.from(row.value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());}
for(const [index,c] of channels.entries()){
 const secret=credential(c.id),own=new Set([c.accountId,secret.pageId].filter(Boolean).map(String)),base='https://graph.facebook.com/'+(c.apiVersion||'v25.0');
 console.log(JSON.stringify({channel:index+1,provider:c.provider,linkedPage:!!secret.pageId}));
 const read=async(label,path)=>{
  const start=Date.now();try{
   const res=await fetch(base+'/'+path,{headers:{Authorization:'Bearer '+secret.token},signal:AbortSignal.any([deadline,AbortSignal.timeout(20000)])}),data=await res.json();
   if(data.error||!res.ok){console.log(JSON.stringify({probe:label,http:res.status,ms:Date.now()-start,providerCode:data.error?.code,subcode:data.error?.error_subcode,message:String(data.error?.message||'').split(String(secret.token||'__no_token__')).join('[redacted]').replace(/https?:\/\/\S+/g,'[url]').slice(0,700)}));return null;}
   console.log(JSON.stringify({probe:label,http:res.status,ms:Date.now()-start,rows:Array.isArray(data.data)?data.data.length:undefined}));return data;
  }catch(error){console.log(JSON.stringify({probe:label,ms:Date.now()-start,networkCode:error.cause?.code||error.code||error.name}));return null;}
 };
 const profile=await read('business-profile',encodeURIComponent(c.accountId)+'?fields=id,username');
 if(profile)console.log(JSON.stringify({businessUsername:profile.username,accountMatches:String(profile.id)===String(c.accountId)}));
 const subscriptions=await read('webhook-subscription',encodeURIComponent(c.accountId)+'/subscribed_apps?fields=subscribed_fields');
 if(subscriptions)console.log(JSON.stringify({messageWebhookSubscribed:(subscriptions.data||[]).some(s=>s.subscribed_fields?.includes('messages')),fields:[...new Set((subscriptions.data||[]).flatMap(s=>s.subscribed_fields||[]))]}));
 for(const [label,id] of [['linked-page',secret.pageId],['instagram-account',c.accountId]]){
  if(!id||deadline.aborted)continue;
  const list=await read(label+'-conversations',encodeURIComponent(id)+'/conversations?platform=instagram&fields=id,updated_time,participants&limit=3');
  for(const [n,thread] of (list?.data||[]).slice(0,2).entries()){
   const page=await read(label+'-messages-'+n,encodeURIComponent(thread.id)+'/messages?limit=20&fields=id,created_time,from,to,message,attachments,sticker');if(!page)continue;
   const rows=page.data||[],timestamps=rows.map(m=>m.created_time).filter(t=>Number.isFinite(Date.parse(t))).sort();
   let stored=0,otherChannel=0;
   for(const m of rows){const hits=db.prepare("SELECT json_extract(c.data,'$.connectionId') AS channel FROM records m JOIN records c ON c.kind='conversations' AND c.id=json_extract(m.data,'$.conversationId') WHERE m.kind='messages' AND json_extract(m.data,'$.externalId')=?").all(String(m.id));if(hits.some(h=>h.channel===c.id))stored++;if(hits.some(h=>h.channel!==c.id))otherChannel++;}
   const peers=new Set(rows.flatMap(m=>[m.from?.id,...(m.to?.data||[]).map(p=>p.id)]).filter(id=>id&&!own.has(String(id))).map(String));
   console.log(JSON.stringify({probe:label+'-summary-'+n,participants:thread.participants?.data?.length||0,messages:rows.length,incoming:rows.filter(m=>m.from?.id&&!own.has(String(m.from.id))).length,outgoing:rows.filter(m=>own.has(String(m.from?.id))).length,missingSender:rows.filter(m=>!m.from?.id).length,missingContent:rows.filter(m=>!Object.hasOwn(m,'message')&&!m.attachments).length,newest:timestamps.at(-1),stored,sameIdsInOtherChannel:otherChannel,localMatchingChats:conversations.filter(v=>v.connectionId===c.id&&peers.has(String(v.externalUserId))).length}));
   const missing=rows.find(m=>!m.from?.id||!Object.hasOwn(m,'message')&&!m.attachments);
   if(missing){const detail=await read(label+'-message-detail-'+n,encodeURIComponent(missing.id)+'?fields=id,created_time,from,to,message,attachments');if(detail)console.log(JSON.stringify({detailHasSender:!!detail.from?.id,detailHasContent:Object.hasOwn(detail,'message')||!!detail.attachments,detailTimestamp:detail.created_time}));}
  }
 }
}
db.close();
