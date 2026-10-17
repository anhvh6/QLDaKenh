import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'message-campaign-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,all,db}=await import('../server/store.mjs');
const {communicationRoute:route,communicationAudience:audience,communicationTick:tick,recoverCommunication}=await import('../server/communication-campaigns.mjs');
const {messageSettings,messageJobCurrent}=await import('../server/communication-message.mjs');
const {messageAgeDays,messageTimeMatches,messageOccurrences}=await import('../public/communication-message-model.js');
const {runTemplate}=await import('../server/taophacdo.mjs');
const owner={id:'owner',role:'owner',active:1};db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(owner.id,'message@example.test','Owner','owner','qa');
const base='/api/communication-campaigns',at=Date.parse('2026-10-20T09:00:00+07:00'),iso=t=>new Date(t).toISOString();let seq=0;
put('connections',{id:'z',provider:'zalo_personal',mode:'demo',status:'connected',name:'Zalo QA'});
put('templates',{id:'t1',name:'Mẫu 1',enabled:true,blocks:[{kind:'text',text:'Xin chào',assetIds:[]}]});put('templates',{id:'t2',name:'Mẫu 2',enabled:true,blocks:[{kind:'text',text:'Mẫu hai',assetIds:[]}]});
const config=(extra={})=>({name:'QA theo tin',audienceType:'message',providers:['zalo_personal'],connectionIds:['z'],channelSelection:'selected',templateIds:['t1'],messageTiming:'minutes',waitMinutes:30,minutesRepeat:'daily',messageExecution:'schedule',messageRepeat:'daily',messageTimes:['09:00','15:00'],messageWeekdays:[1,2,3,4,5],daysMode:'exact',daysFrom:1,daysTo:1,status:'active',startAt:iso(at-86400000),endAt:'',blocks:[{text:'Chào {{name}}',assetIds:[]}],...extra});
function clean(){for(const v of all('conversations'))put('conversations',{...v,deletedAt:new Date().toISOString()});for(const c of all('communication_campaigns'))put('communication_campaigns',{...c,status:'paused'});for(const j of all('communication_jobs').filter(j=>j.status==='queued'))put('communication_jobs',{...j,status:'cancelled'});}
function source(time,extra={}){const id='qa-'+(++seq),cid=extra.customerId||id;put('customers',{id:cid,name:cid});const v=put('conversations',{id,customerId:cid,connectionId:'z',externalUserId:id,threadType:0,kind:'message',...extra});const m=put('messages',{id:id+'-source',conversationId:id,direction:'outgoing',senderType:'staff',actor:owner.id,status:'demo',text:'Xin chào',createdAt:iso(time)});const run=put('template_runs',{id:id+'-run',conversationId:id,templateId:'t1',actor:owner.id,status:'done',messageIds:[m.id]});return {v,m,run};}
async function campaign(extra={}){const c=await route(base,'POST',config(extra),owner);return put('communication_campaigns',{...c,messageActiveSince:iso(at-86400000)});}
const job=c=>all('communication_jobs').find(j=>j.campaignId===c.id);
function sender(time){return async(u,c,input)=>put('messages',{id:'sent-'+(++seq),conversationId:c,direction:'outgoing',senderType:'staff',actor:u.id,status:'demo',text:input.text,createdAt:iso(time)});}

