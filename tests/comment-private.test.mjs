import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'comment-private-'));
const {put,get,all}=await import('../server/store.mjs');
const {openCommentPrivateChat,sendCommentPrivateReply}=await import('../server/comment-private.mjs');
const {ingestFacebookEvents}=await import('../server/facebook-chat.mjs');
const owner={id:'owner',role:'owner'},time=Date.parse('2026-10-19T10:00:00Z');
for(const provider of ['facebook','instagram'])test(provider+' opens a private draft without sending, reuses it and guards private reply delivery',async()=>{
 const channel=put('connections',{id:provider,provider,accountId:provider+'-page',status:'connected',mode:'api'}),customer=put('customers',{name:'Commenter'}),source=put('conversations',{id:provider+'-source',connectionId:channel.id,customerId:customer.id,kind:'comment',externalCommentId:provider+'-comment',externalUserId:provider+'-comment',lastAt:'2026-10-18T10:00:00Z'});
 put('messages',{conversationId:source.id,externalId:source.externalCommentId,direction:'incoming',text:'Comment',createdAt:'2026-10-18T10:00:00Z'});
 const before=all('messages').length,draft=openCommentPrivateChat(owner,source.id);assert.equal(all('messages').length,before);assert.equal(openCommentPrivateChat(owner,source.id).id,draft.id);assert.equal(draft.connectionId,source.connectionId);assert.equal(draft.customerId,source.customerId);
 let call;const send=async(url,options)=>{call={url,body:JSON.parse(options.body)};return {message_id:provider+'-receipt',recipient_id:'peer-'+provider};};
 const result=await sendCommentPrivateReply(channel,draft,'Hello',{},send,'secret',time);assert.equal(result.privateReply,true);
 assert.ok(call.url.endsWith('/'+provider+'-page/messages'));assert.deepEqual(call.body,{recipient:{comment_id:source.externalCommentId},message:{text:'Hello'}});
 await assert.rejects(()=>sendCommentPrivateReply(channel,{...draft,privateReplyCommentAt:'2026-09-01'},'Late',{},send,'secret',time),/7 ngày/);
 await assert.rejects(()=>sendCommentPrivateReply(channel,draft,'Media',{assetRefs:[{}]},send,'secret',time),/văn bản/);
 await assert.rejects(()=>sendCommentPrivateReply(channel,draft,'Unknown',{},async()=>({}),'secret',time),{unknown:true});
 put('messages',{conversationId:draft.id,direction:'outgoing',status:'unknown',text:'Uncertain'});
 await assert.rejects(()=>sendCommentPrivateReply(channel,draft,'Again',{},send,'secret',time),/chờ khách/);
});
test('Instagram replies and Facebook receipts reconcile the private draft without opening another customer',()=>{
 const channel=get('connections','instagram'),source=get('conversations','instagram-source'),draft=openCommentPrivateChat(owner,source.id);
 put('messages',{conversationId:draft.id,externalId:'ig-dm-receipt',direction:'outgoing',status:'accepted',text:'Hi'});
 ingestFacebookEvents(channel,[{id:channel.accountId,messaging:[{sender:{id:channel.accountId},recipient:{id:'real-ig-peer'},message:{mid:'ig-dm-receipt',text:'Hi',is_echo:true},timestamp:time}]}]);
 assert.equal(get('conversations',draft.id).externalUserId,'real-ig-peer');
 ingestFacebookEvents(channel,[{id:channel.accountId,messaging:[{sender:{id:'real-ig-peer'},recipient:{id:channel.accountId},message:{mid:'incoming-reply',text:'Thanks'},timestamp:time+1000}]}]);
 assert.equal(all('messages').find(m=>m.externalId==='incoming-reply').conversationId,draft.id);assert.ok(get('conversations',draft.id).lastInboundAt);
});
test('unsupported and deleted comment sources cannot create private chats',()=>{
 const channel=put('connections',{id:'youtube-private',provider:'youtube',status:'connected'}),c=put('conversations',{kind:'comment',connectionId:channel.id});assert.throws(()=>openCommentPrivateChat(owner,c.id),/chưa hỗ trợ/);assert.throws(()=>openCommentPrivateChat(owner,'missing'),/Không tìm/);
});
