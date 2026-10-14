import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'comments-'));
const {all,get,put,saveSecret}=await import('../server/store.mjs');
const {upsertComment,ingestCommentEvents,syncComments,commentsStatus}=await import('../server/comments.mjs');
const c=put('connections',{id:'fb',provider:'facebook',accountId:'page',name:'Page',mode:'api',status:'connected'});saveSecret('fb',{token:'test'});
test('historical comments dedupe, include attachment-only content and preserve reply attribution',()=>{
 const item={id:'comment',message:'Hello',from:{id:'person',name:'Customer'},created_time:'2026-10-14T01:00:00Z'};
 const first=upsertComment(c,item,{id:'post',message:'Original',permalink_url:'https://facebook.com/post'});upsertComment(c,item,{id:'post'});
 assert.equal(all('conversations').length,1);assert.equal(all('messages').length,1);assert.equal(all('notifications').length,0);
 const reply=upsertComment(c,{id:'reply',message:'Reply',from:{id:'page'},parent:{id:'comment'},created_time:'2026-10-14T02:00:00Z'});assert.equal(reply.conversationId,first.conversationId);assert.equal(reply.direction,'outgoing');
 put('messages',{...reply,actor:'staff'});upsertComment(c,{id:'reply',message:'Edited reply',from:{id:'page'},parent:{id:'comment'}});assert.equal(get('messages',reply.id).actor,'staff');
 const image=upsertComment(c,{id:'image',from:{id:'other'},attachment:{media:{image:{src:'https://example.com/a.jpg'}}}});assert.equal(image.attachments.length,1);
});
test('webhook edits/removals update original records without replaying removed comments',()=>{
 const event=(verb,message)=>[{id:'page',time:200,changes:[{field:'feed',value:{item:'comment',verb,comment_id:'live',post_id:'post',from:{id:'live-person',name:'Live'},message,created_time:100}}]}];
 ingestCommentEvents(c,event('add','Hi'));ingestCommentEvents(c,event('add','Hi'));const row=all('messages').find(m=>m.externalId==='live');assert.equal(all('messages').filter(m=>m.externalId==='live').length,1);
 ingestCommentEvents(c,event('edited','Changed'));assert.equal(get('messages',row.id).text,'Changed');ingestCommentEvents(c,event('remove'));assert.ok(get('messages',row.id).deletedAt);upsertComment(c,{id:'live',message:'Old data',from:{id:'live-person'}});assert.ok(get('messages',row.id).deletedAt);
});
test('sync resumes comment pagination and records API errors without claiming success',async()=>{
 let pages=[];const request=async url=>{const u=new URL(url);pages.push(u);if(u.pathname.endsWith('/feed'))return {data:[{id:'history-post',message:'Post'}]};if(!u.searchParams.has('after'))return {data:[{id:'hist1',message:'one',from:{id:'h1'}}],paging:{next:'https://graph.facebook.com/next',cursors:{after:'next-page'}}};return {data:[{id:'hist2',message:'two',from:{id:'h2'}}]};};
 await syncComments(c,request);assert.equal(get('comment_sync','fb').queue.length,1);await syncComments(c,request);assert.ok(pages.some(p=>p.searchParams.get('after')==='next-page'));assert.ok(get('comment_sync','fb').completedAt);
 await syncComments(c,async()=>{throw Error('Permission denied');});assert.equal(get('comment_sync','fb').status,'error');assert.match(get('comment_sync','fb').error,/Permission/);
});
test('Threads incoming replies remain separate from Facebook identities and own replies attach correctly',()=>{
 const t=put('connections',{id:'threads',provider:'threads',accountId:'me',status:'connected',mode:'api'});const m=upsertComment(t,{id:'thread-comment',text:'Thread reply',username:'Customer',timestamp:'2026-10-14T01:00:00Z'},{id:'thread-post'});
 const r=upsertComment(t,{id:'own-thread-reply',text:'Response',is_reply_owned_by_me:true,replied_to:{id:'thread-comment'}});assert.equal(r.conversationId,m.conversationId);
 const status=commentsStatus({id:'owner',role:'owner'});assert.equal(status.filter(c=>c.supported).length,2);
});

