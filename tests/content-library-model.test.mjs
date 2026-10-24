import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLibraryDates,parseLibraryDate,libraryMatches,libraryPage,sortLibraryHistory} from '../public/content-library-model.js';
test('default date range uses Vietnam day across UTC midnight',()=>{assert.deepEqual(defaultLibraryDates(Date.parse('2026-10-23T18:00:00Z')),{from:'2026-10-23',to:'2026-10-24'});});
test('DD/MM/YY rejects impossible calendar dates',()=>{assert.equal(parseLibraryDate('29/02/24'),'2024-02-29');for(const value of ['29/02/26','31/04/26','1/2/26','24/13/26'])assert.equal(parseLibraryDate(value),null);});
test('multi-select combines status, provider and inclusive dates for cards and history',()=>{
 const filters={from:'2026-10-23',to:'2026-10-24',statuses:['failed','scheduled'],providers:['instagram','facebook']};
 const row={status:'blocked',at:'2026-10-24T16:59:59Z',providers:['instagram']};assert.equal(libraryMatches(row,filters),true);
 assert.equal(libraryMatches({...row,at:'2026-10-24T17:00:00Z'},filters),false);
 assert.equal(libraryMatches({...row,providers:['youtube']},filters),false);
 assert.equal(libraryMatches({...row,status:'published'},filters),false);
 assert.equal(libraryMatches(row,{...filters,statuses:null,providers:null}),true);
 assert.equal(libraryMatches(row,{...filters,statuses:[]}),false);
});
test('published includes manual and demo records, search still applies',()=>{const f={from:'2026-10-23',to:'2026-10-24',statuses:['published'],providers:null,query:'khuôn mặt'};assert.equal(libraryMatches({at:'2026-10-24',status:'manually_confirmed',text:'KHUÔN MẶT',providers:[]},f),true);assert.equal(libraryMatches({at:'2026-10-24',status:'demo_published',text:'Khác'},f),false);});
test('pagination is three rows, clamps after filter/resize and never overlaps',()=>{const rows=Array.from({length:30},(_,n)=>n);assert.deepEqual(libraryPage(rows,0,2).items,[0,1,2,3,4,5]);assert.deepEqual(libraryPage(rows,1,2).items,[6,7,8,9,10,11]);assert.equal(libraryPage(rows,9,4).page,2);assert.deepEqual(libraryPage([],3,1),{items:[],page:0,pages:1,total:0});});
test('history sorts by displayed schedule time or status in both directions without mutation',()=>{const rows=[{id:'a',status:'published',scheduleAt:'2026-10-24T02:00:00Z',createdAt:'2026-10-20'},{id:'b',status:'failed',scheduleAt:'2026-10-24T01:00:00Z',createdAt:'2026-10-23'}];assert.equal(sortLibraryHistory(rows,'time',1)[0].id,'b');assert.equal(sortLibraryHistory(rows,'time',-1)[0].id,'a');assert.deepEqual(sortLibraryHistory(rows,'status',1).map(r=>r.id),sortLibraryHistory(rows,'status',-1).map(r=>r.id).reverse());assert.equal(rows[0].id,'a');});
