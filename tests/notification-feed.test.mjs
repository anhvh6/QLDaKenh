import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationFeed} from '../public/notification-feed.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){let state={user:{id:'a'},notifications:[{id:'n',version:1,read:false}]};const calls=[];const feed=createNotificationFeed({getState:()=>state,api:(path,options)=>{const d=deferred();calls.push({path,options,...d});return d.promise;},changed:()=>{}});return {feed,calls,get state(){return state;},switchUser(){state={user:{id:'b'},notifications:[]};}};}
test('bell refresh and polling share a request; late response cannot restore unread after acknowledgement',async()=>{
 const f=fixture(),one=f.feed.sync(),two=f.feed.sync({force:true});assert.equal(one,two);assert.equal(f.calls.length,1);
 const read=f.feed.markRead();assert.equal(f.state.notifications[0].read,true);assert.deepEqual(f.calls[1].options.body.ids,['n']);
 f.calls[1].resolve({ok:true});await read;f.calls[0].resolve({revision:'old',rows:[{id:'n',version:1,read:false}]});await one;
 assert.equal(f.state.notifications[0].read,true);assert.equal(f.feed.reconcile([{id:'n',version:1,read:false}])[0].read,true);
 assert.equal(f.feed.reconcile([{id:'n',version:3,read:false}])[0].read,false,'a new event with the same ID remains unread');
});
test('failed read rolls back and permits retry without a full page refresh',async()=>{
 const f=fixture(),read=f.feed.markRead();f.calls[0].reject(Error('offline'));await assert.rejects(read,/offline/);assert.equal(f.state.notifications[0].read,false);
 const retry=f.feed.markRead();f.calls[1].resolve({ok:true});await retry;assert.equal(f.state.notifications[0].read,true);
});
test('account changes isolate in-flight results and acknowledgements',async()=>{
 const f=fixture(),old=f.feed.sync();f.switchUser();const next=f.feed.sync();assert.equal(f.calls.length,2);f.calls[0].resolve({revision:'old',rows:[{id:'private-a'}]});await old;assert.deepEqual(f.state.notifications,[]);f.calls[1].resolve({revision:'b',rows:[{id:'b'}]});await next;assert.equal(f.state.notifications[0].id,'b');
});
test('compact page without notifications retains the last list on an unchanged response',async()=>{
 const f=fixture(),first=f.feed.sync();f.calls[0].resolve({revision:'r',rows:[{id:'n',read:false,version:1}]});await first;
 f.state.notifications=[];assert.equal(f.feed.reconcile([]).length,1);
 const next=f.feed.sync({force:true});f.calls[1].resolve({revision:'r',unchanged:true});await next;assert.equal(f.state.notifications[0].id,'n');
 const empty=f.feed.sync({force:true});f.calls[2].resolve({revision:'empty',rows:[]});await empty;assert.deepEqual(f.state.notifications,[]);
});
test('network error preserves cached details and allows explicit retry',async()=>{
 const f=fixture(),first=f.feed.sync();f.calls[0].resolve({revision:'r',rows:f.state.notifications});await first;
 const bad=f.feed.sync({force:true});f.calls[1].reject(Error('offline'));await assert.rejects(bad,/offline/);assert.equal(f.state.notifications.length,1);
 const retry=f.feed.sync({force:true});f.calls[2].resolve({revision:'new',rows:[{id:'n2'}]});await retry;assert.equal(f.state.notifications[0].id,'n2');
});