test('Vietnam day boundaries use calendar days rather than elapsed hours',()=>{
 const now=Date.parse('2026-10-20T00:01:00+07:00'),c=config({messageTiming:'days',daysFrom:1,daysTo:1});
 for(const t of ['2026-10-19T00:00:00+07:00','2026-10-19T23:59:59+07:00']){assert.equal(messageAgeDays(t,now),1);assert.equal(messageTimeMatches(c,t,now),true);}
 assert.equal(messageTimeMatches(c,'2026-10-20T00:00:00+07:00',now),false);assert.equal(messageTimeMatches({...c,daysTo:3},'2026-10-17T09:00:00+07:00',now),true);
});
test('day schedules support slots, weekdays, once, activation, expiry and no late catchup',()=>{
 const c={...config({messageTiming:'days'}),messageActiveSince:iso(at-86400000)};
 assert.deepEqual(messageOccurrences(c,at),[iso(at)]);assert.deepEqual(messageOccurrences(c,at+6*3600000),[iso(at+6*3600000)]);assert.deepEqual(messageOccurrences(c,at+30*60000),[]);
 assert.deepEqual(messageOccurrences({...c,messageRepeat:'weekly',messageWeekdays:[1]},at),[]);assert.deepEqual(messageOccurrences({...c,messageRepeat:'weekly',messageWeekdays:[2]},at),[iso(at)]);
 assert.deepEqual(messageOccurrences({...c,messageRepeat:'once'},at),[]);assert.equal(messageOccurrences({...c,messageExecution:'now',messageRepeat:'once'},at).length,1);assert.deepEqual(messageOccurrences({...c,status:'paused'},at),[]);assert.deepEqual(messageOccurrences({...c,endAt:iso(at-1)},at),[]);
 assert.deepEqual(messageOccurrences({...c,startAt:iso(at+60000)},at),[]);
});
test('validation rejects invalid template, malformed lists, range and missing schedules; preview supports limits',async()=>{
 for(const extra of [{templateIds:[]},{templateIds:['missing']},{messageTimes:{}},{messageWeekdays:{}},{daysMode:'range',daysFrom:3,daysTo:1},{waitMinutes:0},{messageTiming:'days',messageTimes:[]},{messageRepeat:'weekly',messageTiming:'days',messageWeekdays:[]}])assert.throws(()=>messageSettings(config(extra)),/./);
 assert.equal((await route(base+'/preview','POST',config({maxSendsPerCustomer:1}),owner)).count,0);
});
test('source identity comes from completed template run, not text, AI, partial run or a replied conversation',()=>{
 clean();const a=source(at-60000),c=config();assert.ok(audience(owner,c,at).some(r=>r.conversationId===a.v.id));
 put('template_runs',{...a.run,status:'running'});assert.ok(!audience(owner,c,at).some(r=>r.conversationId===a.v.id));put('template_runs',a.run);
 put('messages',{...a.m,senderType:'ai'});assert.ok(!audience(owner,c,at).some(r=>r.conversationId===a.v.id));put('messages',a.m);
 put('messages',{id:'typed',conversationId:a.v.id,direction:'outgoing',senderType:'staff',actor:owner.id,status:'demo',text:a.m.text,createdAt:iso(at)});assert.ok(!audience(owner,c,at).some(r=>r.conversationId===a.v.id));
 const b=source(at-60000);put('messages',{id:'answer',conversationId:b.v.id,direction:'incoming',createdAt:iso(at)});assert.ok(!audience(owner,c,at).some(r=>r.conversationId===b.v.id));
});
test('templates combine OR, channels/time combine AND; dynamic channels follow connection state',()=>{
 const a=source(at-60000);put('template_runs',{...a.run,templateId:'t2'});const c=config({templateIds:['t1','t2']});assert.ok(audience(owner,c,at).some(r=>r.conversationId===a.v.id));assert.ok(!audience(owner,config(),at).some(r=>r.conversationId===a.v.id));
 put('connections',{id:'new-z',provider:'zalo_personal',mode:'demo',status:'connected',name:'New QA'});put('conversations',{...a.v,connectionId:'new-z'});assert.ok(!audience(owner,c,at).some(r=>r.conversationId===a.v.id));assert.ok(audience(owner,{...c,channelSelection:'all_active'},at).some(r=>r.conversationId===a.v.id));
 put('connections',{...get('connections','new-z'),status:'disconnected'});assert.ok(!audience(owner,{...c,channelSelection:'all_active'},at).some(r=>r.conversationId===a.v.id));
});
test('minutes wait until due, send once across recovery, retain source and sent content in history',async()=>{
 clean();const s=source(at-10*60000),c=await campaign();let calls=0;const send=async(...args)=>{calls++;return sender(at+20*60000)(...args);};await tick(at,send);assert.equal(job(c).status,'queued');assert.equal(calls,0);await tick(at+20*60000,send);assert.equal(job(c).status,'done');assert.equal(calls,1);recoverCommunication();await tick(at+86400000,send);assert.equal(calls,1);
 const h=await route(base+'/'+c.id+'/history','GET',{},owner);assert.equal(h.jobs.find(j=>j.triggerMessageId===s.m.id).sentBlocks[0].text,'Chào '+s.v.customerId);
});
test('customer response and new staff message cancel waiting sends before due',async()=>{
 clean();const s=source(at),c=await campaign();await tick(at,sender(at));put('messages',{id:'response-'+seq,conversationId:s.v.id,direction:'incoming',createdAt:iso(at+60000)});let calls=0;await tick(at+30*60000,async()=>{calls++;});assert.equal(calls,0);assert.equal(job(c).status,'cancelled');
 clean();const v=source(at),d=await campaign();await tick(at,sender(at));put('messages',{id:'staff-'+seq,conversationId:v.v.id,direction:'outgoing',actor:owner.id,status:'demo',createdAt:iso(at+1)});await tick(at+30*60000,async()=>{calls++;});assert.equal(calls,0);assert.equal(job(d).status,'cancelled');
});
test('own sequence blocks may follow trigger; an intervening external message cancels remaining blocks',async()=>{
 clean();const s=source(at-31*60000),c=await campaign({blocks:[{text:'First',assetIds:[]},{text:'Second',assetIds:[]}]});await tick(at,sender(at));assert.equal(job(c).nextBlock,1);assert.equal(messageJobCurrent(owner,c,job(c),at+1),true);await tick(at+1,sender(at+1));assert.equal(job(c).status,'done');
 clean();const v=source(at-31*60000),d=await campaign({blocks:[{text:'First',assetIds:[]},{text:'Second',assetIds:[]}]});await tick(at,sender(at));put('messages',{id:'between-'+seq,conversationId:v.v.id,direction:'incoming',createdAt:iso(at+1)});await tick(at+2,()=>assert.fail('must stop'));assert.equal(job(d).status,'cancelled');
});
test('each new eligible template message triggers independently on following days, never the old source',async()=>{
 clean();const s=source(at-31*60000),c=await campaign();await tick(at,sender(at));const m=put('messages',{...s.m,id:'new-trigger-'+seq,createdAt:iso(at+86400000)});put('template_runs',{...s.run,id:'new-run-'+seq,messageIds:[m.id]});await tick(at+86400000,sender(at+86400000));assert.equal(all('communication_jobs').filter(j=>j.campaignId===c.id).length,2);await tick(at+86400000+30*60000,sender(at+86400000+30*60000));assert.ok(all('communication_jobs').filter(j=>j.campaignId===c.id).every(j=>j.status==='done'));
});
test('per-customer cap reserves slots across conversations and run counts match actual jobs',async()=>{
 clean();source(at-31*60000,{customerId:'shared'});source(at-31*60000,{customerId:'shared'});const c=await campaign({messageTiming:'days',daysFrom:0,daysTo:0,messageExecution:'now',messageRepeat:'once',maxSendsPerCustomer:1});await tick(at,sender(at));const jobs=all('communication_jobs').filter(j=>j.campaignId===c.id&&j.customerId==='shared');assert.equal(jobs.length,1);const run=get('communication_runs',jobs[0].runId);assert.equal(run.count,all('communication_jobs').filter(j=>j.runId===run.id).length);
});
test('definite failure retries same job and block; ambiguous result never retries',async()=>{
 clean();source(at-31*60000);const c=await campaign({maxRetries:2,retryDelayMinutes:1});let calls=0;const send=async(...a)=>{if(++calls===1)throw Object.assign(Error('Provider rejected'),{unknown:false});return sender(at+60000)(...a);};await tick(at,send);assert.equal(job(c).status,'queued');await tick(at+59999,send);assert.equal(calls,1);await tick(at+60000,send);assert.equal(job(c).status,'done');assert.equal(calls,2);assert.equal(job(c).nextBlock,1);
 clean();source(at-31*60000);const d=await campaign({maxRetries:2});await tick(at,async()=>{throw Object.assign(Error('Network unknown'),{unknown:true});});assert.equal(job(d).status,'unknown');await tick(at+600000,()=>assert.fail('ambiguous retry'));
});
test('pause, resume, expiration and end prevent stale pending sends',async()=>{
 clean();source(at);const c=await campaign();await tick(at,sender(at));const paused=await route(base+'/'+c.id+'/state','POST',{version:c.version,status:'paused'},owner);assert.equal(job(c).status,'cancelled');const resumed=await route(base+'/'+c.id+'/state','POST',{version:paused.version,status:'active'},owner);put('communication_campaigns',{...resumed,messageActiveSince:iso(at+60000)});await tick(at+30*60000,()=>assert.fail('old source after resume'));
 const ended=await route(base+'/'+c.id+'/state','POST',{version:get('communication_campaigns',c.id).version,status:'ended'},owner);await assert.rejects(route(base+'/'+c.id+'/state','POST',{version:ended.version,status:'active'},owner),/kết thúc/);
 clean();source(at);const d=await campaign({endAt:iso(at+60000)});await tick(at,sender(at));await tick(at+30*60000,()=>assert.fail('expired'));assert.equal(job(d).status,'cancelled');
});
test('disabled template invalidates pending work and no incoming source triggers',async()=>{
 clean();const s=source(at),c=await campaign();await tick(at,sender(at));put('templates',{...get('templates','t1'),enabled:false});await tick(at+30*60000,()=>assert.fail('disabled'));assert.equal(job(c).status,'cancelled');put('templates',{...get('templates','t1'),enabled:true});put('messages',{...s.m,direction:'incoming'});assert.ok(!audience(owner,c,at).some(r=>r.conversationId===s.v.id));
});
test('real template sender preserves template ID, run, and final-block provenance',async()=>{
 clean();const s=source(Date.now()-60000);const result=await runTemplate(owner,s.v.id,{templateId:'t1',requestId:'qa-provenance-123456',version:get('conversations',s.v.id).version});assert.equal(result.status,'done');const m=get('messages',result.messageIds.at(-1));assert.equal(m.templateId,'t1');assert.equal(m.templateRunId,result.id);assert.equal(m.templateSequenceEnd,true);
});

test('partial provider acceptance never retries a block even when a later attachment is rejected',async()=>{clean();source(at-31*60000);const c=await campaign({maxRetries:3});await tick(at,async()=>{throw Object.assign(Error('Later attachment rejected'),{providerStatus:400,externalMessages:[{id:'accepted-part'}]});});assert.equal(job(c).status,'unknown');await tick(at+600000,()=>assert.fail('must not duplicate accepted part'));});
