import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'social-operations-'));
const {saveSecret,put,get,all}=await import('../server/store.mjs');
const {replySocial,blueskyInteraction,removeBlueskyLike}=await import('../server/social-replies.mjs');
const {syncSocialComments}=await import('../server/social-comment-sync.mjs');
const {syncComments,commentPollInterval,commentRetryDelay}=await import('../server/comments.mjs');
const {sendMessage,publish}=await import('../server/connectors.mjs');
const {checkSocialHealth,socialHealthRoute}=await import('../server/social-health.mjs');
const {socialCan}=await import('../public/social-capabilities.js');
const {socialHealthHTML}=await import('../public/social-health.js');
const bsky={id:'bsky',provider:'bluesky',accountId:'did:plc:self',expectedAccount:'self.bsky.social',mode:'api',status:'connected'};
const parent={uri:'at://did:plc:peer/app.bsky.feed.post/child',cid:'child-cid',record:{reply:{root:{uri:'at://did:plc:root/app.bsky.feed.post/root',cid:'root-cid'}}}};
saveSecret(bsky.id,{token:'access',refreshToken:'refresh',expiresAt:Date.now()+999999});
test('YouTube reply resolves child to top-level comment and requires provider acknowledgement',async()=>{
 const calls=[];const req=async(url,o)=>{calls.push({url,o});return o?.method==='POST'?{id:'reply'}:{items:[{id:'child',snippet:{parentId:'top'}}]};};
 const result=await replySocial({provider:'youtube'},{externalCommentId:'child'},'Reply',{},req,async()=> 'fresh');
 assert.equal(result.id,'reply');assert.deepEqual(JSON.parse(calls[1].o.body),{snippet:{parentId:'top',textOriginal:'Reply'}});assert.equal(calls[1].o.headers.Authorization,'Bearer fresh');
 await assert.rejects(replySocial({provider:'youtube'},{externalCommentId:'missing'},'Reply',{},async()=>({items:[]}),async()=> 'fresh'),/không còn tồn tại/);
});
test('X comment reply is sent as a reply, never as a standalone post',async()=>{
 const result=await replySocial({provider:'x'},{externalCommentId:'tweet'},'Reply',{},async(url,o)=>{assert.equal(url,'https://api.x.com/2/tweets');assert.deepEqual(JSON.parse(o.body),{text:'Reply',reply:{in_reply_to_tweet_id:'tweet'}});return {data:{id:'reply'}};},async()=> 'fresh');assert.equal(result.id,'reply');
});
test('Bluesky reply preserves original root and immediate parent',async()=>{
 const result=await replySocial(bsky,{externalCommentId:parent.uri},'Reply',{},async(url,o)=>{if(!o?.method)return {thread:{post:parent}};const body=JSON.parse(o.body);assert.deepEqual(body.record.reply,{root:parent.record.reply.root,parent:{uri:parent.uri,cid:parent.cid}});assert.equal(body.repo,bsky.accountId);return {uri:'at://did:plc:self/app.bsky.feed.post/reply'};});assert.ok(result.id.endsWith('/reply'));
});
test('Bluesky unliking validates ownership and uses recorded like URI',async()=>{
 let calls=0;await assert.rejects(removeBlueskyLike(bsky,'at://did:plc:other/app.bsky.feed.like/key',()=>{calls++;}),/thuộc tài khoản/);assert.equal(calls,0);
 await removeBlueskyLike(bsky,'at://did:plc:self/app.bsky.feed.like/key',async(url,o)=>{assert.ok(url.endsWith('deleteRecord'));assert.deepEqual(JSON.parse(o.body),{repo:'did:plc:self',collection:'app.bsky.feed.like',rkey:'key'});return {};});
});
test('Bluesky interactions require a strong reference and remote confirmation',async()=>{
 await assert.rejects(blueskyInteraction(bsky,parent.uri,'app.bsky.feed.repost',async(url,o)=>o?.method?{}:{thread:{post:parent}}),/chưa xác nhận/);
});
test('Mastodon reply preserves non-public visibility and refuses direct/private content',async()=>{
 const c={id:'masto',provider:'mastodon'};saveSecret(c.id,{token:'token'});
 await replySocial(c,{externalCommentId:'post'},'Hello',{},async(url,o)=>{if(!o?.method)return {id:'post',visibility:'unlisted',account:{acct:'peer@elsewhere.example'}};const body=JSON.parse(o.body);assert.equal(body.visibility,'unlisted');assert.equal(body.in_reply_to_id,'post');assert.equal(body.status,'@peer@elsewhere.example Hello');return {id:'reply'};});
 await assert.rejects(replySocial(c,{externalCommentId:'post'},'Hello',{},async()=>({id:'post',visibility:'direct'})),/công khai/);
});
test('comment ingestion handles Bluesky replies and repeated sync without duplicates',async()=>{
 const c=put('connections',bsky);let phase=0;
 const request=async url=>String(url).includes('getAuthorFeed')?{feed:[{post:{uri:'at://did:plc:self/app.bsky.feed.post/root',author:{did:c.accountId,handle:'self.bsky.social'},record:{text:'Original',createdAt:'2026-10-20T00:00:00Z'}}}]}:{thread:{post:{uri:'root'},replies:[{post:{uri:parent.uri,author:{did:'did:plc:peer',handle:'peer.bsky.social'},record:{text:'Hello',createdAt:'2026-10-20T01:00:00Z'},likeCount:1}}]}};
 await syncComments(c,request);const count=all('messages').length;await syncComments(c,request);assert.equal(all('messages').length,count);const m=all('messages').find(m=>m.externalId===parent.uri);assert.equal(m.text,'Hello');assert.equal(get('conversations',m.conversationId).postId,'at://did:plc:self/app.bsky.feed.post/root');
});
test('Mastodon public sync never ingests private/direct statuses',async()=>{
 const items=[];await syncSocialComments({provider:'mastodon',accountId:'self'},{startedAt:'2020-01-01'},async url=>url.includes('/context')?{descendants:[{id:'public-reply',visibility:'public',content:'<p>Hello &amp; goodbye</p>',created_at:'2026-10-20',account:{id:'peer'},in_reply_to_id:'post'},{id:'secret',visibility:'direct'}]}:[{id:'post',visibility:'public',content:'Original',created_at:'2026-10-20'}],(c,item)=>items.push(item));assert.equal(items.length,1);assert.equal(items[0].text,'Hello & goodbye');
});
test('unknown comment provider fails instead of reporting a successful no-op sync',async()=>{
 await assert.rejects(syncComments({id:'tumblr',provider:'tumblr'},()=>assert.fail()),/Chưa triển khai/);
});
test('Bluesky refuses private publication before any network request',async()=>{
 await assert.rejects(publish(bsky,{type:'text',caption:'Private',visibility:'private'}),/không hỗ trợ bài riêng tư/);
});
test('capability report distinguishes implemented features from live delivery proof',async()=>{
 assert.equal(socialCan('bluesky','chat'),false);assert.equal(socialCan('bluesky','reply'),true);assert.equal(socialCan('blogger','reply'),false);
 const report=await checkSocialHealth({...bsky,id:'health'},async url=>String(url).includes('createSession')?{did:'did:plc:self',handle:'self.bsky.social',accessJwt:'access',refreshJwt:'refresh'}:String(url).includes('getSession')?{did:'did:plc:self',handle:'self.bsky.social'}:{feed:[]});
 assert.equal(report.operations.publish.verification,'not_tested');assert.equal(report.operations.chat.verification,'unsupported');
 assert.ok(!socialHealthHTML({provider:'bluesky',health:{...report,checks:[{key:'comments',status:'error',message:'<script>alert(1)</script>'}]}}).includes('<script>'));
});
test('public sendMessage dispatch reaches new X/YouTube reply implementation',async()=>{
 const original=global.fetch;saveSecret('x-reply',{token:'token'});
 try{global.fetch=async(url,o)=>{assert.ok(String(url).endsWith('/2/tweets'));assert.equal(JSON.parse(o.body).reply.in_reply_to_tweet_id,'post');return Response.json({data:{id:'ack'}});};assert.equal((await sendMessage({id:'x-reply',provider:'x'},{kind:'comment',externalCommentId:'post'},'Reply')).id,'ack');}finally{global.fetch=original;}
});
test('quota-sensitive providers use slower polling and failures back off',()=>{
 assert.equal(commentPollInterval('youtube'),300000);assert.equal(commentPollInterval('x'),300000);assert.equal(commentPollInterval('facebook'),15000);
 assert.equal(commentRetryDelay(new Error('Credits depleted')),6*3600000);assert.equal(commentRetryDelay({message:'Too many requests',providerStatus:429}),15*60000);
});
test('read-only health catches valid X identity but exhausted timeline credits',async()=>{
 const c={id:'health-x',provider:'x',accountId:'id',status:'connected',mode:'api'};saveSecret(c.id,{token:'not-exposed'});
 const report=await checkSocialHealth(c,async(url,options)=>{assert.ok(!options?.method||options.method==='GET');if(String(url).includes('/tweets'))throw new Error('Credits depleted');return {data:{id:'id'}};});
 assert.equal(report.checks.find(c=>c.key==='profile').status,'ok');assert.equal(report.checks.find(c=>c.key==='comments').status,'error');assert.equal(report.operations.publish.verification,'not_tested');assert.ok(!JSON.stringify(report).includes('not-exposed'));
});
test('share rejects insufficient permissions and never retries an unknown result',async()=>{
 await assert.rejects(socialHealthRoute('/api/messages/no-id/share','POST',{}, {id:'viewer',role:'viewer'}),/không có quyền/);
 const c=put('connections',{...bsky,id:'share-channel'});saveSecret(c.id,{token:'access',refreshToken:'refresh',expiresAt:Date.now()+999999});const conv=put('conversations',{connectionId:c.id,kind:'comment'}),m=put('messages',{conversationId:conv.id,externalId:parent.uri,shareStatus:'unknown'});
 await assert.rejects(socialHealthRoute('/api/messages/'+m.id+'/share','POST',{}, {id:'owner',role:'owner'}),/kiểm tra bài gốc/);
});
