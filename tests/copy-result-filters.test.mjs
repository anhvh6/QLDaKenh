import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPlanRows} from '../public/copy-plan-model.js';
const now=Date.parse('2026-10-15T10:12:00Z');
const target=(provider,status)=>({provider,status,success:status==='published',publicationId:provider});
const rows=[
 {id:'unknown1',state:'unknown',caption:'Cơ thang',scheduleAt:'2026-10-15T10:08:00Z',targets:[target('facebook','published'),target('threads','unknown')]},
 {id:'failed',state:'failed',caption:'Maxilla',scheduleAt:'2026-10-15T10:09:00Z',targets:[target('facebook','published'),target('threads','failed')]},
 {id:'done',state:'published',caption:'Niềng răng',scheduleAt:'2026-10-15T10:10:00Z',targets:[target('facebook','published'),target('threads','published')]},
 {id:'unknown2',state:'unknown',caption:'Emoji',scheduleAt:'2026-10-15T10:11:00Z',targets:[target('facebook','published'),target('threads','unknown')]},
 {id:'inflight',state:'publishing',scheduleAt:'2026-10-15T10:12:00Z',targets:[target('facebook','published'),target('threads','processing')]},
 {id:'future',state:'scheduled',scheduleAt:'2026-10-15T11:00:00Z',targets:[target('threads','scheduled')]},
 {id:'far',state:'scheduled',scheduleAt:'2026-10-17T11:00:00Z'},
 {id:'pending',state:'pending'},
];
const ids=(options={})=>filterPlanRows(rows,options,now).map(r=>r.id).sort();
test('error filter includes unknown receipts and does not lose partial platform successes',()=>{
 assert.deepEqual(ids({status:'failed'}),['failed','unknown1','unknown2']);
 assert.deepEqual(ids({status:'failed',platforms:['threads']}),['failed','unknown1','unknown2']);
 assert.deepEqual(ids({status:'failed',platforms:['facebook']}),[]);
 assert.deepEqual(ids({status:'unknown'}),['unknown1','unknown2']);
 assert.deepEqual(ids({status:'published',platforms:['facebook']}),['done','failed','inflight','unknown1','unknown2']);
 assert.deepEqual(ids({status:'published',platforms:['threads']}),['done']);
});
test('platform OR, none, all, combined search, and scheduled-only status return the right rows',()=>{
 assert.deepEqual(ids({status:'failed',platforms:['facebook','threads'],search:'  MAXILLA '}),['failed']);
 assert.deepEqual(ids({platforms:['__none__']}),[]);
 assert.deepEqual(ids({status:'scheduled24',scope:'24h'}),['future']);
 assert.deepEqual(ids({status:'publishing',platforms:['threads']}),['inflight']);
 assert.deepEqual(ids({status:'publishing',platforms:['facebook']}),[]);
});
test('24-hour view keeps due and in-flight work visible while hiding unscheduled and far-future queue',()=>{
 assert.deepEqual(ids({scope:'24h'}),['done','failed','future','inflight','unknown1','unknown2']);
 const processing={id:'preparing',state:'preparing',scheduleAt:'2026-10-15T10:11:00Z'};
 assert.equal(filterPlanRows([processing],{scope:'24h'},now).length,1);
 assert.deepEqual(ids({scope:'all',status:'pending'}),['pending']);
});
