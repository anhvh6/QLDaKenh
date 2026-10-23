import test from 'node:test';import assert from 'node:assert/strict';
import {calendarEvents,calendarDayKey,calendarDayPreview} from '../public/calendar-model.js';
import {defaultCalendarSelection,calendarMatches,calendarChannelMatches} from '../public/calendar-filter.js';
const slot='2026-10-23T06:00:00+07:00',updated='2026-10-23T06:10:00+07:00';
test('scheduled, failed and published attempts become one current post with platform IDs',()=>{
 const events=calendarEvents({contents:[{id:'c',title:'Post'}],publications:[{id:'p',contentId:'c',connectionId:'fb',scheduleAt:slot,status:'scheduled',updatedAt:slot},{id:'p',contentId:'c',connectionId:'fb',scheduleAt:slot,status:'failed',updatedAt:updated},{id:'retry',contentId:'c',connectionId:'fb',scheduleAt:slot,status:'published',updatedAt:'2026-10-23T06:12:00+07:00'},{id:'ig',contentId:'c',connectionId:'ig',scheduleAt:slot,status:'published',updatedAt:updated}],copyPlanCalendar:[{id:'i',contentId:'c',scheduleAt:slot,state:'failed'}]});
 assert.equal(events.length,1);assert.equal(events[0].status,'published');assert.deepEqual(events[0].channels,['fb','ig']);assert.equal(events[0].contentId,'c');
});
test('mixed destination outcomes keep a single failed card and distinct days stay separate',()=>{
 const events=calendarEvents({publications:[{id:'a',contentId:'c',connectionId:'fb',scheduleAt:slot,status:'published'},{id:'b',contentId:'c',connectionId:'yt',scheduleAt:slot,status:'failed'},{id:'tomorrow',contentId:'c',connectionId:'fb',scheduleAt:'2026-10-24T06:00:00+07:00',status:'scheduled'}]});assert.equal(events.length,2);assert.equal(events[0].status,'failed');assert.equal(events[1].status,'scheduled');
});
test('latest cancelled record removes an event; cancelled retry does not erase an earlier receipt',()=>{
 const events=calendarEvents({publications:[{id:'a',contentId:'c',connectionId:'fb',scheduleAt:slot,status:'scheduled',updatedAt:slot},{id:'a',contentId:'c',connectionId:'fb',scheduleAt:slot,status:'cancelled',updatedAt:updated}]});assert.equal(events.length,0);
 const done=calendarEvents({publications:[{id:'a',contentId:'c',connectionId:'fb',scheduleAt:slot,status:'published'},{id:'b',contentId:'c',connectionId:'fb',scheduleAt:slot,status:'cancelled'}]});assert.equal(done[0].status,'published');
});
test('copy handoff is represented once even when calendar summary lacks contentId',()=>{const events=calendarEvents({copyPlanCalendar:[{id:'item',scheduleAt:slot,state:'failed'}],publications:[{id:'p',contentId:'c',copyPlanItemId:'item',copyPlanId:'plan',connectionId:'a',scheduleAt:slot,status:'published'}]});assert.equal(events.length,1);assert.equal(events[0].type,'copy');assert.equal(events[0].planId,'plan');});
test('appointment uses latest state and obtains platform from conversation, excludes cancellations',()=>{
 const events=calendarEvents({conversations:[{id:'chat',connectionId:'ig'}],chat_reminders:[{id:'r',conversationId:'chat',dueAt:slot,status:'pending',updatedAt:slot},{id:'r',conversationId:'chat',dueAt:slot,status:'done',updatedAt:updated},{id:'cancelled',dueAt:slot,status:'cancelled'}]});assert.equal(events.length,1);assert.equal(events[0].status,'done');assert.deepEqual(events[0].channels,['ig']);assert.deepEqual(defaultCalendarSelection,['appointment']);assert.equal(calendarMatches(events[0],defaultCalendarSelection),true);assert.equal(calendarChannelMatches(events[0].channels,['ig']),true);
});
test('Vietnam day boundaries and three-card limit apply across event types with lossless expansion',()=>{
 assert.equal(calendarDayKey('2026-10-22T18:00:00Z'),'2026-10-23');assert.equal(calendarDayKey('bad'),'');const items=Array.from({length:9},(_,id)=>({id}));const preview=calendarDayPreview(items);assert.equal(preview.visible.length,3);assert.equal(preview.hidden,6);assert.deepEqual(calendarDayPreview(items,true).visible,items);assert.equal(calendarDayPreview([]).hidden,0);
});
