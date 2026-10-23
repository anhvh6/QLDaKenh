import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleCopyPlans,normalizePlanSelection,copyPlanItemScope} from '../public/copy-plan-selection.js';
const plans=[
 {id:'new-a',name:'A',mode:'new',campaignId:'a',status:'active'},
 {id:'paused-a',name:'Paused',mode:'new',campaignId:'a',status:'paused'},
 {id:'new-b',name:'B',mode:'new',campaignId:'b',status:'active'},
 {id:'bulk-a',name:'Bulk',mode:'bulk',campaignId:'a',status:'active'}
];
const items=[...plans.map(p=>({id:p.id,planId:p.id})),{id:'orphan',planId:'deleted'}];
test('all campaigns and all plans include paused plans but keep copy modes separate',()=>{
 const visible=visibleCopyPlans(plans,'new');
 assert.equal(visible.length,3);
 assert.deepEqual(copyPlanItemScope(items,visible).map(i=>i.id).sort(),['new-a','new-b','paused-a']);
 assert.equal(visibleCopyPlans(plans,'bulk','a').length,1);
});
test('one, multiple, none and all plans select only rows of the current campaign',()=>{
 const visible=visibleCopyPlans(plans,'new','a');
 assert.deepEqual(copyPlanItemScope(items,visible,['new-a']).map(i=>i.id),['new-a']);
 assert.equal(copyPlanItemScope(items,visible,['new-a','paused-a']).length,2);
 assert.equal(copyPlanItemScope(items,visible,[]).length,0);
 assert.equal(copyPlanItemScope(items,visible,null).length,2);
 assert.equal(copyPlanItemScope(items,visible,['new-b']).length,0);
});
test('all selection automatically includes newly loaded plans; removed selections recover safely',()=>{
 const initial=visibleCopyPlans(plans.slice(0,1),'new');
 assert.equal(copyPlanItemScope(items,initial,null).length,1);
 assert.equal(copyPlanItemScope(items,visibleCopyPlans(plans,'new'),null).length,3);
 assert.equal(normalizePlanSelection(['missing'],initial),null);
 assert.deepEqual(normalizePlanSelection(['new-a','missing','new-a'],initial),['new-a']);
 assert.deepEqual(normalizePlanSelection([],initial),[]);
});
