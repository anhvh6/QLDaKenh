import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {createAggregateStore} from '../server/overview-cache.mjs';
import {computeLearnerOverview} from '../server/overview-source.mjs';
test('aggregate is persisted, single-flight, keeps previous values on failure and never computes on read',async()=>{
 const db=new DatabaseSync(':memory:');let time=1000,calls=0;const store=createAggregateStore(db,{now:()=>time});
 assert.equal(store.read('u'),null);let release;const compute=()=>{calls++;return new Promise(r=>release=r);};const a=store.refresh('u',compute),b=store.refresh('u',compute);await Promise.resolve();assert.equal(calls,1);release({counts:{orders:5}});await Promise.all([a,b]);
 assert.equal(createAggregateStore(db,{now:()=>time}).read('u').counts.orders,5);for(let i=0;i<100;i++)store.read('u');assert.equal(calls,1);
 time+=70000;await assert.rejects(store.refresh('u',()=>{throw Error('source down');}));assert.equal(store.read('u').counts.orders,5);assert.equal(store.read('u').refreshFailed,true);
 time+=70000;assert.equal(store.read('u').stale,true);await store.refresh('u',()=>({counts:{orders:6}}));assert.equal(store.read('u').refreshFailed,false);assert.equal(store.read('u').counts.orders,6);db.close();
});
test('source pagination is complete and no partial aggregate is accepted on failed page',async()=>{
 const time=Date.parse('2026-10-16T03:00Z');let calls=0;const out=await computeLearnerOverview(async(offset)=>{calls++;return Array.from({length:offset?1:500},()=>({created_at:'2020-01-01',status:'ACTIVE'}));},[],time);assert.equal(calls,2);assert.equal(out.stats.total,501);
 await assert.rejects(computeLearnerOverview(async offset=>{if(offset)throw Error('page failed');return Array(500).fill({});},[],time),/page failed/);
});
test('worker revisions refresh immediately when permissions/source change; keys stay isolated',async()=>{
 const db=new DatabaseSync(':memory:'),store=createAggregateStore(db);await store.refresh('owner',()=>({counts:{orders:10}}),{revision:'r1'});await store.refresh('staff',()=>({counts:{orders:1}}),{revision:'r1'});await store.refresh('staff',()=>({counts:{orders:0}}),{revision:'r2'});assert.equal(store.read('owner').counts.orders,10);assert.equal(store.read('staff').counts.orders,0);assert.equal(store.read('staff').sourceRevision,'r2');db.close();
});
