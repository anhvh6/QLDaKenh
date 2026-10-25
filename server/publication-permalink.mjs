import {get,put,secret} from './store.mjs';
import {remote} from './connectors.mjs';
const pending=new Map();
export function validPublicationPermalink(value,provider){
 try{const u=new URL(value),host=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&(provider==='instagram'?['instagram.com','www.instagram.com'].includes(host)&&/^\/(p|reel|tv)\/[^/]+/.test(u.pathname):['threads.net','www.threads.net','threads.com','www.threads.com'].includes(host)&&/\/post\//.test(u.pathname))?u.href:'';}catch{return '';}
}
export async function recoverPublicationPermalink(id,{request=remote,time=Date.now()}={}){
 const p=get('publications',id),ch=p&&get('connections',p.connectionId);
 if(!p||!ch||ch.deletedAt||p.deletedAt||!['published','manually_confirmed'].includes(p.status)||!['instagram','threads'].includes(ch.provider)||!/^\d+$/.test(String(p.externalId||''))||ch.status!=='connected')return p;
 if(validPublicationPermalink(p.url,ch.provider)||Date.parse(p.permalinkRetryAt)>time)return p;
 if(pending.has(id))return pending.get(id);
 const job=(async()=>{
  let url='';try{const version=ch.apiVersion||process.env.META_GRAPH_VERSION||'v25.0';if(!/^v\d+\.\d+$/.test(version))throw Error('Invalid Graph version');const base=ch.provider==='threads'?'https://graph.threads.net/v1.0':'https://graph.facebook.com/'+version;const meta=await request(base+'/'+encodeURIComponent(p.externalId)+'?fields=permalink',{headers:{Authorization:'Bearer '+secret(ch.id).token},signal:AbortSignal.timeout(8000)});url=validPublicationPermalink(meta.permalink,ch.provider);}catch{}
  const current=get('publications',id);if(!current||current.deletedAt||current.externalId!==p.externalId||current.connectionId!==p.connectionId||!['published','manually_confirmed'].includes(current.status)||validPublicationPermalink(current.url,ch.provider))return current;
  const attempts=(current.permalinkAttempts||0)+1;
  return put('publications',{...current,...(url?{url}:{}),permalinkAttempts:attempts,permalinkCheckedAt:new Date(time).toISOString(),permalinkRetryAt:url?'':new Date(time+Math.min(3600000,60000*2**Math.min(attempts-1,6))).toISOString()});
 })().finally(()=>pending.delete(id));pending.set(id,job);return job;
}
export async function recoverMissingPermalinks(){
 const {all}=await import('./store.mjs'),time=Date.now();
 const rows=all('publications').filter(p=>p.status==='published'&&!p.deletedAt&&!p.url&&/^\d+$/.test(String(p.externalId||''))&&['instagram','threads'].includes(get('connections',p.connectionId)?.provider)&&get('connections',p.connectionId)?.status==='connected'&&!get('connections',p.connectionId)?.deletedAt&&!(Date.parse(p.permalinkRetryAt)>time)).sort((a,b)=>String(a.permalinkCheckedAt||'').localeCompare(String(b.permalinkCheckedAt||''))).slice(0,2);
 await Promise.allSettled(rows.map(p=>recoverPublicationPermalink(p.id,{time})));
}
