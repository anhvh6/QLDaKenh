import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'copy-performance-'));
process.env.PLAN_REMOTE_CATALOG='0';
const {put,db,transaction}=await import('../server/store.mjs');
const {automationState,automationCatalog,automationRoute}=await import('../server/copy-automation.mjs');
const user={id:'owner',role:'owner'};
test('2700 result rows use bounded database reads and catalog excludes heavy result data',async()=>{
 transaction(()=>{
  put('connections',{id:'fb',provider:'facebook',name:'Page'});
  put('copy_plans',{id:'p',userId:user.id,mode:'new',campaignId:'campaign'});
  put('copy_plans',{id:'foreign',userId:'other',mode:'new',campaignId:'campaign'});
  for(let i=0;i<2700;i++){
   put('copy_videos',{id:'v'+i,userId:user.id,provider:'facebook',externalId:String(i),caption:'Original '+i});
   put('contents',{id:'c'+i,caption:'Edited '+i,title:'Title '+i,sourceVideoKey:'facebook:'+i});
   put('copy_jobs',{id:'j'+i,userId:user.id,status:'done',folderId:'drive-'+i});
   put('copy_plan_items',{id:'i'+i,userId:user.id,planId:'p',videoId:'v'+i,contentId:'c'+i,copyJobId:'j'+i,channels:['fb']});
   put('publications',{id:'pub'+i,contentId:'c'+i,copyPlanItemId:'i'+i,connectionId:'fb',status:'published'});
  }
 });
 const original=db.prepare;let reads=0;
 db.prepare=function(...args){reads++;return original.apply(this,args);};
 let result;const start=performance.now();
 try{result=automationState(user);}finally{db.prepare=original;}
 console.log('2700 rows:',Math.round(performance.now()-start)+'ms,',reads,'database prepares');
 assert.ok(reads<40,'Result hydration must not query once per item: '+reads);
 assert.equal(result.items.length,2700);assert.equal(result.plans.length,1);
 const first=result.items.find(i=>i.id==='i0');assert.equal(first.caption,'Edited 0');assert.equal(first.folderId,'drive-0');assert.equal(first.targets[0].success,true);
 assert.equal(result.videos.find(v=>v.id==='v0').targets[0].success,true);
 const catalog=automationCatalog(user);assert.equal(catalog.plans.length,1);assert.equal(catalog.items,undefined);assert.equal(catalog.videos,undefined);
 assert.ok(JSON.stringify(catalog).length<JSON.stringify(result).length/100);
 assert.deepEqual(await automationRoute('/api/copy/automation/catalog','GET',{},user),catalog);
});
