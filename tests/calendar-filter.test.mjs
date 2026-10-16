import test from 'node:test';import assert from 'node:assert/strict';import {calendarMatches,calendarTypes} from '../public/calendar-filter.js';
test('calendar filters distinguish successful posts, pending jobs, errors and simulations',()=>{
 for(const status of ['published','manually_confirmed'])assert.equal(calendarMatches({status},['published']),true);
 for(const status of ['scheduled','dispatching','processing','awaiting_manual','accepted'])assert.equal(calendarMatches({status},['scheduled']),true);
 for(const status of ['failed','blocked','unknown'])assert.equal(calendarMatches({status},['failed']),true);
 for(const status of ['cancelled','demo_published','draft','deleted_remote','unpublished_remote'])assert.equal(calendarMatches({status},Object.keys(calendarTypes)),false);
 assert.equal(calendarMatches({state:'preparing'},['scheduled']),true);assert.equal(calendarMatches({status:'published'},['appointment']),false);assert.equal(calendarMatches({status:'failed'},['scheduled','failed']),true);assert.equal(calendarMatches({status:'published'},[]),false);
});
