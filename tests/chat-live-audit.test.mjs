import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'chat-live-audit-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get}=await import('../server/store.mjs');const {chatRoute}=await import('../server/chat.mjs');
import {chronologicalMessages} from '../public/chat-message-sync.js';import {menuPosition} from '../public/chat-menu-layout.js';
const owner={id:'audit-owner',role:'owner'};
put('connections',{id:'audit-demo',provider:'zalo_personal',mode:'demo',status:'connected'});put('customers',{id:'audit-customer',name:'Audit'});put('conversations',{id:'audit-chat',customerId:'audit-customer',connectionId:'audit-demo',kind:'message',status:'open',mode:'demo'});
const route=since=>chatRoute('/api/chat/conversations/audit-chat/live','GET',{},owner,new URL('https://example.test/live'+(since?'?since='+since:'')));
test('unchanged live responses omit message payload; edits, pins, deletion and new messages invalidate revision',async()=>{
 for(let i=0;i<300;i++)put('messages',{id:'audit-'+i,conversationId:'audit-chat',createdAt:new Date(1700000000000+i*1000).toISOString(),text:'x'.repeat(500),direction:'incoming',status:'received'});
 const first=await route();assert.equal(first.messages.length,300);const tiny=await route(first.revision);assert.equal(tiny.unchanged,true);assert.ok(JSON.stringify(tiny).length<JSON.stringify(first).length/100);
 const edited=put('messages',{...get('messages','audit-0'),pinned:true});const update=await route(first.revision);assert.equal(update.messages[0].id,edited.id);assert.notEqual(update.revision,first.revision);
 put('messages',{...edited,deletedAt:new Date().toISOString()});assert.notEqual((await route(update.revision)).revision,update.revision);
 put('messages',{id:'audit-new',conversationId:'audit-chat',text:'new',createdAt:'2099-01-01T00:00:00Z'});assert.equal((await route()).messages.at(-1).id,'audit-new');
 await assert.rejects(chatRoute('/api/chat/conversations/audit-chat/live','GET',{}, {id:'viewer',role:'viewer'},new URL('https://example.test/?since='+first.revision)),{status:403});
});
test('chronological rendering ignores edit time, keeps stable ties and never mutates source',()=>{
 const messages=[{id:'later',createdAt:'2026-10-13T10:00:00Z'},{id:'early',createdAt:'2026-10-13T09:00:00Z'},{id:'earlier-tie',createdAt:'2026-10-13T09:00:00Z'}];assert.deepEqual(chronologicalMessages(messages).map(m=>m.id),['earlier-tie','early','later']);assert.equal(messages[0].id,'later');
});
test('message action menu remains within small screens at all four corners',()=>{
 for(const anchor of [{top:1,bottom:20,right:10},{top:1,bottom:20,right:390},{top:700,bottom:720,right:10},{top:700,bottom:720,right:390}]){const p=menuPosition(anchor,{width:260,height:300},{width:390,height:740});assert.ok(p.left>=8&&p.left+p.width<=382);assert.ok(p.top>=8&&p.top+300<=732);}
});
