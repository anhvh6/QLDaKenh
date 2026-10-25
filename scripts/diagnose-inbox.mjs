// Read-only, local diagnostics: no tokens, customer names, message bodies or peer IDs.
import {DatabaseSync} from 'node:sqlite';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
const db=new DatabaseSync(join(resolve(process.env.DATA_DIR||'data'),'hub.sqlite'),{readOnly:true});
db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
const read=kind=>db.prepare('SELECT data FROM records WHERE kind=?').all(kind).map(r=>JSON.parse(r.data));
const started=performance.now();
const sizes=db.prepare('SELECT kind,COUNT(*) AS rows,SUM(length(data)) AS bytes FROM records GROUP BY kind ORDER BY bytes DESC').all();
console.log(JSON.stringify({databaseReadMs:Math.round(performance.now()-started),largestCollections:sizes.slice(0,15)},null,2));
const sync=new Map(read('facebook_chat_sync').map(r=>[r.id,r]));
const hooks=new Map(read('facebook_webhook_status').map(r=>[r.id,r]));
const conversations=read('conversations');
for(const [index,c] of read('connections').filter(c=>['instagram','facebook'].includes(c.provider)&&!c.deletedAt).entries()){
 const state=sync.get(c.id)||{},hook=hooks.get(c.id)||{},chats=conversations.filter(v=>v.connectionId===c.id&&!v.deletedAt);
 const error=String(state.error||'').replace(/(?:https?:\/\/\S+|Bearer\s+\S+|access_token[=:]\s*\S+)/gi,'[redacted]');
 console.log(JSON.stringify({channel:index+1,provider:c.provider,status:c.status,mode:c.mode,sync:{status:state.status,at:state.syncedAt,error,protocol:state.syncProtocolVersion,imported:state.imported},webhook:{receivedAt:hook.lastReceivedAt,messageAt:hook.lastMessageEventAt,standbyAt:hook.lastStandbyEventAt},conversations:chats.length,withInbound:chats.filter(v=>v.lastInboundAt).length,privateRepliesWaiting:chats.filter(v=>v.privateReplySentAt&&!v.lastInboundAt).length},null,2));
}
db.close();
