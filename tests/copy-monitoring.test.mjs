import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'monitor-'));
const {all,get,put,db,saveSecret}=await import('../server/store.mjs');
const {saveMonitorPlan,automationTick,automationRoute,reserveSlots}=await import('../server/copy-automation.mjs');
const {tick}=await import('../server/domain.mjs');
const user={id:'monitor-owner',role:'owner'};db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(user.id,'monitor@test','QA','owner','qa');saveSecret('drive-'+user.id,{refreshToken:'qa'});saveSecret('drive-oauth',{publicOrigin:'https://example.com'});
for(const [id,provider] of [['monitor-fb','facebook'],['monitor-tt','threads']])put('connections',{id,provider,mode:'demo',status:'connected',name:provider});
let serial=0;const time=Date.parse('2026-10-15T08:00:00Z');
function fixture(sourceURL='https://www.tiktok.com/@faceyoga.megaphuong',extra={}){
 for(const p of all('copy_plans'))put('copy_plans',{...p,status:'paused'});
 put('campaigns',{id:'monitor-campaign',name:'QA',status:'active'});
 const input={name:'Monitor '+(++serial),campaignId:'monitor-campaign',source:{url:sourceURL,from:'2026-01-01',to:''},channels:['monitor-fb','monitor-tt'],startAt:'2026-10-15T08:40:00Z',times:['15:40','16:00'],weekdays:[0,1,2,3,4,5,6],order:'oldest',intervalMinutes:15,...extra};
 const p=saveMonitorPlan(user,input,time);return {p,input};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deps={scan:async s=>({complete:true,videos:[1,2].map(n=>({externalId:String(7000000000000000000n+BigInt(serial*10+n)),url:s.provider==='facebook'?'https://www.facebook.com/reel/'+(7000000000000000000n+BigInt(serial*10+n)):s.url+'/video/'+(7000000000000000000n+BigInt(serial*10+n)),caption:'QA '+n,publishedAt:'2026-01-0'+n+'T00:00:00Z'}))}),extract:async()=>({title:'QA',caption:'QA',engine:'video',media:[{type:'video'}]}),startCopy:(u,postId,target,extra)=>put('copy_jobs',{userId:u.id,postId,target,status:'queued',...extra})};
test('new-video monitoring skips incompatible candidates before draft/download and fills the slot with the next video',async()=>{
 const clock=Date.now;Date.now=()=>time;try{const {p}=fixture(),local={...deps,scan:async s=>{const rows=await deps.scan(s);rows.videos[0].caption='x'.repeat(501);return rows;}};
 await automationTick(time,local);await flush();await automationTick(time,local);
 const sourceVideos=all('copy_videos').filter(v=>v.sourceIds.includes(p.sourceId)),bad=sourceVideos.find(v=>v.caption.length===501),good=sourceVideos.find(v=>v.caption.length!==501),items=all('copy_plan_items').filter(i=>i.planId===p.id);
 assert.ok(bad&&good);assert.equal(items.some(i=>i.videoId===bad.id),false);assert.equal(items.length,1);assert.equal(items[0].videoId,good.id);assert.equal(items[0].scheduleAt,'2026-10-15T08:40:00.000Z');
 assert.equal(all('contents').some(c=>c.sourceVideoKey===bad.provider+':'+bad.externalId),false);
 }finally{Date.now=clock;}
});
test('save creates a source and schedule atomically without a manual scan or selected video IDs',()=>{
 const {p,input}=fixture();assert.equal(p.mode,'new');assert.equal(get('copy_sources',p.sourceId).automaticOnly,true);assert.equal(all('copy_plan_items').filter(i=>i.planId===p.id).length,0);
 const before=[all('copy_sources').length,all('copy_plans').length];assert.throws(()=>saveMonitorPlan(user,{...input,source:{url:'https://www.tiktok.com/@faceyoga.megaphuong',from:'2026-01-01'},channels:[]},time));
 assert.equal(all('copy_sources').length,before[0]);assert.equal(all('copy_plans').length,before[1]);
});
test('both example sources are monitored before a future start and prepare Drive more than thirty minutes early',async()=>{
 const clock=Date.now;Date.now=()=>time;
 try{for(const url of ['https://www.facebook.com/phuong.tran.53181/reels/','https://www.tiktok.com/@faceyoga.megaphuong']){const {p}=fixture(url);await automationTick(time,deps);await flush();await automationTick(time,deps);const items=all('copy_plan_items').filter(i=>i.planId===p.id);assert.equal(items.length,2);assert.equal(items[0].attempts,1);assert.equal(items.filter(i=>i.state==='preparing').length,1);assert.ok(items.every(i=>Date.parse(i.scheduleAt)-time>=30*60000));assert.equal(items.find(i=>i.state==='preparing').scheduleAt,'2026-10-15T08:40:00.000Z');assert.ok(get('copy_plans',p.id).lastCheckAt);await automationTick(time+1000,deps);assert.equal(all('copy_plan_items').filter(i=>i.planId===p.id).length,2);}}finally{Date.now=clock;}
});
test('periodic checks and a forced pre-slot check run even with a long configured interval',async()=>{
 const clock=Date.now;let t=time;Date.now=()=>t;
 try{const {p}=fixture(undefined,{startAt:'2026-10-15T10:00:00Z',times:['17:00'],intervalMinutes:1440});let scans=0;const d={...deps,scan:async()=>{scans++;return {complete:true,videos:[]};}};await automationTick(t,d);await flush();assert.equal(scans,1);await automationTick(t,d);assert.equal(scans,1);t=Date.parse('2026-10-15T09:15:00Z');await automationTick(t,d);await automationTick(t,d);await flush();assert.equal(scans,2);assert.equal(get('copy_plans',p.id).preparedSlotAt,'2026-10-15T10:00:00.000Z');}finally{Date.now=clock;}
});
test('paused plans and campaigns do not scan; existing plan edits keep an optional end date and chosen priority',async()=>{
 const {p,input}=fixture();put('campaigns',{...get('campaigns',p.campaignId),status:'paused'});let scans=0;await automationTick(time,{...deps,scan:async()=>{scans++;return {complete:true,videos:[]};}});assert.equal(scans,0);
 const result=saveMonitorPlan(user,{...input,planId:p.id,order:'newest',source:{...input.source,to:'2026-02-01'}},time);assert.equal(result.id,p.id);assert.equal(result.order,'newest');assert.equal(get('copy_sources',result.sourceId).to,'2026-02-01');assert.equal(result.endAt,'');
});
test('near-term slots are skipped and queue priority is honored without relying on the date the source was discovered',()=>{
 const {p}=fixture(undefined,{startAt:'2026-10-15T08:00:00Z',times:['15:10','15:40','16:00'],order:'newest'});for(const n of [1,2]){const v=put('copy_videos',{userId:user.id,provider:'tiktok',externalId:String(50000+serial*10+n),sourceIds:[p.sourceId],publishedAt:'2026-01-0'+n+'T00:00:00Z'});put('copy_plan_items',{planId:p.id,userId:user.id,videoId:v.id,state:'pending',channels:p.channels});}reserveSlots(p,time);const first=all('copy_plan_items').filter(i=>i.planId===p.id).sort((a,b)=>a.scheduleAt.localeCompare(b.scheduleAt))[0];assert.equal(first.scheduleAt,'2026-10-15T08:40:00.000Z');assert.equal(get('copy_videos',first.videoId).publishedAt,'2026-01-02T00:00:00Z');
});

test('date filtering and per-channel history feed only unpublished destinations into the queue',async()=>{
 const clock=Date.now;Date.now=()=>time;
 try{const {p}=fixture(undefined,{source:{url:'https://www.tiktok.com/@faceyoga.megaphuong',from:'2026-01-02',to:'2026-01-02'}}),externalId=String(7000000000000000000n+BigInt(serial*10+2)),c=put('contents',{sourceVideoKey:'tiktok:'+externalId});put('publications',{contentId:c.id,connectionId:'monitor-fb',status:'published'});
 await automationTick(time,deps);await flush();await automationTick(time,deps);const items=all('copy_plan_items').filter(i=>i.planId===p.id);assert.equal(items.length,1);assert.deepEqual(items[0].channels,['monitor-tt']);assert.equal(get('copy_videos',items[0].videoId).externalId,externalId);
 const oldSource=p.sourceId;saveMonitorPlan(user,{...p,planId:p.id,source:{url:'https://www.tiktok.com/@faceyoga.megaphuong',from:'2026-01-02T00:00:00+07:00',to:'2026-01-02'}},time);assert.equal(get('copy_plans',p.id).sourceId,oldSource);
 }finally{Date.now=clock;}
});
test('prepared media enters the existing publisher at its configured slot and is not requeued after success',async()=>{
 const clock=Date.now;let t=time;Date.now=()=>t;
 try{const {p}=fixture();await automationTick(t,deps);await flush();await automationTick(t,deps);const i=all('copy_plan_items').find(i=>i.planId===p.id&&i.state==='preparing'),j=get('copy_jobs',i.copyJobId),a=put('assets',{type:'video',url:'/uploads/qa.mp4',copyJobId:j.id,active:true});put('copy_jobs',{...j,status:'done',assets:[a.id],completedAt:new Date(t).toISOString()});put('contents',{...get('contents',i.contentId),copyReady:true,copyJobId:j.id,assets:[a.id]});
 await automationTick(t,deps);let pubs=all('publications').filter(x=>x.copyPlanItemId===i.id);assert.equal(pubs.length,2);assert.ok(pubs.every(x=>x.scheduleAt==='2026-10-15T08:40:00.000Z'));t=Date.parse(i.scheduleAt)+2000;await tick();await automationTick(t,deps);assert.equal(get('copy_plan_items',i.id).state,'published');await automationTick(t+1000,deps);assert.equal(all('publications').filter(x=>x.copyPlanItemId===i.id).length,2);
 }finally{Date.now=clock;}
});
test('changing a source keeps completed posts and removes old pending work; other users cannot edit the plan',()=>{
 const {p,input}=fixture(),v=put('copy_videos',{userId:user.id,provider:'tiktok',externalId:'99999',sourceIds:[p.sourceId]}),i=put('copy_plan_items',{planId:p.id,userId:user.id,videoId:v.id,state:'pending',channels:p.channels});
 const next=saveMonitorPlan(user,{...input,planId:p.id,source:{url:'https://www.facebook.com/phuong.tran.53181',from:'2026-01-01'}},time);assert.notEqual(next.sourceId,p.sourceId);assert.equal(get('copy_plan_items',i.id).state,'removed');assert.throws(()=>saveMonitorPlan({id:'other',role:'owner'},{...input,planId:p.id},time),/Không tìm/);
});
