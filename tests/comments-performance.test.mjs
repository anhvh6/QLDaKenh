import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'comments-perf-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,db,saveSecret}=await import('../server/store.mjs');
const {commentsSnapshot}=await import('../server/comments-snapshot.mjs');
const {localCommentContext,commentContextPreview}=await import('../server/comment-context.mjs');
const {chatRoute}=await import('../server/chat.mjs');
const {upsertComment}=await import('../server/comments.mjs');
const owner={id:'owner',role:'owner'},staff={id:'staff',role:'support'};
for(const id of ['a','b']){put('connections',{id,provider:'facebook',mode:'api',status:'connected'});saveSecret(id,{token:'test'});put('customers',{id:'p'+id,name:id});put('conversations',{id:'c'+id,kind:'comment',connectionId:id,customerId:'p'+id,externalCommentId:'external-'+id,unread:true});put('messages',{id:'m'+id,conversationId:'c'+id,externalId:'external-'+id,direction:'incoming',text:'Comment '+id});}
put('team_members',{id:'tm',userId:staff.id,teamId:'t'});put('channel_teams',{id:'ct',teamId:'t',connectionId:'a'});
test('indexed identity lookup still reuses username-only authors across posts',()=>{
 const c=put('connections',{id:'threads',provider:'threads',accountId:'self',mode:'api',status:'connected'});
 const a=upsertComment(c,{id:'first',username:'same-author',text:'One'},{id:'post-one'}),b=upsertComment(c,{id:'second',username:'same-author',text:'Two'},{id:'post-two'});
 assert.equal(get('conversations',a.conversationId).customerId,get('conversations',b.conversationId).customerId);
});
test('comment snapshot excludes unrelated customer dossiers, chat and publishing state, keeps permissions',()=>{
 put('customers',{id:'unrelated',name:'PRIVATE-UNRELATED'});put('conversations',{id:'dm',kind:'message',connectionId:'a',customerId:'unrelated'});
 const s=commentsSnapshot(staff,{users:[]});assert.equal(s.commentsCompact,true);assert.deepEqual(s.conversations.map(c=>c.id),['ca']);assert.deepEqual(s.customers.map(c=>c.id),['pa']);assert.equal(s.messages.length,0);assert.equal(s.careExceptions,undefined);assert.ok(!JSON.stringify(s).includes('PRIVATE-UNRELATED'));
});
test('local context uses separate external indexes and parses no unrelated messages',()=>{
 assert.ok(!db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_messages_external'").get().sql.includes('conversationId'));
 assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_messages_conversation_external'").get().sql,/conversationId/);
 for(let i=0;i<100;i++)put('messages',{id:'unrelated'+i,conversationId:'dm',text:'UNRELATED-HISTORY'});
 const original=JSON.parse;let unrelated=0;JSON.parse=(s,...args)=>{if(String(s).includes('UNRELATED-HISTORY'))unrelated++;return original(s,...args);};
 try{assert.equal(localCommentContext(get('conversations','ca')).current.text,'Comment a');assert.equal(unrelated,0);}finally{JSON.parse=original;}
});
test('persisted context returns immediately and coalesces slow background refreshes',async()=>{
 put('comment_context',{id:'ca',mediaVersion:1,loadedAt:'2020-01-01',post:{text:'Saved context'}});let release,calls=0;const gate=new Promise(r=>release=r),request=async()=>{calls++;await gate;return {id:'external-a',message:'Fresh comment'};};
 const a=commentContextPreview(owner,'ca',request),b=commentContextPreview(owner,'ca',request);assert.equal(a.post.text,'Saved context');assert.equal(b.refreshing,true);assert.equal(calls,1);release();for(let i=0;i<20&&get('comment_context','ca').loadedAt==='2020-01-01';i++)await new Promise(r=>setTimeout(r,5));assert.equal(get('comment_context','ca').current.text,'Fresh comment');assert.throws(()=>commentContextPreview(staff,'cb',request),/phân công/);
});
test('read acknowledgement uses latest record without stale version or lost concurrent fields',async()=>{
 put('conversations',{...get('conversations','ca'),lastMessage:'Arrived during selection',tags:['Keep']});const c=await chatRoute('/api/chat/conversations/ca/read','POST',{},owner);assert.equal(c.unread,false);assert.equal(c.lastMessage,'Arrived during selection');assert.deepEqual(c.tags,['Keep']);const again=await chatRoute('/api/chat/conversations/ca/read','POST',{},owner);assert.equal(again.version,c.version);await assert.rejects(chatRoute('/api/chat/conversations/cb/read','POST',{},staff),/phân công/);
});
test('startup repairs the old external-index collision and preserves the separate chat index',()=>{
 db.exec("DROP INDEX idx_messages_external;CREATE INDEX idx_messages_external ON records(json_extract(data,'$.conversationId'),json_extract(data,'$.externalId')) WHERE kind='messages'");
 execFileSync(process.execPath,['--input-type=module','-e',"await import('./server/store.mjs')"],{env:process.env,stdio:'pipe'});
 assert.ok(!db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_messages_external'").get().sql.includes('conversationId'));
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='idx_messages_conversation_external'").get());
});
