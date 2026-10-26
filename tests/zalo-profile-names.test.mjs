import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync,mkdtempSync} from 'node:fs';import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'profile-names-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,db}=await import('../server/store.mjs'),{applyProfileNames}=await import('../server/zalo-profile-names.mjs');
test('profile sync updates only incoming sender names on the matching connection and preserves local names',async()=>{
 put('customers',{id:'p',name:'Local name',nameEditedLocally:true});put('conversations',{id:'a',customerId:'p',connectionId:'zalo-a',externalUserId:'42',threadType:0});put('conversations',{id:'b',customerId:'p',connectionId:'zalo-b',externalUserId:'42',threadType:0});
 for(const [id,conversationId,direction,senderId] of [['in','a','incoming',42],['out','a','outgoing','42'],['other','b','incoming','42'],['different','a','incoming','43']])put('messages',{id,conversationId,direction,senderId,text:'Original text',senderName:'Old'});
 await applyProfileNames('zalo-a',{'42':{displayName:'Provider name',avatar:'avatar',isFr:1,phoneNumber:'84966888609'}});
 assert.equal(get('customers','p').name,'Local name');assert.equal(get('conversations','a').isFriend,true);assert.equal(get('messages','in').senderName,'Provider name');assert.equal(get('messages','in').text,'Original text');for(const id of ['out','other','different'])assert.equal(get('messages',id).senderName,'Old');
 const plan=db.prepare("EXPLAIN QUERY PLAN SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.direction')='incoming' AND CAST(json_extract(data,'$.senderId') AS TEXT)=?").all('42');assert.ok(plan.some(r=>r.detail.includes('idx_messages_incoming_sender')));
});
test('large batches yield between profiles so requests can run without splitting a single profile update',async()=>{
 let yields=0;const profiles=Object.fromEntries(Array.from({length:25},(_,i)=>[String(i),{displayName:'QA '+i}]));await applyProfileNames('zalo-a',profiles,{yieldWork:async()=>{assert.ok(get('zalo_profiles','zalo-a:9'));yields++;}});assert.equal(yields,2);
});
