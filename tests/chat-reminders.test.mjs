import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'reminders-'));
const {put,get,all,db}=await import('../server/store.mjs');
const {createChatReminder,reminderTick}=await import('../server/chat-reminders.mjs');
const owner={id:'owner',role:'owner'};db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('owner','reminder@qa.test','Owner','owner','qa');
put('connections',{id:'z',provider:'zalo_personal',mode:'api'});put('customers',{id:'p',name:'QA'});
const c=put('conversations',{id:'c',connectionId:'z',customerId:'p',externalUserId:'123',threadType:0});
test('creates native reminder once and durable system notification once',async()=>{
 const due=Date.now()+60000;let calls=0;const r=await createChatReminder(owner,c,{title:'Nhắc tư vấn',dueAt:new Date(due).toISOString(),platform:true},async(id,thread,type,title,time)=>{calls++;assert.equal(thread,'123');assert.equal(time,due);return{id:'native'};});
 assert.equal(calls,1);assert.equal(r.platformStatus,'created');assert.equal(reminderTick(due-1),0);assert.equal(reminderTick(due),1);assert.equal(reminderTick(due+1),0);assert.equal(get('notifications','chat-reminder:'+r.id).recipientId,'owner');assert.ok(get('chat_reminders',r.id).alertedAt);
});
test('platform failure keeps internal reminder; unsupported channel never invokes native provider',async()=>{
 const input={title:'Nhắc QA',dueAt:new Date(Date.now()+120000).toISOString(),platform:true};const r=await createChatReminder(owner,c,input,async()=>{throw Error('offline');});assert.equal(r.platformStatus,'failed');assert.equal(r.status,'pending');
 put('connections',{id:'other',provider:'facebook',mode:'api'});const other=put('conversations',{id:'other-c',connectionId:'other',customerId:'p'});const x=await createChatReminder(owner,other,input,async()=>{throw Error('must not call');});assert.equal(x.platformStatus,'unsupported');
 await assert.rejects(createChatReminder(owner,c,{...input,assignee:'missing'}));await assert.rejects(createChatReminder(owner,c,{...input,dueAt:'invalid'}));
 put('chat_reminders',{...r,status:'cancelled'});assert.equal(reminderTick(Date.now()+200000),1);assert.equal(all('notifications').length,2);
});

test('opaque Zalo errors preserve code and empty success is not reported as created',async()=>{
 const input={title:'QA',dueAt:new Date(Date.now()+120000).toISOString(),platform:true};
 const failed=await createChatReminder(owner,c,input,async()=>{const error=new Error('null');error.code=999;throw error;});
 assert.equal(failed.platformErrorCode,999);assert.ok(failed.platformError.includes('999'));assert.notEqual(failed.platformError,'null');
 const empty=await createChatReminder(owner,c,input,async()=>null);assert.equal(empty.platformStatus,'failed');
});
