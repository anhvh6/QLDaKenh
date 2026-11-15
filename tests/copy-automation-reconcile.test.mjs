import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'copy-reconcile-'));process.env.PLAN_REMOTE_CATALOG='0';
const {get,put}=await import('../server/store.mjs');
const {automationTick,automationStats}=await import('../server/copy-automation.mjs');
const deps={scan:async()=>({videos:[],complete:true})};

test('stuck failed items are re-checked against publications only when plan items or publications changed',async()=>{
 put('connections',{id:'recon-fb',provider:'facebook',mode:'demo',status:'connected',name:'Recon'});
 put('copy_plan_items',{id:'recon-item',planId:'recon-plan',videoId:'recon-video',state:'failed',channels:['recon-fb'],error:'x'});
 await automationTick(Date.now(),deps);
 const settled=automationStats.reconcilePasses;assert.ok(settled>=1);
 for(let i=0;i<4;i++)await automationTick(Date.now(),deps);
 assert.equal(automationStats.reconcilePasses,settled,'unchanged data must not trigger another pass');
 assert.equal(get('copy_plan_items','recon-item').state,'failed');

 put('publications',{id:'recon-pub',copyPlanItemId:'recon-item',connectionId:'recon-fb',status:'published'});
 await automationTick(Date.now(),deps);
 assert.ok(automationStats.reconcilePasses>settled,'a new publication must trigger a pass');
 assert.equal(get('copy_plan_items','recon-item').state,'published');

 await automationTick(Date.now(),deps);
 const after=automationStats.reconcilePasses;
 for(let i=0;i<4;i++)await automationTick(Date.now(),deps);
 assert.equal(automationStats.reconcilePasses,after,'the pass settles again once its own write has been seen');
});

test('an item changed back to failed is picked up again',async()=>{
 const item=get('copy_plan_items','recon-item'),before=automationStats.reconcilePasses;
 put('copy_plan_items',{...item,state:'unknown'});put('publications',{...get('publications','recon-pub'),status:'processing'});
 await automationTick(Date.now(),deps);
 assert.ok(automationStats.reconcilePasses>before);assert.equal(get('copy_plan_items','recon-item').state,'unknown');
});
