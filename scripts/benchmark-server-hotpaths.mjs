import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'hotpaths-'));process.env.PLAN_REMOTE_CATALOG='0';
const {db,put,all,get}=await import('../server/store.mjs'),{studentCareState,scopeCareChats}=await import('../server/student-care.mjs'),{botTick}=await import('../server/chatbot.mjs');
const {dashboardCountsFor}=await import('../server/dashboard-aggregate.mjs');
db.exec('BEGIN');db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('owner','qa@example.test','QA','owner','unused');put('connections',{id:'ch',provider:'zalo_personal',mode:'demo',status:'connected'});
for(let i=0;i<4100;i++){put('customers',{id:'p'+i,name:'QA '+i,notes:'Private fixture '.repeat(80)});put('conversations',{id:'c'+i,customerId:'p'+i,connectionId:'ch',kind:'message',threadType:0,lastAt:new Date().toISOString(),group:null,externalUserId:String(i)});if(i<200)put('staff_handoffs',{id:'h'+i,conversationId:'c'+i,customerId:'p'+i,status:'open',stage:'NEW',questions:[],configuredStaffId:null});}
for(let i=0;i<37000;i++)put('messages',{id:'m'+i,conversationId:'c'+i%4100,direction:'incoming',senderId:String(i%4100),text:'Historical fixture '.repeat(20),history:true,createdAt:'2020-01-01T00:00:00.000Z'});db.exec('COMMIT');
const {applyProfileNames}=await import('../server/zalo-profile-names.mjs');
const report={environment:'Local synthetic fixture: 4,100 learners/conversations, 37,000 historical messages, 200 staff handoffs. No production customer data.'};
async function measure(name,fn){const t=performance.now();await fn();report[name]=Math.round(performance.now()-t);}
await measure('repeatedCareLookupsMs',()=>{for(let i=0;i<200;i++)studentCareState();});
await measure('botTickMs',()=>botTick(async()=>{throw Error('No external provider allowed in benchmark');}));
await measure('dashboardCountsMs',()=>dashboardCountsFor({id:'owner',role:'owner'}));
await measure('careScopeMs',()=>scopeCareChats({...studentCareState(),messages:[]},{id:'owner',role:'owner'},{includeExceptions:false}));
const profiles=Object.fromEntries(Array.from({length:50},(_,i)=>[String(i),{displayName:'Updated QA '+i}]));await measure('legacyProfileScanOnlyMs',()=>{for(const uid of Object.keys(profiles)){all('conversations').filter(c=>c.connectionId==='ch'&&String(c.externalUserId)===uid);all('messages').filter(m=>String(m.senderId)===uid&&get('conversations',m.conversationId)?.connectionId==='ch');}});await measure('indexedProfileSyncWithWritesMs',()=>applyProfileNames('ch',profiles));console.log(JSON.stringify(report,null,2));mkdirSync('test-results/server-hotpaths',{recursive:true});writeFileSync('test-results/server-hotpaths/report.json',JSON.stringify(report,null,2));db.close();
