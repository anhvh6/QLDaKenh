import test from 'node:test';import assert from 'node:assert/strict';
import {ReadBurstCache} from '../server/read-burst-cache.mjs';
const value=(text,status=200)=>({status,body:Buffer.from(text)});
test('coalesces reads, bounds lifetime and isolates users/queries',async()=>{
 let now=0,calls=0;const cache=new ReadBurstCache({now:()=>now,ttl:10});const load=async()=>{calls++;return value('ok');};
 await Promise.all([cache.read('owner:customers',load),cache.read('owner:customers',load)]);assert.equal(calls,1);
 await cache.read('staff:customers',load);await cache.read('owner:devices',load);assert.equal(calls,3);
 now=11;await cache.read('owner:customers',load);assert.equal(calls,4);
});
test('writes invalidate pending results; errors and oversized responses are never retained',async()=>{
 const cache=new ReadBurstCache({maxEntryBytes:4,maxBytes:6});let finish;
 const pending=cache.read('a',()=>new Promise(resolve=>finish=resolve));await Promise.resolve();cache.clear();finish(value('old'));await pending;
 assert.equal(cache.entries.size,0);
 await cache.read('a',async()=>value('fail',500));await cache.read('a',async()=>value('too large'));assert.equal(cache.entries.size,0);
 await cache.read('a',async()=>value('new'));await cache.read('b',async()=>value('next'));assert.equal(cache.entries.size,1);assert.equal(cache.bytes,4);
});
