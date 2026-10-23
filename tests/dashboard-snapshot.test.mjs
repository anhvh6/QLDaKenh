import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'dashboard-light-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,db}=await import('../server/store.mjs');
const {dashboardSnapshot}=await import('../server/dashboard-snapshot.mjs');
const {createAggregateStore}=await import('../server/overview-cache.mjs');
const {dashboardRevision,dashboardScopeRevision}=await import('../server/dashboard-aggregate.mjs');
const store=createAggregateStore(db),owner={id:'o',role:'owner'},staff={id:'s',role:'support'},time=Date.parse('2026-10-23T14:00:00Z');
for(const [id,role] of [['o','owner'],['s','support']])db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(id,id+'@example.test',id,role,'hash');
for(const id of ['a','b'])put('connections',{id,name:id,provider:'facebook',status:'connected',accountId:'SECRET-ACCOUNT',credentials:'SECRET',mode:'demo'});
put('team_members',{id:'m',teamId:'t',userId:'s'});put('channel_teams',{id:'ct',teamId:'t',connectionId:'a'});
put('customers',{id:'ca',name:'Allowed',phone:'PRIVATE-PHONE',medicalNotes:'PRIVATE-MEDICAL'});put('customers',{id:'cb',name:'Forbidden'});
for(const id of ['a','b']){put('conversations',{id:'conv-'+id,customerId:'c'+id,connectionId:id,kind:'message'});put('chat_reminders',{id:'rem-'+id,conversationId:'conv-'+id,customerId:'c'+id,title:'Reminder '+id,dueAt:'2026-10-23T10:00:00Z',status:'pending'});put('contents',{id:'post-'+id,title:'Post '+id,caption:'PRIVATE-FULL-CAPTION',channels:[id],assets:['private-media'],type:'text'});put('publications',{id:'pub-'+id,contentId:'post-'+id,connectionId:id,scheduleAt:'2026-10-23T10:00:00Z',status:'published',caption:'PRIVATE-FULL-CAPTION'});}
put('publications',{id:'old',contentId:'old',connectionId:'a',scheduleAt:'2020-01-01T00:00:00Z',status:'failed'});
const snapshot=user=>dashboardSnapshot(user,{aggregates:store,revision:'r',sourceRevision:dashboardRevision(),time,providers:{facebook:{label:'Facebook'}}});
test('compact dashboard excludes full history, assets, secrets and unrelated customer fields',async()=>{
 await store.refresh('dashboard-counts:o:owner',()=>({counts:{prepared:51,messages:6}}),{revision:'older-data'});const state=snapshot(owner);assert.equal(state.dashboardCompact,true);assert.equal(state.dashboardCounts.prepared,51);assert.equal(state.dashboardCountsStale,true);assert.equal(state.publications.some(p=>p.id==='old'),false);assert.equal(state.assets.length,0);assert.equal(state.messages.length,0);assert.equal(state.orders.length,0);assert.equal(state.dashboardRecentContentIds.length,2);const body=JSON.stringify(state);for(const value of ['SECRET','PRIVATE-PHONE','PRIVATE-MEDICAL','PRIVATE-FULL-CAPTION'])assert.equal(body.includes(value),false,value);
});
test('scope is enforced on connections, content, publications, reminders and customers',async()=>{
 let state=snapshot(staff);assert.deepEqual(state.connections.map(c=>c.id),['a']);assert.ok(state.contents.every(c=>c.id==='post-a'));assert.deepEqual(state.publications.map(p=>p.id),['pub-a']);assert.deepEqual(state.chat_reminders.map(p=>p.id),['rem-a']);assert.deepEqual(state.customers.map(c=>c.id),['ca']);assert.equal(state.dashboardLearnerOverview,undefined);assert.equal(state.dashboardCountsPending,true);
 await store.refresh('dashboard-counts:s:support',()=>({scopeRevision:dashboardScopeRevision(staff),counts:{prepared:1}}),{revision:dashboardRevision()});state=snapshot(staff);assert.equal(state.dashboardCounts.prepared,1);
 put('channel_teams',{...get('channel_teams','ct'),connectionId:'b'});state=snapshot(staff);assert.deepEqual(state.connections.map(c=>c.id),['b']);assert.equal(state.dashboardCounts,undefined);assert.equal(state.dashboardCountsPending,true);assert.equal(JSON.stringify(state).includes('Allowed'),false);
});
test('reads never compute aggregates or fetch external sources',()=>{let calls=0;const state=dashboardSnapshot(owner,{time,sourceRevision:'x',aggregates:{read:()=>{calls++;return null;}}});assert.equal(calls,2);assert.equal(state.dashboardCountsPending,true);});

test('ordinary message writes do not invalidate authorized aggregate scope',async()=>{const before=dashboardScopeRevision(staff);put('messages',{id:'later-message',conversationId:'conv-b',direction:'incoming',text:'New message'});assert.equal(dashboardScopeRevision(staff),before);});
