import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'revision-'));
const {put,get,remove,transaction,db,recordRevision,stateRevision}=await import('../server/store.mjs');

test('state refresh ignores sync progress but immediately reflects channel status, permissions and messages',()=>{
 let c=put('connections',{id:'channel',status:'connected',name:'Channel',zaloSync:{updatedAt:'one'}}),r=stateRevision();
 c=put('connections',{...c,verifiedAt:'later',zaloSync:{updatedAt:'two',received:20}});assert.equal(stateRevision(),r);
 put('connections',{...c,status:'disconnected'});assert.ok(stateRevision()>r);r=stateRevision();
 put('settings',{id:'student-care',stages:{}});assert.ok(stateRevision()>r);r=stateRevision();
 put('messages',{id:'new-message',text:'new'});assert.ok(stateRevision()>r);r=stateRevision();
 remove('messages','new-message');assert.ok(stateRevision()>r);r=stateRevision();
 put('push_subscriptions',{id:'push',lastSeen:'now'});assert.equal(stateRevision(),r);
});
test('constant-time realtime revision covers writes/deletes and rolls back atomically',()=>{let revision=recordRevision();const row=put('messages',{id:'r',text:'one'});assert.ok(recordRevision()>revision);revision=recordRevision();put('messages',{...row,text:'two'});assert.ok(recordRevision()>revision);revision=recordRevision();assert.throws(()=>transaction(()=>{put('messages',{id:'rollback',text:'never published'});throw Error('rollback');}));assert.equal(recordRevision(),revision);assert.equal(get('messages','rollback'),null);db.prepare('UPDATE records SET version=version+1 WHERE id=?').run('r');assert.ok(recordRevision()>revision);revision=recordRevision();remove('messages','r');assert.ok(recordRevision()>revision);});
