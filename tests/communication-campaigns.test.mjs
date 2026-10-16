import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'communication-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,all,db}=await import('../server/store.mjs');
const {communicationRoute:route,communicationAudience:audience,communicationTick:tick,recoverCommunication}=await import('../server/communication-campaigns.mjs');
const {scheduledOccurrence,matchingCommunicationStage:match}=await import('../public/communication-model.js');
const owner={id:'owner',role:'owner',active:1};db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(owner.id,'comm@example.test','Owner','owner','qa');
const base='/api/communication-campaigns',at=Date.parse('2026-10-16T09:00:00+07:00');
const config=(extra={})=>({name:'QA truyền thông',providers:['zalo_personal'],connectionIds:[],stages:['CONSULTED'],mode:'automatic',repeat:'cycle',intervalDays:2,status:'active',startAt:'2026-10-16T00:00:00+07:00',endAt:'',sendTime:'09:00',beforeExpiryDays:5,afterExpiryDays:2,afterStudyDays:7,afterDepositDays:3,newNonFriendOnly:true,blocks:[{text:'Chào {{name}}',assetIds:[]}],...extra});
function person(id,stage='CONSULTED',extra={}){put('customers',{id,name:id,learnerProgress:{stage,manualOverride:true,updatedAt:'2026-10-10T00:00:00Z'},...extra});return put('conversations',{id:'conv-'+id,customerId:id,connectionId:'z',externalUserId:id,threadType:0,kind:'message',isFriend:false,lastAt:new Date(at).toISOString()});}
put('connections',{id:'z',provider:'zalo_personal',mode:'demo',status:'connected',name:'Zalo QA'});

