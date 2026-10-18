import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'learner-sync-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,stateRevision}=await import('../server/store.mjs'),{applyLearnerStatusRows}=await import('../server/learner-status-sync.mjs');
test('status refresh retains purge protection, ignores removed customers and avoids repeat writes',()=>{
 for(const id of ['active','missing','purging'])put('customers',{id,name:id});put('conversations',{id:'purging-chat',customerId:'purging',purgePending:true});
 const linked=['active','missing','purging','removed'].map(id=>({c:{id},key:id}));const rows=[{customer_id:'active',status:'ACTIVE'},{customer_id:'purging',status:'DELETED'}];applyLearnerStatusRows(linked,rows);
 assert.equal(get('learner_source_facts','active').learnerDeleted,false);assert.equal(get('learner_source_facts','missing').learnerDeleted,true);assert.equal(get('learner_source_facts','purging'),null);assert.equal(get('learner_source_facts','removed'),null);
 const revision=stateRevision();applyLearnerStatusRows(linked,rows);assert.equal(stateRevision(),revision);
});
test('bulk refresh projects pending purges once without loading conversation bodies per customer',()=>{
 const linked=[],rows=[];for(let i=0;i<300;i++){put('customers',{id:'bulk-'+i});linked.push({c:{id:'bulk-'+i},key:'source-'+i});rows.push({customer_id:'source-'+i,status:'ACTIVE'});put('conversations',{id:'bulk-chat-'+i,customerId:'bulk-'+i,group:{description:'Long group details '.repeat(2000)}});}
 const start=performance.now();applyLearnerStatusRows(linked,rows);console.log('300 learners / 300 large conversations refresh ms:',Math.round(performance.now()-start));assert.ok(performance.now()-start<3000);assert.equal(get('learner_source_facts','bulk-299').status,'ACTIVE');
});
