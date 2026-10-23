import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'youtube-queue-'));
const {all,put,get,db,saveSecret,dataDir}=await import('../server/store.mjs');
const {publish}=await import('../server/connectors.mjs');
const {tick}=await import('../server/domain.mjs');
const {observeDuePublications,publicationAdmissionTime}=await import('../server/publication-admission.mjs');
mkdirSync(join(dataDir,'uploads'),{recursive:true});writeFileSync(join(dataDir,'uploads','asset_qa-video.mp4'),'video-fixture');
const asset=put('assets',{id:'qa-video',type:'video',mime:'video/mp4',url:'/uploads/asset_qa-video.mp4',active:true});
const ch=put('connections',{id:'qa-youtube',provider:'youtube',status:'connected',mode:'api'});saveSecret(ch.id,{token:'test-token'});
const payload={type:'video',title:'QA upload',caption:'QA',assets:[asset.id],visibility:'private'};
async function consume(body){if(body)for await(const chunk of body)void chunk;}
test('YouTube initializes a timed resumable session and uploads the selected file once',async()=>{
 const old=global.fetch,calls=[];
 try{global.fetch=async(url,init)=>{calls.push(init.method);assert.ok(init.signal instanceof AbortSignal);if(init.method==='POST'){assert.match(url,/uploadType=resumable/);assert.equal(JSON.parse(init.body).status.privacyStatus,'private');return new Response('',{headers:{location:'https://upload.example.test/session'}});}assert.equal(url,'https://upload.example.test/session');assert.equal(init.headers['Content-Length'],'13');await consume(init.body);return Response.json({id:'verified-id'});};
 const result=await publish(ch,payload);assert.equal(result.url,'https://www.youtube.com/watch?v=verified-id');assert.deepEqual(calls,['POST','PUT']);
 }finally{global.fetch=old;}
});
test('YouTube rejects a refused session before uploading, and missing final receipt stays unknown',async()=>{
 const old=global.fetch;
 try{global.fetch=async()=>new Response(JSON.stringify({error:{message:'quotaExceeded'}}),{status:403});await assert.rejects(publish(ch,payload),/quotaExceeded/);
 let writes=0;global.fetch=async(url,init)=>{if(init.method==='POST')return new Response('',{headers:{location:'https://upload.example.test/session'}});writes++;await consume(init.body);return Response.json({});};await assert.rejects(publish(ch,payload),e=>e.unknown===true);assert.equal(writes,1);
 }finally{global.fetch=old;}
});
test('slow upload cannot expire other on-time jobs, including beyond the five-job batch; downtime still blocks',async()=>{
 const oldFetch=global.fetch,oldNow=Date.now,base=oldNow();let time=base,release,started;
 const entered=new Promise(r=>started=r),pending=new Promise(r=>release=r);Date.now=()=>time;
 db.prepare('INSERT OR IGNORE INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('queue-owner','queue@example.test','QA','owner','test');
 put('campaigns',{id:'queue-campaign',status:'active'});const demo=put('connections',{id:'queue-demo',provider:'facebook',status:'connected',mode:'demo'});
 put('copy_plans',{id:'queue-plan',status:'active',campaignId:'queue-campaign',userId:'queue-owner',channels:[ch.id,demo.id],startAt:new Date(base-3600000).toISOString()});
 const content=put('contents',{...payload,copyPlanId:'queue-plan'}),first=put('publications',{...payload,contentId:content.id,connectionId:ch.id,copyPlanId:'queue-plan',status:'scheduled',scheduleAt:new Date(base).toISOString(),attempts:0});
 const queued=Array.from({length:6},()=>put('publications',{contentId:content.id,connectionId:demo.id,copyPlanId:'queue-plan',status:'scheduled',mode:'demo',scheduleAt:new Date(base+30000).toISOString(),attempts:0}));
 const missed=put('publications',{contentId:content.id,connectionId:demo.id,copyPlanId:'queue-plan',status:'scheduled',mode:'demo',scheduleAt:new Date(base-120000).toISOString(),attempts:0});
 try{global.fetch=async(url,init)=>{if(init.method==='POST'){started();await pending;return new Response('',{headers:{location:'https://upload.example.test/session'}});}await consume(init.body);return Response.json({id:'queue-result'});};
 const running=tick();await entered;time=base+31000;await tick();assert.ok(Number.isFinite(publicationAdmissionTime(queued[0])));time=base+125000;release();await running;await tick();await tick();
 assert.equal(get('publications',first.id).status,'published');assert.ok(queued.every(p=>get('publications',p.id).status==='demo_published'));assert.equal(get('publications',missed.id).status,'blocked');assert.match(get('publications',missed.id).error,/lỡ giờ/);
 }finally{release();Date.now=oldNow;global.fetch=oldFetch;for(const p of all('publications'))put('publications',{...p,status:'cancelled'});observeDuePublications([]);}
});
test('admission is invalidated by cancellation or a changed schedule',()=>{
 const at=new Date().toISOString(),p={id:'admission-test',status:'scheduled',scheduleAt:at};observeDuePublications([p],Date.parse(at));assert.equal(publicationAdmissionTime(p),Date.parse(at));assert.equal(publicationAdmissionTime({...p,scheduleAt:new Date(Date.parse(at)+1000).toISOString()}),undefined);observeDuePublications([{...p,status:'cancelled'}]);assert.equal(publicationAdmissionTime(p),undefined);
});

test('lost upload response body and server failure require reconciliation instead of blind retry',async()=>{
 const old=global.fetch;
 try{for(const result of [{ok:true,status:200,text:async()=>{throw Error('broken response');}},new Response('server error',{status:503})]){
 global.fetch=async(url,init)=>{if(init.method==='POST')return new Response('',{headers:{location:'https://upload.example.test/session'}});await consume(init.body);return result;};await assert.rejects(publish(ch,payload),e=>e.unknown===true);
 }}finally{global.fetch=old;}
});
