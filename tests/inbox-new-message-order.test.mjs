import test from 'node:test';
import assert from 'node:assert/strict';
import {filterThreads,defaultFilters} from '../public/inbox-model.js';
test('new unread conversation rises above a pinned read chat without changing the active chat or source order',()=>{
 const state={user:{id:'staff'},connections:[{id:'demo',mode:'demo',status:'connected'}],customers:[{id:'customer',name:'Customer'}],conversations:[
  {id:'active',customerId:'customer',connectionId:'demo',kind:'message',pinned:true,lastAt:'2026-10-13T09:00:00Z'},
  {id:'incoming',customerId:'customer',connectionId:'demo',kind:'message',unread:true,lastAt:'2026-10-13T10:00:00Z'}],staffHandoffs:[],chat_reminders:[]};
 assert.deepEqual(filterThreads(state).map(c=>c.id),['incoming','active']);
 assert.deepEqual(state.conversations.map(c=>c.id),['active','incoming']);
 assert.equal(filterThreads(state,'','all',{...defaultFilters,sort:'oldest'})[0].id,'active');
});
