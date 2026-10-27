import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'complete-directory-'));process.env.PLAN_REMOTE_CATALOG='0';
const {readAllDirectoryLearners,refreshDirectoryLearners,cachedDirectoryLearners,mergeDirectoryLearners,learnerDirectoryId,materializeDirectoryLearner}=await import('../server/learner-directory-source.mjs');
const {buildCustomerDirectory}=await import('../server/customer-directory-model.mjs');const {all,put}=await import('../server/store.mjs');
const learners=Array.from({length:963},(_,i)=>({id:'source-'+i,customer_id:'student-'+i,customer_name:'Học viên '+i,sdt:i%3?'':'0901111111',status:i>=898?'DELETED':'ACTIVE',video_date:'2026-01-01',start_date:'2026-01-01',end_date:'2099-12-31',token:'DO_NOT_STORE',note:'PRIVATE_NOTES'}));
test('reads all 898 non-deleted learners even when provider caps pages below requested size; strips unsafe fields',async()=>{
 const offsets=[],source=await refreshDirectoryLearners({force:true,readPage:async offset=>{offsets.push(offset);return learners.slice(offset,offset+200);}});
 assert.deepEqual(offsets,[0,200,400,600,800,963]);assert.equal(source.sourceRows,963);assert.equal(source.learnerCount,898);assert.equal(source.rows[0].token,undefined);assert.equal(source.rows[0].note,undefined);
});
test('directory includes every learner, joins only canonical links and keeps same-name/phone people separate',()=>{
 const source={customers:[{id:'known',name:learners[0].customer_name,customer_id:'student-0',phone:'0909999999'},{id:'chat-only',name:'Chat only'},{id:'same-name',name:learners[1].customer_name,phone:'0901111111'}],conversations:[],orders:[{customerId:'known',paid:50}],study_plans:[],learner_source_facts:[],journeys:[]};
 const merged=mergeDirectoryLearners(source,learners),rows=buildCustomerDirectory(merged);assert.equal(merged.remoteLearnerIds.size,898);assert.equal(rows.length,899);assert.ok([...merged.remoteLearnerIds].every(id=>rows.some(r=>r.id===id)));assert.equal(rows.find(r=>r.id==='known').orderCount,1);assert.equal(rows.find(r=>r.id==='known').phone,'0909999999');assert.ok(rows.some(r=>r.id==='same-name'));assert.ok(rows.some(r=>r.id===learnerDirectoryId('student-1')));assert.ok(!rows.some(r=>r.id==='chat-only'));assert.ok(!rows.some(r=>r.id===learnerDirectoryId('student-898')));
});
test('conflicting legacy canonical pointers never collapse two distinct learners into one row',()=>{
 const source={customers:[{id:'legacy',customer_id:'student-0',planCustomerId:'student-1'}],study_plans:[],conversations:[],orders:[]};
 const merged=mergeDirectoryLearners(source,learners.slice(0,2)),rows=buildCustomerDirectory(merged);assert.equal(merged.remoteLearnerIds.size,2);assert.equal(rows.length,2);
});
test('deleted source-only records are excluded while their real contact/order evidence is retained',()=>{
 const source={customers:[{id:'deleted',origin:'taophacdo',customer_id:'student-898'},{id:'deleted-contact',origin:'taophacdo',customer_id:'student-899',phone:'0901111111'}],conversations:[],study_plans:[],orders:[]};
 const rows=buildCustomerDirectory(mergeDirectoryLearners(source,learners.slice(898,900)));assert.deepEqual(rows.map(r=>r.id),['deleted-contact']);
});
test('source failures, duplicate IDs and empty refresh never replace the complete persisted snapshot',async()=>{
 const old=cachedDirectoryLearners().updatedAt;
 const retained=await refreshDirectoryLearners({force:true,readPage:async offset=>{if(offset)throw Error('Unavailable');return learners.slice(0,500);}});assert.equal(retained.learnerCount,898);assert.equal(retained.updatedAt,old);assert.equal(retained.refreshFailed,true);
 await assert.rejects(readAllDirectoryLearners(async offset=>offset?[]:[learners[0],learners[0]]),/trùng/);
 assert.equal((await refreshDirectoryLearners({force:true,readPage:async()=>[]})).learnerCount,898);
});
test('opening a source-only learner materializes only that verified identity, with role checks and canonical reuse',()=>{
 assert.equal(all('customers').length,0);assert.equal(materializeDirectoryLearner({id:'staff',role:'support'},learnerDirectoryId('student-1')),null);assert.equal(materializeDirectoryLearner({id:'owner',role:'owner'},learnerDirectoryId('unknown')),null);
 const learner=materializeDirectoryLearner({id:'owner',role:'owner'},learnerDirectoryId('student-1'));assert.equal(learner.customer_id,'student-1');assert.equal(learner.origin,'taophacdo');assert.equal(all('customers').length,1);assert.equal(materializeDirectoryLearner({id:'owner',role:'owner'},learner.id).id,learner.id);assert.equal(all('customers').length,1);
 put('customers',{id:'existing-local',customer_id:'student-2',name:'Existing'});assert.equal(materializeDirectoryLearner({id:'owner',role:'owner'},learnerDirectoryId('student-2')).id,'existing-local');assert.equal(all('customers').length,2);
});
test('a real learner profile attached to a group outranks phone-only staff; ambiguous membership is not guessed',()=>{
 const source={customers:[{id:'group-profile',customer_id:'student-0',name:'Nhóm học viên'},{id:'staff',name:'Hoàng Anh',phone:'0901111111'}],conversations:[{id:'staff-chat',connectionId:'one',customerId:'staff',externalUserId:'staff-id'},{id:'known-group',connectionId:'one',customerId:'group-profile',threadType:1,learnerCustomerId:'staff',group:{ownId:'service',members:[{id:'staff-id',role:'admin'}]}},{id:'unknown-group',connectionId:'one',customerId:'unlinked-group',title:'Một nhóm khác',threadType:1,group:{members:[{id:'staff-id'}]}}],orders:[],study_plans:[],learner_source_facts:[],journeys:[]};
 const rows=buildCustomerDirectory(mergeDirectoryLearners(source,[learners[0]]));assert.equal(rows.find(c=>c.id==='group-profile').name,learners[0].customer_name);assert.deepEqual(rows.find(c=>c.id==='group-profile').groups.map(g=>g.id),['known-group']);assert.equal(rows.find(c=>c.id==='staff').groups.length,0);
});
