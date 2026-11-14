import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'state-revision-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,remove,stateRevision,kindsRevision}=await import('../server/store.mjs');

test('channel sync bookkeeping does not move the state revision, so caches and SSE clients are not invalidated every poll',()=>{
 const before=stateRevision();
 for(const kind of ['facebook_chat_sync','facebook_chat_cursors','comment_sync','comment_post_sync']){
  const row=put(kind,{id:'ch1',status:'ready',syncedAt:'2026-11-07T00:00:00Z'});
  put(kind,{...row,syncedAt:'2026-11-07T00:00:05Z'});
  remove(kind,'ch1');
 }
 assert.equal(stateRevision(),before);
 assert.notEqual(kindsRevision(['facebook_chat_sync']),'facebook_chat_sync:0','per-kind counters still track these rows');
});

test('real data changes still move the state revision',()=>{
 let last=stateRevision();
 const customer=put('customers',{id:'c1',name:'A'});assert.ok(stateRevision()>last);last=stateRevision();
 put('customers',{...customer,name:'B'});assert.ok(stateRevision()>last);last=stateRevision();
 put('conversations',{id:'v1',kind:'message',customerId:'c1',connectionId:'x'});assert.ok(stateRevision()>last);last=stateRevision();
 remove('customers','c1');assert.ok(stateRevision()>last);
});
