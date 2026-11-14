import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'client-notifications-'));process.env.PLAN_REMOTE_CATALOG='0';
const {db}=await import('../server/store.mjs');
const {clientNotifications,clientNotificationLimits,filterCareNotifications}=await import('../server/student-care.mjs');
const owner={id:'owner',role:'owner'};
db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('owner','owner@example.test','Owner','owner','unused');
const rows=(n,recipientId)=>Array.from({length:n},(_,i)=>({id:'n'+i,title:'Thông báo '+i,recipientId,createdAt:String(1e6-i)}));

test('clients receive only the newest notifications, in the same order, while the full filter still sees every row',()=>{
 const all=rows(clientNotificationLimits.scan+500,'owner'),sent=clientNotifications(all,owner);
 assert.equal(sent.length,clientNotificationLimits.send);
 assert.deepEqual(sent.map(n=>n.id),all.slice(0,clientNotificationLimits.send).map(n=>n.id));
 assert.equal(filterCareNotifications(all,owner).length,all.length,'badge counts for push still use the complete list');
});

test('only rows addressed to the user count toward the limit, and short lists are untouched',()=>{
 const mixed=[...rows(50,'someone-else').map(n=>({...n,id:'x'+n.id})),...rows(20,'owner')];
 const sent=clientNotifications(mixed,owner);assert.equal(sent.length,20);assert.ok(sent.every(n=>n.recipientId==='owner'));
 assert.deepEqual(clientNotifications([],owner),[]);
});
