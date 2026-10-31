import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'inbox-snapshot-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,db,chatMessageRevision}=await import('../server/store.mjs');
const {inboxSnapshot,inboxRevision}=await import('../server/inbox-snapshot.mjs');
const {chatRoute}=await import('../server/chat.mjs');
const owner={id:'owner',role:'owner'},staff={id:'staff',role:'support'};
for(const id of ['a','b']){
 put('connections',{id,provider:'zalo_personal',mode:'demo',status:'connected'});
 put('customers',{id:'p'+id,name:id});
 put('conversations',{id:'c'+id,kind:'message',customerId:'p'+id,connectionId:id,lastAt:'2026-10-24T00:00:00Z',postMedia:[{url:'POST-MEDIA-ONLY'}]});
}
put('team_members',{id:'tm',teamId:'t',userId:staff.id});put('channel_teams',{id:'ct',teamId:'t',connectionId:'a'});
test('inbox is independent of publishing; bounded initial messages obey channel scope',()=>{
 for(let i=0;i<100;i++)put('messages',{id:'a'+i,conversationId:'ca',text:'Hello',createdAt:new Date(1700000000000+i*1000).toISOString()});
 put('messages',{id:'private',conversationId:'cb',text:'PRIVATE-MESSAGE'});
 const rev=inboxRevision();for(let i=0;i<1000;i++)put('contents',{id:'post'+i,caption:'PUBLISH-ONLY'.repeat(100)});assert.equal(inboxRevision(),rev);
 const state=inboxSnapshot(staff,{revision:'r',users:[]});assert.equal(state.inboxCompact,true);assert.deepEqual(state.conversations.map(c=>c.id),['ca']);assert.equal(state.initialChatWindow.messages.length,60);assert.equal(state.initialChatWindow.hasMore,true);assert.equal(state.messages.length,0);assert.equal(state.contents.length,0);assert.equal(state.publications.length,0);
 const targeted=inboxSnapshot(owner,{revision:'r',users:[],conversationId:'cb'});assert.equal(targeted.initialChatWindow.conversationId,'cb');assert.deepEqual(targeted.initialChatWindow.messages.map(m=>m.id),['private']);
 assert.equal(inboxSnapshot(staff,{revision:'r',users:[],conversationId:'cb'}).initialChatWindow.conversationId,'ca');
 assert.ok(!JSON.stringify(state).includes('PRIVATE-MESSAGE'));assert.ok(!JSON.stringify(state).includes('POST-MEDIA-ONLY'));assert.ok(!JSON.stringify(state).includes('PUBLISH-ONLY'));
 put('channel_teams',{...get('channel_teams','ct'),connectionId:'b'});assert.notEqual(inboxRevision(),rev);assert.deepEqual(inboxSnapshot(staff,{users:[]}).initialChatWindow.messages.map(m=>m.id),['private']);
});
test('revision counters track raw edits, moves and deletes, including rollback',()=>{
 put('messages',{id:'move',conversationId:'ca',text:'Before'});const a=chatMessageRevision('ca'),b=chatMessageRevision('cb');
 db.prepare("UPDATE records SET data=json_set(data,'$.conversationId','cb','$.text','After') WHERE id='move' AND kind='messages'").run();assert.equal(chatMessageRevision('ca'),a+1);assert.equal(chatMessageRevision('cb'),b+1);
 db.exec('BEGIN');put('messages',{id:'temporary',conversationId:'cb'});db.exec('ROLLBACK');assert.equal(chatMessageRevision('cb'),b+1);
 db.prepare("DELETE FROM records WHERE id='move' AND kind='messages'").run();assert.equal(chatMessageRevision('cb'),b+2);
});
test('unchanged live poll does not parse historical message payloads',async()=>{
 const route=since=>chatRoute('/api/chat/conversations/ca/live','GET',{},owner,new URL('https://test/?limit=60'+(since?'&since='+since:'')));
 const first=await route();const parse=JSON.parse;let reads=0;JSON.parse=(s,...args)=>{if(String(s).includes('"conversationId":"ca"'))reads++;return parse(s,...args);};
 try{assert.equal((await route(first.revision)).unchanged,true);assert.equal(reads,0);}finally{JSON.parse=parse;}
 put('messages',{...get('messages','a0'),text:'Edited'});assert.notEqual((await route(first.revision)).revision,first.revision);
});
