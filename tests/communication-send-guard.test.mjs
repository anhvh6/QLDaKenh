import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'comm-guard-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,db}=await import('../server/store.mjs');
const {communicationSendWait:wait,reserveCommunicationSend:reserve,recordStaffSend:manual,withPlatformSend,communicationAutomatic,communicationLock}=await import('../server/communication-send-guard.mjs');
const {reply}=await import('../server/domain.mjs');
const {communicationTick:tick}=await import('../server/communication-campaigns.mjs');
const owner={id:'owner',role:'owner',active:1};db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('owner','qa@example.test','QA','owner','qa');
const at=Date.now();
beforeEach(()=>{db.exec('DELETE FROM records');for(const [id,provider] of [['z1','zalo_personal'],['z2','zalo_personal'],['oa','zalo'],['f','facebook']]){put('connections',{id,provider,mode:'demo',status:'connected'});put('customers',{id,name:id,learnerProgress:{stage:'CONSULTED',manualOverride:true}});put('conversations',{id:'v-'+id,connectionId:id,customerId:id,kind:'message',threadType:0,externalUserId:id});}});
test('same content waits indefinitely across channels until a different manual message, then 3 seconds',()=>{
 reserve('zalo_personal','Hello',[],at);assert.equal(wait('zalo_personal','Hello',[],at+86400000).code,'duplicate');
 manual('facebook','Other',[],at+1000);assert.equal(wait('zalo_personal','Hello',[],at+5000).code,'duplicate');
 manual('zalo','Hello',[],at+2000);assert.equal(wait('zalo_personal','Hello',[],at+6000).code,'duplicate');
 manual('zalo_personal','Other',[],at+3000);assert.equal(wait('zalo','Hello',[],at+5999).code,'spacing');assert.equal(wait('zalo_personal','Hello',[],at+6000),null);
 reserve('zalo','Hello',[],at+6000);assert.equal(wait('zalo_personal','Hello',[],at+10000).code,'duplicate');
});
test('all automated sends have platform spacing; media identity and normalized text are compared',()=>{
 reserve('zalo','  Hi\n there ',['a'],at);assert.equal(wait('zalo','Hi there',['a'],at+4000).code,'duplicate');assert.equal(wait('zalo','Different',[],at+2999).code,'spacing');assert.equal(wait('zalo','Hi there',['b'],at+3000),null);assert.equal(wait('facebook','Hi there',['a'],at),null);
});
test('only confirmed staff sends release content; incoming, notes, AI, history and failed sends do not',()=>{
 reserve('zalo','Hello',[],at);
 for(const [id,extra] of [['incoming',{direction:'incoming'}],['note',{direction:'note'}],['ai',{senderType:'ai'}],['history',{history:true}],['failed',{status:'failed'}],['automatic',{communicationCampaignId:'campaign'}]])put('messages',{id,conversationId:'v-z2',direction:'outgoing',senderType:'staff',status:'accepted',text:'Other',createdAt:new Date(at+1000).toISOString(),...extra});
 assert.equal(wait('zalo','Hello',[],at+6000).code,'duplicate');
 put('messages',{id:'staff',conversationId:'v-z2',direction:'outgoing',status:'sent',text:'Other',createdAt:new Date(at+2000).toISOString()});
 assert.equal(wait('zalo','Hello',[],at+4999).code,'spacing');assert.equal(wait('zalo','Hello',[],at+5000),null);
});
test('durable reservations survive module reload and definitive failures may roll back',async()=>{
 const rollback=reserve('zalo','Hello',[],at);const reloaded=await import('../server/communication-send-guard.mjs?restart');assert.equal(reloaded.communicationSendWait('zalo','Hello',[],at+10000).code,'duplicate');rollback();assert.equal(wait('zalo','Hello',[],at+4000),null);
});
test('deployment seeds the latest campaign message without treating older staff history as intervening',()=>{
 put('messages',{id:'older-staff',conversationId:'v-z2',direction:'outgoing',status:'sent',text:'Other',createdAt:new Date(at-10000).toISOString()});
 put('messages',{id:'previous-auto',conversationId:'v-z1',direction:'outgoing',status:'accepted',text:'Hello',communicationCampaignId:'old-campaign',createdAt:new Date(at-5000).toISOString()});
 assert.equal(wait('zalo_personal','Hello',[],at).code,'duplicate');
 put('messages',{id:'new-staff',conversationId:'v-z2',direction:'outgoing',status:'sent',text:'Other',createdAt:new Date(at+1000).toISOString()});assert.equal(wait('zalo','Hello',[],at+4000),null);
});
test('platform lock serializes same platform but allows another platform',async()=>{
 let release,started=false;const gate=new Promise(r=>release=r),events=[];
 const first=withPlatformSend('zalo_personal',async()=>{events.push('first');await gate;});
 const second=withPlatformSend('zalo',async()=>{started=true;events.push('second');});await withPlatformSend('facebook',async()=>events.push('facebook'));assert.equal(started,false);release();await Promise.all([first,second]);assert.deepEqual(events,['first','facebook','second']);
});
test('normal reply records staff activity; campaign replies are tagged before send and never unlock themselves',async()=>{
 const m=await reply({...owner,[communicationAutomatic]:'c',[communicationLock]:true},'v-z1',{version:get('conversations','v-z1').version,text:'Hello'});assert.equal(m.communicationCampaignId,'c');
 reserve('zalo','Hello',[],Date.now()-4000);assert.equal(wait('zalo','Hello',[],Date.now()).code,'duplicate');
 await reply(owner,'v-z2',{version:get('conversations','v-z2').version,text:'Other'});assert.equal(wait('zalo','Hello',[],Date.now()).code,'spacing');assert.equal(wait('zalo','Hello',[],Date.now()+4000),null);
});
test('blocked worker jobs remain queued without consuming attempts or starving another platform',async()=>{
 const c=put('communication_campaigns',{id:'c',actor:'owner',configRevision:1,status:'active',mode:'manual',providers:['zalo_personal','facebook'],connectionIds:[],stages:['CONSULTED'],blocks:[{text:'Hello',assetIds:[]}],startAt:new Date(at-60000).toISOString(),endAt:'',newNonFriendOnly:false,beforeExpiryDays:5});
 for(const [id,ch] of [['first','z1'],['second','z2'],['third','f']])put('communication_jobs',{id,campaignId:c.id,configRevision:1,actor:'owner',conversationId:'v-'+ch,customerId:ch,blocks:c.blocks,status:'queued',nextBlock:0,messageIds:[],createdAt:new Date(at-10000).toISOString()});
 const sent=[];const send=async(u,id,input)=>{sent.push(id);return{id:'m-'+sent.length,status:'demo'};};await tick(at,send);await tick(at+4000,send);assert.deepEqual(sent,['v-z1','v-f']);assert.equal(get('communication_jobs','second').status,'queued');assert.equal(get('communication_jobs','second').waitReason,'duplicate');assert.equal(get('communication_jobs','second').attempts,undefined);
 manual('zalo','Intervening',[],at+5000);await tick(at+7999,send);assert.equal(sent.length,2);await tick(at+9000,send);assert.deepEqual(sent,['v-z1','v-f','v-z2']);
});
