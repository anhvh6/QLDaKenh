import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarEventState,calendarEventClass,calendarStateLabel} from '../public/calendar-presentation.js';
const time=Date.parse('2026-10-19T10:00:00+07:00');
test('calendar distinguishes elapsed time from actual completion, for posts and appointments',()=>{
 const before='2026-10-19T09:00:00+07:00',after='2026-10-19T11:00:00+07:00';
 assert.equal(calendarEventState({status:'pending',dueAt:before},true,time),'past');assert.equal(calendarEventState({status:'done',dueAt:before},true,time),'completed');
 assert.equal(calendarEventState({status:'pending',dueAt:after},true,time),'upcoming');assert.equal(calendarEventState({status:'published',scheduleAt:before},false,time),'completed');
 assert.equal(calendarEventState({status:'failed',scheduleAt:before},false,time),'failed');assert.equal(calendarEventState({state:'scheduled',scheduleAt:before},false,time),'past');
 assert.match(calendarEventClass({status:'pending',dueAt:after},true,time),/appointment.*upcoming/);assert.match(calendarEventClass({status:'scheduled',scheduleAt:after},false,time),/publication.*upcoming/);
 assert.match(calendarStateLabel({status:'pending',dueAt:before},true,time),/Chưa hoàn tất/);assert.equal(calendarStateLabel({status:'published'},false,time),'Đã đăng');
});
