import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'customer-directory-'));process.env.PLAN_REMOTE_CATALOG='0';
const {buildCustomerDirectory}=await import('../server/customer-directory-model.mjs');
const {customerDirectory}=await import('../server/customer-directory.mjs');
const {put,get,db}=await import('../server/store.mjs');
const {learnerMessageFacts}=await import('../server/learner-message-facts.mjs');
const base=()=>({customers:[],conversations:[],orders:[],study_plans:[],plan_handoffs:[],journeys:[],learner_source_facts:[]});
test('only contact/order/deposit/plan evidence qualifies; ordinary chat, comments, email and bare group do not',()=>{
 const s=base();s.customers=[{id:'chat',name:'Chat'},{id:'comment',email:'email@qa.test'},{id:'phone',phone:'0901111111'},{id:'address',address:'123 Đường A'},{id:'order'},{id:'deposit',learnerRegistration:{is_deposit:true,deposit_amount:200000}},{id:'remote',origin:'taophacdo'},{id:'local-plan'},{id:'facts'},{id:'merged',phone:'0902222222',mergedInto:'phone'},{id:'group',name:'Nhóm không có hồ sơ'}];
 s.conversations=[{id:'chat-conv',customerId:'chat'},{id:'comment-conv',customerId:'comment',kind:'comment'},{id:'group-conv',customerId:'group',threadType:1}];s.orders=[{customerId:'order',paid:20},{customerId:'order',paid:30}];s.study_plans=[{customerId:'local-plan',customer:{sdt:'0903333333',dia_chi:'Địa chỉ phác đồ'}}];s.learner_source_facts=[{id:'facts',status:'ACTIVE'}];
 const rows=buildCustomerDirectory(s);assert.deepEqual(rows.map(c=>c.id).sort(),['address','deposit','facts','local-plan','order','phone','remote']);assert.equal(rows.find(c=>c.id==='order').orderCount,2);assert.equal(rows.find(c=>c.id==='order').paidTotal,50);assert.equal(rows.find(c=>c.id==='local-plan').phone,'0903333333');
});
test('groups prefer qualified selected learner; exclude unrelated channel members and deduplicate representatives',()=>{
 const s=base();s.customers=[{id:'group'},{id:'plain'},{id:'representative',learnerProgress:{stage:'CONSULTED'}},{id:'other-channel',phone:'0901111111'},{id:'known',phone:'0902222222'}];
 s.conversations=[{id:'member',connectionId:'one',externalUserId:'m',customerId:'representative'},{id:'plain-member',connectionId:'one',externalUserId:'p',customerId:'plain'},{id:'other-member',connectionId:'two',externalUserId:'m',customerId:'other-channel'},{id:'known-member',connectionId:'one',externalUserId:'k',customerId:'known'},...['a','b'].map(id=>({id,connectionId:'one',customerId:'group',threadType:1,learnerCustomerId:'representative',group:{memberIds:['m','p','k']}}))];
 const rows=buildCustomerDirectory(s),representative=rows.find(c=>c.id==='representative');assert.equal(representative.groups.length,2);assert.equal(rows.filter(c=>c.id==='representative').length,1);assert.ok(!rows.some(c=>['group','plain'].includes(c.id)));assert.equal(rows.find(c=>c.id==='other-channel').groups.length,0);
});
test('directory pagination/search and permission-bound cached snapshots invalidate after customer writes',async()=>{
 for(let i=0;i<65;i++)put('customers',{id:'dir-'+i,name:'Học viên '+String(i).padStart(3,'0'),phone:'0901111111',createdBy:'owner'});
 put('customers',{id:'unqualified',name:'Chat only'});const owner={id:'owner',role:'owner'};
 const first=await customerDirectory(owner);assert.equal(first.total,65);assert.equal(first.rows.length,50);assert.equal((await customerDirectory(owner,new URLSearchParams({page:'2'}))).rows.length,15);assert.equal((await customerDirectory(owner,new URLSearchParams({q:'hoc vien 064'}))).rows[0].id,'dir-64');
 put('customers',{...get('customers','unqualified'),phone:'0902222222'});assert.equal((await customerDirectory(owner)).total,66);
 const support={id:'support',role:'support'};put('connections',{id:'allowed',provider:'facebook'});put('team_members',{userId:support.id,teamId:'team'});put('channel_teams',{connectionId:'allowed',teamId:'team'});put('conversations',{connectionId:'allowed',customerId:'dir-0'});assert.deepEqual((await customerDirectory(support)).rows.map(c=>c.id),['dir-0']);await assert.rejects(customerDirectory({id:'viewer',role:'viewer'}),/quyền/);
});
test('learner message facts only read relevant messages and respect cleared/failed/comment history',()=>{
 const customer=put('customers',{id:'profile-customer',name:'QA'});put('conversations',{id:'profile-conv',customerId:customer.id,connectionId:'allowed'});put('messages',{conversationId:'profile-conv',direction:'incoming',status:'received',text:'Số 090 333 4444',createdAt:'2026-01-01'});put('messages',{conversationId:'unrelated',direction:'incoming',text:'PRIVATE_UNRELATED_MARKER'});
 const original=JSON.parse;JSON.parse=(value,...args)=>{assert.ok(!String(value).includes('PRIVATE_UNRELATED_MARKER'));return original(value,...args);};try{assert.deepEqual(learnerMessageFacts(customer),{phone:'0903334444',hasHistory:true});}finally{JSON.parse=original;}
 put('conversations',{...get('conversations','profile-conv'),clearedBefore:'2026-02-01'});assert.equal(learnerMessageFacts(customer).hasHistory,false);put('messages',{conversationId:'profile-conv',direction:'outgoing',status:'failed',createdAt:'2026-03-01'});assert.equal(learnerMessageFacts(customer).hasHistory,false);
 const plan=db.prepare("EXPLAIN QUERY PLAN SELECT json_extract(data,'$.text') FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? ORDER BY json_extract(data,'$.createdAt'),id").all('profile-conv');assert.ok(plan.some(r=>r.detail.includes('idx_learner_profile_messages')));
});