test('Vietnam schedule: once, recurring days, boundaries and no late catch-up',()=>{
 const c=config();assert.equal(scheduledOccurrence(c,at-1),null);assert.equal(scheduledOccurrence(c,at),new Date(at).toISOString());assert.equal(scheduledOccurrence(c,at+29*60000),new Date(at).toISOString());assert.equal(scheduledOccurrence(c,at+30*60000),null);assert.equal(scheduledOccurrence(c,at+86400000),null);assert.ok(scheduledOccurrence(c,at+2*86400000));assert.equal(scheduledOccurrence({...c,repeat:'once'},at+2*86400000),null);assert.equal(scheduledOccurrence({...c,endAt:new Date(at-1).toISOString()},at),null);assert.equal(scheduledOccurrence({...c,mode:'manual'},at),null);
});
test('stage filters use actual expiry, start and deposit dates; new requires first history and known non-friend',()=>{
 const p={id:'p',origin:'taophacdo',hasEffectivePlan:true,start_date:'2026-10-01',end_date:'2026-10-21',status:'ACTIVE'},state={conversations:[],messages:[]};
 assert.equal(match(config({stages:['EXPIRING']}),p,{},state,at),'EXPIRING');assert.equal(match(config({stages:['EXPIRING'],beforeExpiryDays:4}),p,{},state,at),null);
 assert.equal(match(config({stages:['EXPIRED']}),{...p,end_date:'2026-10-14'}, {},state,at),'EXPIRED');assert.equal(match(config({stages:['EXPIRED'],afterExpiryDays:3}),{...p,end_date:'2026-10-14'},{},state,at),null);
 assert.equal(match(config({stages:['STUDYING']}),{...p,end_date:'2026-11-01'},{},state,at),'STUDYING');assert.equal(match(config({stages:['STUDYING'],afterStudyDays:16}),{...p,end_date:'2026-11-01'},{},state,at),null);
 const deposit={id:'p',is_deposit:true,deposit_amount:500000};assert.equal(match(config({stages:['DEPOSIT']}),deposit,{},state,at),null);state.journeyEvents=[{customerId:'p',to:'DEPOSIT',from:'NEW',createdAt:'2026-10-13T01:00:00Z'}];assert.equal(match(config({stages:['DEPOSIT']}),deposit,{},state,at),'DEPOSIT');
 const conv={id:'v',customerId:'new',provider:'zalo_personal',isFriend:false};const s={conversations:[conv],messages:[{id:'m',conversationId:'v',direction:'incoming',createdAt:'2026-10-16T01:00:00Z'}]},c=config({stages:['NEW'],newSince:'2026-10-15T00:00:00Z'});
 assert.equal(match(c,{id:'new'},conv,s,at),'NEW');assert.equal(match(c,{id:'new'},{...conv,isFriend:true},s,at),null);assert.equal(match(c,{id:'new'},{...conv,isFriend:undefined},s,at),null);assert.equal(match(c,{id:'new'},conv,{...s,messages:[...s.messages,{id:'old',conversationId:'v',direction:'incoming',createdAt:'2026-10-01T00:00:00Z'}]},at),null);assert.equal(match({...c,startAt:'2026-10-16T08:30:00+07:00'},{id:'new'},conv,s,at),null);assert.equal(match(c,{id:'new'},conv,{...s,messages:[]},at),null);
});
test('save validates permissions, scoped assets, channels, empty filters and one-time clock',async()=>{
 await assert.rejects(route(base,'POST',config(),{id:'editor',role:'editor'}),/quyền/);await assert.rejects(route(base,'POST',config({providers:[]}),owner),/nền tảng/);await assert.rejects(route(base,'POST',config({stages:[]}),owner),/trạng thái/);await assert.rejects(route(base,'POST',config({blocks:[{text:'',assetIds:[]}]}),owner),/Mỗi tin/);await assert.rejects(route(base,'POST',config({repeat:'once',startAt:'2026-10-16T10:00:00+07:00'}),owner),/Giờ gửi/);await assert.rejects(route(base,'POST',config({blocks:[{text:'QA',assetIds:['missing']}]}),owner),/Tệp/);await assert.rejects(route(base,'POST',config({connectionIds:['no-channel']}),owner),/Kênh/);
});
test('audience only private, connected channels and correct statuses; duplicates share one recipient',()=>{
 const c=person('eligible');person('paid','PAID');const duplicate=put('conversations',{...c,id:'duplicate'});put('conversations',{...c,id:'group',threadType:1});put('conversations',{...c,id:'comment',kind:'comment'});put('connections',{id:'off',provider:'zalo_personal',status:'disconnected'});put('conversations',{...c,id:'offline',connectionId:'off'});const rows=audience(owner,config(),at);assert.equal(rows.length,1);assert.equal(rows[0].customerId,'eligible');assert.ok(['conv-eligible',duplicate.id].includes(rows[0].conversationId));
});
test('worker queues once, sends blocks in order, records exact messages and does not retry ambiguous sends',async()=>{
 const c=await route(base,'POST',config({blocks:[{text:'A {{name}}',assetIds:[]},{text:'B',assetIds:[]}]}),owner),sent=[];
 const send=async(u,id,input)=>{sent.push(input);return {id:'msg-'+sent.length,status:'demo'};};await tick(at,send);await tick(at+5000,send);await tick(at+10000,send);assert.equal(sent.length,2);assert.equal(sent[0].text,'A eligible');assert.equal(sent[1].text,'B');assert.equal(all('communication_runs').filter(r=>r.campaignId===c.id).length,1);assert.equal(all('communication_jobs').find(j=>j.campaignId===c.id).status,'done');
 const broken=await route(base,'POST',config({name:'Uncertain',repeat:'once'}),owner);let calls=0;await tick(at,async()=>{calls++;throw Object.assign(Error('Timeout'),{unknown:true});});await tick(at+5000,async()=>{calls++;});assert.equal(calls,1);assert.equal(all('communication_jobs').find(j=>j.campaignId===broken.id).status,'unknown');
});
test('pause/config edits cancel queued blocks; restart recovery never retries in-flight message',async()=>{
 const c=await route(base,'POST',config({blocks:[{text:'First',assetIds:[]},{text:'Second',assetIds:[]}]}),owner);let calls=0;await tick(at,async()=>{calls++;return{id:'first'};});await route(base+'/'+c.id,'PATCH',{...get('communication_campaigns',c.id),status:'paused'},owner);await tick(at+5000,async()=>{calls++;});assert.equal(calls,1);assert.equal(all('communication_jobs').find(j=>j.campaignId===c.id).status,'cancelled');
 const j=put('communication_jobs',{id:'recover',status:'sending',campaignId:c.id});recoverCommunication();assert.equal(get('communication_jobs',j.id).status,'unknown');
});
test('manual request id is idempotent and rejects inactive or out-of-range campaign',async()=>{
 const c=await route(base,'POST',config({mode:'manual',startAt:new Date(Date.now()-60000).toISOString()}),owner);const input={version:c.version,requestId:'manual-qa-123456789'};const a=await route(base+'/'+c.id+'/run','POST',input,owner),b=await route(base+'/'+c.id+'/run','POST',input,owner);assert.equal(a.id,b.id);await route(base+'/'+c.id,'PATCH',{...c,status:'paused'},owner);await assert.rejects(route(base+'/'+c.id+'/run','POST',{...input,version:get('communication_campaigns',c.id).version},owner),/Bật chiến dịch/);
});
test('new customer only receives one campaign occurrence across cycles',async()=>{
 for(const old of all('communication_campaigns'))put('communication_campaigns',{...old,status:'paused'});for(const j of all('communication_jobs').filter(j=>j.status==='queued'))put('communication_jobs',{...j,status:'cancelled'});
 const conv=person('first-contact','NEW');put('messages',{id:'first-contact-message',conversationId:conv.id,direction:'incoming',createdAt:'2026-10-16T01:00:00Z'});
 const c=await route(base,'POST',config({stages:['NEW'],newNonFriendOnly:true}),owner);put('communication_campaigns',{...c,newSince:'2026-10-15T00:00:00Z'});let count=0;await tick(at,async()=>{count++;return{id:'greeting',status:'demo'};});await tick(at+2*86400000,async()=>{count++;return{id:'duplicate'};});assert.equal(count,1);
});
