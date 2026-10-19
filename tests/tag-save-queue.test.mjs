import test from 'node:test';import assert from 'node:assert/strict';import {createTagSaveQueue} from '../public/tag-save-queue.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('rapid tag selections remain immediate and serialize without dropping clicks or concurrent server tags',async()=>{
 const queue=createTagSaveQueue(),c={id:'c',tags:[],version:1},waiters=[],requests=[],errors=[],state={conversations:[c]};let paints=0;
 const host={state,toast:m=>errors.push(m),api:(url,options)=>new Promise(resolve=>{requests.push(options.body.changes);waiters.push(resolve);})};
 const done=queue.toggle(host,c,'A',()=>paints++);queue.toggle(host,c,'B',()=>paints++);queue.toggle(host,c,'A',()=>paints++);
 assert.deepEqual(c.tags,['B']);assert.equal(requests.length,1);
 waiters.shift()({id:'c',version:2,tags:['A','external']});await tick();assert.deepEqual(new Set(c.tags),new Set(['B','external']));assert.equal(requests.length,2);
 waiters.shift()({id:'c',version:3,tags:['external','B']});await done;assert.deepEqual(c.tags,['external','B']);assert.equal(errors.length,0);assert.ok(paints>=5);
});
test('pending tags survive a refreshed snapshot and failed save restores confirmed tags',async()=>{
 const queue=createTagSaveQueue(),state={conversations:[{id:'c',version:1,tags:['old']}]};let reject;const errors=[];
 const host={state,toast:m=>errors.push(m),api:()=>new Promise((_,no)=>reject=no)};
 const done=queue.toggle(host,state.conversations[0],'new',()=>{});state.conversations[0]={id:'c',version:5,tags:['old']};queue.apply(state.conversations[0]);assert.deepEqual(state.conversations[0].tags,['old','new']);reject(Error('offline'));await done;assert.deepEqual(state.conversations[0].tags,['old']);assert.equal(errors.length,1);
});
