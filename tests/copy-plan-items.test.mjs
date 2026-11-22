import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'copy-plan-items-'));process.env.PLAN_REMOTE_CATALOG='0';
const {all,put,remove,db}=await import('../server/store.mjs');
const {planItems,planItemsSql}=await import('../server/copy-automation.mjs');

test('planItems returns exactly what all() filtered by plan returned, newest-updated first, and is never stale',()=>{
 for(let i=0;i<30;i++)put('copy_plan_items',{id:'it'+i,planId:'plan'+(i%3),videoId:'v'+i,state:i%2?'pending':'scheduled'});
 const viaAll=id=>all('copy_plan_items').filter(i=>i.planId===id);
 for(const id of ['plan0','plan1','plan2','missing'])assert.deepEqual(planItems(id),viaAll(id));
 assert.equal(planItems('plan1').length,10);
 const first=planItems('plan1')[0];put('copy_plan_items',{...planItems('plan1').at(-1),state:'removed'});
 assert.notEqual(planItems('plan1')[0].id,first.id,'an updated row moves to the front');
 assert.deepEqual(planItems('plan1'),viaAll('plan1'));
 remove('copy_plan_items','it1');assert.ok(!planItems('plan1').some(i=>i.id==='it1'));
 put('copy_plan_items',{id:'moved',planId:'plan0',videoId:'x',state:'pending'});put('copy_plan_items',{id:'moved',planId:'plan2',videoId:'x',state:'pending'});
 assert.ok(!planItems('plan0').some(i=>i.id==='moved'));assert.ok(planItems('plan2').some(i=>i.id==='moved'));
});

test('the statement is planned on the plan index, never a per-kind scan',()=>{
 const plan=db.prepare('EXPLAIN QUERY PLAN '+planItemsSql).all('plan0').map(r=>r.detail).join('\n');
 assert.ok(!/sqlite_autoindex/.test(plan),plan);assert.ok(/idx_copy_plan_item_plan/.test(plan),plan);
});

test('only the requested plan is deserialized',()=>{
 put('copy_plan_items',{id:'secret',planId:'private-plan',videoId:'s',state:'pending',note:'OTHER-PLAN-MARKER'});
 const parse=JSON.parse;JSON.parse=(value,...rest)=>{assert.ok(!String(value).includes('OTHER-PLAN-MARKER'));return parse(value,...rest);};
 try{assert.ok(planItems('plan0').length>0);}finally{JSON.parse=parse;}
});
