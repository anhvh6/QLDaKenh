// Read-only diagnostic: aggregate timings only, no customer content or credentials.
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.argv[2]||'data/hub.sqlite',{readOnly:true});
const conv=db.prepare("SELECT id,json_extract(data,'$.connectionId') channel FROM records WHERE kind='conversations' AND json_extract(data,'$.kind')='comment' LIMIT 1").get();
if(!conv)throw Error('No synchronized comments to benchmark.');
const message=db.prepare("SELECT json_extract(data,'$.externalId') external FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? LIMIT 1").get(conv.id);
const exact=db.prepare(`SELECT m.id,m.data,m.version FROM records m INDEXED BY idx_messages_external JOIN records c ON c.kind='conversations' AND c.id=json_extract(m.data,'$.conversationId') WHERE m.kind='messages' AND json_extract(m.data,'$.externalId')=? AND json_extract(c.data,'$.connectionId')=? AND json_extract(c.data,'$.kind')='comment' ORDER BY m.updated_at DESC LIMIT 1`);
const fallback=db.prepare(`SELECT m.id,m.data,m.version FROM records c INDEXED BY idx_comment_channel CROSS JOIN records m INDEXED BY idx_messages_conversation ON m.kind='messages' AND json_extract(m.data,'$.conversationId')=+c.id WHERE c.kind='conversations' AND json_extract(c.data,'$.connectionId')=? AND json_extract(c.data,'$.kind')='comment' AND EXISTS(SELECT 1 FROM json_each(m.data,'$.externalMessages') e WHERE json_extract(e.value,'$.id')=?) ORDER BY m.updated_at DESC LIMIT 1`);
const measure=(name,fn)=>{const start=performance.now();for(let i=0;i<10;i++)fn();console.log(JSON.stringify({name,lookups:10,ms:Math.round(performance.now()-start)}));};
console.log(JSON.stringify({messages:db.prepare("SELECT count(*) n FROM records WHERE kind='messages'").get().n}));
measure('previous full-history lookup',()=>{const ids=new Set(db.prepare("SELECT id,data FROM records WHERE kind='conversations'").all().filter(r=>{const c=JSON.parse(r.data);return c.connectionId===conv.channel&&c.kind==='comment';}).map(r=>r.id));db.prepare("SELECT data FROM records WHERE kind='messages' ORDER BY updated_at DESC").all().map(r=>JSON.parse(r.data)).find(m=>ids.has(m.conversationId)&&(m.externalId===message.external||(m.externalMessages||[]).some(x=>x.id===message.external)));});
measure('indexed existing lookup',()=>exact.get(message.external,conv.channel));
measure('indexed new lookup with receipt fallback',()=>exact.get('benchmark-nonexistent-id',conv.channel)||fallback.get(conv.channel,'benchmark-nonexistent-id'));
db.close();
