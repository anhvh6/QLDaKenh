import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'zalo-phone-chat-'));
const {put,get,all}=await import('../server/store.mjs');const {zaloPhoneChatRoute}=await import('../server/zalo-phone-chat.mjs');
const owner={id:'owner',role:'owner'},staff={id:'support',role:'support'};
put('connections',{id:'fb',provider:'facebook',mode:'api',status:'connected'});put('connections',{id:'z',provider:'zalo_personal',mode:'api',status:'connected',name:'Zalo QA'});put('connections',{id:'z-other',provider:'zalo_personal',mode:'api',status:'disconnected'});
put('conversations',{id:'c',connectionId:'fb',kind:'message'});put('messages',{id:'phone-message',conversationId:'c',direction:'incoming',text:'SĐT 0901234567; 0987654321'});
const path='/api/chat/zalo-phone/',call=(action,input,deps,user=owner)=>zaloPhoneChatRoute(path+action,'POST',input,user,deps);
test('lookup only returns verified phones, caches negatives and never creates a conversation',async()=>{
 let count=0;const before=all('conversations').length,deps={lookup:async(ch,phone)=>{assert.equal(ch,'z');count++;return phone==='0901234567'?{uid:'z-peer'}:null;},time:100};
 const result=await call('lookup',{messageIds:['phone-message']},deps);assert.deepEqual(result.results[0].matches,[{phone:'0901234567',connectionId:'z',channelName:'Zalo QA'}]);assert.equal(all('conversations').length,before);await call('lookup',{messageIds:['phone-message']},deps);assert.equal(count,2);
});
test('open validates phone against original message and returns a real Zalo chat without sending',async()=>{
 let opened=0;const deps={open:async(ch,phone)=>{assert.equal(ch,'z');assert.equal(phone,'0901234567');opened++;const p=put('customers',{id:'z-customer',name:'QA'});return put('conversations',{id:'z-chat',connectionId:ch,customerId:p.id,kind:'message',externalUserId:'z-peer'});}};
 const result=await call('open',{messageId:'phone-message',phone:'0901234567',connectionId:'z'},deps);assert.equal(result.conversation.id,'z-chat');assert.equal(result.customer.name,'QA');assert.equal(opened,1);
 await assert.rejects(call('open',{messageId:'phone-message',phone:'0911111111',connectionId:'z'},deps),/không thuộc/);await assert.rejects(call('open',{messageId:'phone-message',phone:'0901234567',connectionId:'z-other'},deps),/khả dụng/);assert.equal(opened,1);
});
test('channel assignment and incoming non-Zalo source restrictions apply to lookup and open',async()=>{
 await assert.rejects(call('lookup',{messageIds:['phone-message']},{},staff),{status:403});
 put('messages',{id:'staff-phone',conversationId:'c',direction:'outgoing',text:'0901234567'});await assert.rejects(call('lookup',{messageIds:['staff-phone']},{}),{status:404});
 put('conversations',{id:'zc',connectionId:'z',kind:'message'});put('messages',{id:'zphone',conversationId:'zc',direction:'incoming',text:'0901234567'});await assert.rejects(call('lookup',{messageIds:['zphone']},{}),{status:422});
 put('messages',{...get('messages','phone-message'),deletedAt:'now'});await assert.rejects(call('open',{messageId:'phone-message',phone:'0901234567',connectionId:'z'},{}),{status:404});put('messages',{...get('messages','phone-message'),deletedAt:null});
});
test('transient provider errors hide icon and are retried rather than cached as nonexistent',async()=>{
 let calls=0;const deps={lookup:async()=>{calls++;throw Error('network');},time:4000000};const first=await call('lookup',{messageIds:['phone-message']},deps);assert.deepEqual(first.results[0].matches,[]);assert.equal(first.results[0].retry,true);await call('lookup',{messageIds:['phone-message']},deps);assert.equal(calls,4);
});