test('Threads reply publishes against the selected original comment and returns a receipt',async()=>{
 const {sendMessage}=await import('../server/connectors.mjs');saveSecret('threads',{token:'test'});const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify({id:calls.length===1?'container':'published-reply'}),{status:200});};
 try{const r=await sendMessage(get('connections','threads'),{kind:'comment',externalCommentId:'target'},'Response');assert.equal(r.id,'published-reply');assert.equal(calls[0].body.reply_to_id,'target');assert.equal(calls[1].body.creation_id,'container');assert.equal(calls.length,2);await assert.rejects(sendMessage(get('connections','threads'),{kind:'comment',externalCommentId:'target'},'a'.repeat(501)),/500/);}finally{globalThis.fetch=previous;}
});
test('channel diagnostics exclude channels unavailable to a staff account',()=>{assert.equal(commentsStatus({id:'unassigned',role:'support'}).length,0);});

test('failed or unconfirmed moderation never changes local liked/deleted state',async()=>{
 const {reactMessage,deleteCommentMessage}=await import('../server/domain.mjs');const m=upsertComment(c,{id:'moderate',message:'Keep me',from:{id:'moderator-test'}});const previous=globalThis.fetch;let success=false;
 globalThis.fetch=async()=>new Response(JSON.stringify({success}),{status:200});
 try{const owner={id:'owner',role:'owner'};await assert.rejects(reactMessage(owner,m.id,{like:true}),/chưa xác nhận/);assert.equal(get('messages',m.id).liked,undefined);await assert.rejects(deleteCommentMessage(owner,m.id),/chưa xác nhận/);assert.equal(get('messages',m.id).deletedAt,undefined);success=true;await reactMessage(owner,m.id,{like:true});assert.equal(get('messages',m.id).liked,true);await deleteCommentMessage(owner,m.id);assert.ok(get('messages',m.id).deletedAt);assert.equal(get('conversations',m.conversationId).remoteDeleted,true);}finally{globalThis.fetch=previous;}
});

test('detail context loads post metrics and parent; replies can target parent or selected comment',async()=>{
 const {commentContext,commentReplyTarget}=await import('../server/comment-context.mjs');const {reply}=await import('../server/domain.mjs');
 const m=upsertComment(c,{id:'child-context',message:'Child',parent:{id:'parent-context'},from:{id:'child-person'},created_time:'2026-10-14T03:00:00Z'},{id:'context-post',message:'Post text'}),conv=get('conversations',m.conversationId),owner={id:'owner',role:'owner'};
 const data=await commentContext(owner,conv.id,async url=>{const id=new URL(url).pathname.split('/').pop();if(id==='context-post')return {id,message:'Original post',created_time:'2026-10-14T01:00:00Z',permalink_url:'https://facebook.com/post',likes:{summary:{total_count:9}},comments:{summary:{total_count:5}},shares:{count:2}};if(id==='child-context')return {id,message:'Child',parent:{id:'parent-context'},from:{name:'Child author'},like_count:1};return {id:'parent-context',message:'Parent text',from:{name:'Parent author'},created_time:'2026-10-14T02:00:00Z',like_count:7};});
 assert.equal(data.post.likes,9);assert.equal(data.post.comments,5);assert.equal(data.post.shares,2);assert.equal(data.parent.name,'Parent author');assert.equal(data.parent.likes,7);assert.equal(data.parent.dislikes,null);
 assert.equal(await commentReplyTarget(owner,conv,'parent'),'parent-context');await assert.rejects(commentReplyTarget(owner,conv,'arbitrary-id'),/không hợp lệ/);await assert.rejects(commentContext({id:'staff',role:'support'},conv.id),/phân công/);
 const previous=globalThis.fetch,calls=[];globalThis.fetch=async(url,opts)=>{calls.push(url);return new Response(JSON.stringify({id:'sent-context-'+calls.length}),{status:200});};
 try{const parentReply=await reply(owner,conv.id,{text:'Reply parent',replyTarget:'parent',version:get('conversations',conv.id).version});assert.equal(parentReply.replyToExternalId,'parent-context');assert.ok(calls[0].includes('/parent-context/comments'));await reply(owner,conv.id,{text:'Reply child',replyTarget:'current',version:get('conversations',conv.id).version});assert.ok(calls[1].includes('/child-context/comments'));}finally{globalThis.fetch=previous;}
});
test('missing metrics render as unavailable and context HTML escapes social content',async()=>{
 const {commentContextHTML}=await import('../public/comment-detail.js');const html=commentContextHTML({post:{text:'<script>bad</script>',likes:null,shares:null,comments:0},parentId:'p',parent:{id:'p',text:'Parent',name:'Name',likes:2,dislikes:null}},'parent');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Trả lời bình luận gốc'));assert.ok(html.includes('—'));assert.ok(html.includes('data-target="current"'));
});
