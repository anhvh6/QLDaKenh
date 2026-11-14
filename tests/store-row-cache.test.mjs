import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'store-row-cache-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,remove,all,get,db,transaction}=await import('../server/store.mjs');
const ids=kind=>all(kind).map(r=>r.id).sort();

test('repeated reads follow every kind of write: insert, update, delete and raw SQL',()=>{
 assert.deepEqual(ids('tags'),[]);
 const a=put('tags',{id:'a',name:'A'});assert.deepEqual(ids('tags'),['a']);assert.deepEqual(ids('tags'),['a']);
 put('tags',{...a,name:'A2'});assert.equal(all('tags')[0].name,'A2');
 put('tags',{id:'b',name:'B'});assert.deepEqual(ids('tags'),['a','b']);
 db.prepare("UPDATE records SET data=json_set(data,'$.name','raw') WHERE kind='tags' AND id='b'").run();
 assert.equal(all('tags').find(r=>r.id==='b').name,'raw');
 remove('tags','a');assert.deepEqual(ids('tags'),['b']);
 db.prepare("DELETE FROM records WHERE kind='tags'").run();assert.deepEqual(ids('tags'),[]);
});

test('callers may mutate returned rows without corrupting later reads',()=>{
 put('products',{id:'p1',name:'Original',tags:['x']});
 const first=all('products');first[0].name='Mutated';first[0].tags.push('y');first.length=0;
 const second=all('products');assert.equal(second[0].name,'Original');assert.deepEqual(second[0].tags,['x']);
});

test('a rolled-back transaction never leaves stale rows behind, even when the revision number repeats',()=>{
 put('orders',{id:'o1',total:1});assert.deepEqual(ids('orders'),['o1']);
 assert.throws(()=>transaction(()=>{put('orders',{id:'o2',total:2});assert.deepEqual(ids('orders'),['o1','o2']);throw new Error('abort');}),/abort/);
 assert.deepEqual(ids('orders'),['o1']);
 put('orders',{id:'o3',total:3});assert.deepEqual(ids('orders'),['o1','o3']);
 assert.deepEqual(all('orders').find(o=>o.id==='o3').total,3);
});

test('connections are never served from the cache because their trigger ignores bookkeeping-only edits',()=>{
 const c=put('connections',{id:'c1',provider:'facebook',status:'connected',lastCheckedAt:'1'});
 assert.equal(all('connections')[0].lastCheckedAt,'1');
 put('connections',{...c,lastCheckedAt:'2'});assert.equal(all('connections')[0].lastCheckedAt,'2');
 db.prepare("UPDATE records SET data=json_set(data,'$.lastCheckedAt','3') WHERE kind='connections'").run();assert.equal(all('connections')[0].lastCheckedAt,'3');
});

test('order is newest-updated first and versions are returned',()=>{
 put('templates',{id:'t1',name:'one'});put('templates',{id:'t2',name:'two'});
 const before=all('templates');put('templates',{...before.find(t=>t.id==='t1'),name:'one-edited'});
 const after=all('templates');assert.equal(after[0].id,'t1');assert.equal(after[0].version,2);assert.equal(after.length,2);
});
