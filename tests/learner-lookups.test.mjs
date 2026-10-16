import test from 'node:test';import assert from 'node:assert/strict';
import {prepareLearnerLookups} from '../public/learner-lookups.js';
import {carePolicy} from '../public/student-care.js';import {groupLearner} from '../public/group-learner.js';import {progressFor} from '../public/learner-progress.js';
test('request indexes preserve care policies, group representative order and progress without exposing internal Maps',()=>{
 const source={customers:[{id:'a'},{id:'b',learnerRegistration:{checkoutStage:'PAID'}}],connections:[{id:'ch',provider:'zalo_personal'}],conversations:[{id:'b-chat',connectionId:'ch',customerId:'b',externalUserId:'b'},{id:'a-chat',connectionId:'ch',customerId:'a',externalUserId:'a'},{id:'group',connectionId:'ch',threadType:1,group:{memberIds:['a','b'],ownId:'owner'}}],users:[{id:'owner',role:'owner',active:1}],orders:[],journeys:[],chatPlanSummaries:[],chat_reminders:[],plan_handoffs:[],studentCareSettings:{stages:{}}};
 const indexed=prepareLearnerLookups(structuredClone(source));assert.equal(JSON.stringify(indexed),JSON.stringify(source));
 for(let i=0;i<source.conversations.length;i++){const a=source.conversations[i],b=indexed.conversations[i];assert.deepEqual(groupLearner(indexed,b),groupLearner(source,a));assert.deepEqual(carePolicy(indexed,b),carePolicy(source,a));}
 for(const p of source.customers)assert.deepEqual(progressFor(indexed,p),progressFor(source,p));
 // Same-time ties and chosen member retain original conversation order, not membership-list order.
 assert.equal(groupLearner(indexed,indexed.conversations[2]).id,'b');indexed.conversations[2].learnerMemberId='a';assert.equal(groupLearner(indexed,indexed.conversations[2]).id,'a');
 const next=structuredClone(source);next.customers[0].learnerRegistration={checkoutStage:'PAID'};prepareLearnerLookups(next);assert.equal(progressFor(next,next.customers[0]).stage,'PAID');assert.equal(progressFor(indexed,indexed.customers[0]).stage,'NEW');
});
