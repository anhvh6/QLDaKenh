import test from 'node:test';import assert from 'node:assert/strict';
import {dashboardData,dashboardDays} from '../public/dashboard-model.js';
const time=Date.parse('2026-10-18T03:00:00Z'),iso=n=>new Date(time-n*86400000).toISOString();
test('overview counts only unanswered customer conversations within seven days and separates comments',()=>{
 const S={user:{id:'staff'},contents:[],conversations:[{id:'new'},{id:'old'},{id:'replied'},{id:'comment',kind:'comment'},{id:'resolved',status:'resolved'},{id:'hidden',careHidden:true}],messages:[{id:'a',conversationId:'new',direction:'incoming',createdAt:iso(1)},{id:'b',conversationId:'old',direction:'incoming',createdAt:iso(8)},{id:'c',conversationId:'replied',direction:'incoming',createdAt:iso(2)},{id:'d',conversationId:'replied',direction:'outgoing',createdAt:iso(1)},{id:'e',conversationId:'comment',direction:'incoming',createdAt:iso(7)},{id:'f',conversationId:'resolved',direction:'incoming',createdAt:iso(1)},{id:'g',conversationId:'hidden',direction:'incoming',createdAt:iso(1)}]};
 const d=dashboardData(S,time);assert.deepEqual(d.messages.map(x=>x.id),['new']);assert.deepEqual(d.comments.map(x=>x.id),['comment']);
});
test('pending posts are unique, failures use latest destination attempt in 48h, tasks belong to current employee',()=>{
 const S={user:{id:'staff'},contents:[{id:'pending'},{id:'failed'},{id:'recovered'},{id:'old'}],publications:[{contentId:'pending',connectionId:'a',status:'scheduled'},{contentId:'pending',connectionId:'b',status:'scheduled'},{contentId:'failed',connectionId:'a',status:'failed',updatedAt:iso(1)},{contentId:'old',connectionId:'a',status:'failed',updatedAt:iso(3)},{contentId:'recovered',connectionId:'a',status:'failed',updatedAt:iso(1)},{contentId:'recovered',connectionId:'a',status:'published',updatedAt:iso(0)}],staffHandoffs:[{id:'mine',assignedStaffId:'staff',status:'open'},{assignedStaffId:'other',status:'open'},{assignedStaffId:'staff',status:'resolved'},{assignedStaffId:'staff',status:'open',taskType:'appointment',dueAt:iso(1)}],orders:[{id:'auto',autoDraft:true,status:'draft'},{autoDraft:false,status:'draft'},{autoDraft:true,status:'confirmed'}]};
 const d=dashboardData(S,time);assert.deepEqual(d.pending.map(x=>x.id),['pending']);assert.deepEqual(d.failed.map(x=>x.id),['failed']);assert.deepEqual(d.tasks.map(x=>x.id),['mine']);assert.deepEqual(d.orders.map(x=>x.id),['auto']);
});
test('two-day overview defaults to today/tomorrow and can show yesterday/today',()=>{
 const S={contents:[{id:'post',scheduleAt:'2026-10-19T16:30:00Z'},{id:'draft',scheduleAt:iso(0)},{id:'completed'}],publications:[{contentId:'post',status:'scheduled'},{contentId:'completed',scheduleAt:'2026-10-17T02:00:00Z',status:'published'}],chat_reminders:[{id:'call',dueAt:'2026-10-18T17:00:00Z',status:'pending'},{id:'done',dueAt:'2026-10-18T02:00:00Z',status:'done'},{id:'outside',dueAt:'2026-10-19T17:00:00Z',status:'pending'},{id:'cancelled',dueAt:'2026-10-18T04:00:00Z',status:'cancelled'}]};
 const days=dashboardDays(S,time);assert.deepEqual(days.map(d=>d.offset),[0,1]);assert.equal(days[0].items[0].id,'done');assert.equal(days[1].items[0].type,'call');assert.equal(days[1].items[1].type,'post');const previous=dashboardDays(S,time,-1);assert.deepEqual(previous.map(d=>d.offset),[-1,0]);assert.equal(previous[0].items[0].status,'published');assert.ok(!days.flatMap(d=>d.items).some(x=>['draft','outside','cancelled'].includes(x.id)));
});

test('dashboard does not count a linked copy plan failure twice or retain its stale warning after success',()=>{
 const base={user:{id:'staff'},contents:[{id:'post'}],copyPlanCalendar:[{id:'item',contentId:'post',state:'failed',updatedAt:iso(0)}]};
 const failed=dashboardData({...base,publications:[{contentId:'post',connectionId:'channel',status:'failed',updatedAt:iso(0)}]},time);assert.equal(failed.failed.length,1);assert.equal(failed.failed[0].id,'post');
 const done=dashboardData({...base,publications:[{contentId:'post',connectionId:'channel',status:'published',updatedAt:iso(0)}]},time);assert.equal(done.failed.length,0);
 const beforeContent=dashboardData({...base,contents:[],copyPlanCalendar:[{id:'preflight',state:'failed',updatedAt:iso(0)}]},time);assert.equal(beforeContent.failed.length,1);
});
