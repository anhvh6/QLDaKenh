import test from 'node:test';
import assert from 'node:assert/strict';
import {topicGroups} from '../public/chat-topic-model.js';
import {sendQuickReply} from '../public/quick-replies.js';
test('used topics move last only in their conversation, retaining configured order and reply numbers',()=>{
 const S={quick_reply_topics:[{id:'b',sortOrder:2},{id:'a',sortOrder:1}],templates:[{id:'t',topicId:'a',sortOrder:34,quickReplyIndex:33},{id:'u',topicId:'b',sortOrder:4},{id:'v',topicId:'missing',sortOrder:5}],template_runs:[{conversationId:'c',templateId:'t',status:'done'}]};
 assert.deepEqual(topicGroups(S,'c').map(t=>t.id),['b','','a']);
 assert.deepEqual(topicGroups(S,'other').map(t=>t.id),['a','b','']);
 assert.equal(topicGroups(S,'c').at(-1).rows[0].number,33);
 S.template_runs=[{conversationId:'c',templateId:'u',topicId:'a',status:'failed',nextIndex:1}];
 assert.equal(topicGroups(S,'c').at(-1).id,'a');
 S.template_runs[0].nextIndex=0;
 assert.equal(topicGroups(S,'c')[0].id,'a');
});
test('direct send blocks concurrent clicks and resumes only unsent blocks after a clear failure',async()=>{
 let release,calls=[];const host={state:{user:{id:'qa'},template_runs:[]},api:async(path,input)=>{calls.push(input);return await new Promise(r=>release=r);}},c={id:'c'},t={id:'t'};
 const first=sendQuickReply(host,c,t);
 await assert.rejects(sendQuickReply(host,c,t),/Đang gửi/);
 release({id:'run',status:'failed',nextIndex:1});await first;
 const retry=sendQuickReply(host,c,t);assert.deepEqual(calls[1].body,{runId:'run'});release({status:'done'});await retry;
});
test('ambiguous sends cannot be resent by clicking again',async()=>{
 let calls=0;const host={state:{user:{id:'unknown-qa'},template_runs:[]},api:async()=>{calls++;return {status:'unknown'};}};
 await sendQuickReply(host,{id:'c'},{id:'t'});
 await assert.rejects(sendQuickReply(host,{id:'c'},{id:'t'}),/Chưa rõ/);assert.equal(calls,1);
});
test('after reload a partial failure resumes the existing sequence',async()=>{
 let body;const host={state:{user:{id:'reload-qa'},template_runs:[{id:'partial',conversationId:'c',templateId:'t',status:'failed',nextIndex:1,updatedAt:'2026-10-11'}]},api:async(path,input)=>{body=input.body;return {status:'done'};}};
 await sendQuickReply(host,{id:'c'},{id:'t'});assert.deepEqual(body,{runId:'partial'});
});
test('a lost response reuses the original request identity rather than sending a new sequence',async()=>{
 const requests=[];const host={state:{user:{id:'network-qa'},template_runs:[]},api:async(path,input)=>{requests.push(input.body);if(requests.length===1)throw Error('Network');return {status:'done'};}};
 await assert.rejects(sendQuickReply(host,{id:'c'},{id:'t'}),/Network/);
 await sendQuickReply(host,{id:'c'},{id:'t'});assert.deepEqual(requests[1],requests[0]);
});
