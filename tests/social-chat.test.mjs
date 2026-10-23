import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync} from 'node:fs';import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'social-chat-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,all,get,saveSecret}=await import('../server/store.mjs');const {syncSocialChat,sendSocialChat}=await import('../server/social-chat.mjs');
test('Mastodon direct messages preserve privacy, deduplicate and exclude public or group content',async()=>{
 const c=put('connections',{id:'mastodon-test',provider:'mastodon',accountId:'self',mode:'api',status:'connected'});saveSecret(c.id,{token:'fake'});
 const status={id:'message-1',created_at:'2026-10-20T01:00:00Z',visibility:'direct',content:'<p>Hello</p>',account:{id:'peer'}};
 const request=async(url)=>url.includes('/conversations?')?[{id:'thread',accounts:[{id:'peer',acct:'peer@host'}],last_status:status},{id:'group',accounts:[{id:'a'},{id:'b'}]}]:{ancestors:[],descendants:[{...status,id:'public',visibility:'public'}]};
 await syncSocialChat(c,request);await syncSocialChat(c,request);const messages=all('messages');assert.equal(messages.length,1);assert.equal(messages[0].text,'Hello');const conv=get('conversations',messages[0].conversationId);assert.equal(conv.socialPeerHandle,'peer@host');assert.equal(get('social_chat_sync',c.id).skippedGroups,1);
 const receipt=await sendSocialChat(c,conv,'Reply',{},async(url,opts)=>{const body=JSON.parse(opts.body);assert.equal(body.visibility,'direct');assert.equal(body.status,'@peer@host Reply');return {id:'sent',visibility:'direct'};});assert.equal(receipt.id,'sent');
 await assert.rejects(sendSocialChat(c,conv,'Reply',{},async()=>({id:'bad',visibility:'public'})),/chế độ/);
});
test('Bluesky uses chat proxy and real thread, records failures without fabricated messages',async()=>{
 const c=put('connections',{id:'bsky-test',provider:'bluesky',accountId:'self',mode:'api',status:'connected'});saveSecret(c.id,{token:'fake',refreshToken:'refresh',expiresAt:Date.now()+999999});
 await syncSocialChat(c,async(url,opts)=>{assert.equal(opts.headers['atproto-proxy'],'did:web:api.bsky.chat#bsky_chat');if(url.includes('listConvos'))return {convos:[{id:'bsky-thread',members:[{did:'self'},{did:'peer',handle:'peer.bsky.social'}]}]};return {messages:[{id:'bsky-msg',text:'Test',sentAt:'2026-10-20T01:00:00Z',sender:{did:'peer'}}]};});
 const m=all('messages').find(m=>m.externalId==='bsky-msg');assert.ok(m);const conv=get('conversations',m.conversationId);assert.equal(conv.socialThreadId,'bsky-thread');
 await sendSocialChat(c,conv,'Reply',{},async(url,opts)=>{assert.equal(JSON.parse(opts.body).convoId,'bsky-thread');return {id:'sent'};});
 const count=all('messages').length;await assert.rejects(syncSocialChat(c,async()=>{throw Error('Bad token method');}));assert.equal(all('messages').length,count);assert.equal(get('social_chat_sync',c.id).status,'error');
});
test('Tumblr imports actual reply notifications and excludes likes',async()=>{
 const {syncSocialComments}=await import('../server/social-comment-sync.mjs');const c={id:'tumblr-test',provider:'tumblr',accountId:'test-blog'};saveSecret(c.id,{token:'fake'});const rows=[];
 await syncSocialComments(c,{startedAt:'2026-10-20T00:00:00Z'},async()=>({response:{notifications:[{id:'reply-id',type:'reply',target_post_id:'post',from_tumblelog_name:'customer',reply_text:'Hello',timestamp:1792454400},{id:'like-id',type:'like'}]}}),(...args)=>rows.push(args));assert.equal(rows.length,1);assert.equal(rows[0][1].id,'reply-id');assert.equal(rows[0][1].text,'Hello');
});
