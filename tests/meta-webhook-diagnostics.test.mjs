import test from 'node:test';
import assert from 'node:assert/strict';
import {describeMetaWebhook,channelWebhookSummary} from '../server/meta-webhook-diagnostics.mjs';

test('webhook metadata distinguishes Instagram standby from active messages without storing content',()=>{
 const result=describeMetaWebhook({object:'instagram',entry:[{id:'ig-1',standby:[{sender:{id:'customer'},recipient:{id:'ig-1'},message:{mid:'m',text:'private content',attachments:[{url:'private-url'}]}}]}]});
 assert.equal(result.entries[0].standbyMessages,1);assert.equal(result.entries[0].messageEvents,0);
 assert.doesNotMatch(JSON.stringify(result),/private content|private-url/);
 assert.equal(channelWebhookSummary({accountId:'ig-1'},result).standbyMessages,1);
 assert.equal(channelWebhookSummary({accountId:'other-page'},result),null);
});

test('only the actual recipient channel gets an active-message diagnostic',()=>{
 const result=describeMetaWebhook({object:'page',entry:[{id:'page-1',messaging:[{sender:{id:'customer'},recipient:{id:'page-1'},message:{mid:'m'}}],changes:[{field:'feed',value:{message:'secret'}}]}]});
 assert.deepEqual(channelWebhookSummary({accountId:'page-1'},result),{eventCount:2,messageEvents:1,standbyMessages:0,fields:['feed']});
 assert.equal(channelWebhookSummary({accountId:'ig-1'},result),null);
 assert.doesNotMatch(JSON.stringify(result),/secret/);
});
