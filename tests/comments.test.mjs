import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'comments-'));
const {all,get,put,saveSecret,db}=await import('../server/store.mjs');
const {upsertComment,ingestCommentEvents,syncComments,commentsStatus}=await import('../server/comments.mjs');
const c=put('connections',{id:'fb',provider:'facebook',accountId:'page',name:'Page',mode:'api',status:'connected'});saveSecret('fb',{token:'test'});
test('comment lookup isolates channels, reconciles receipt IDs and avoids parsing unrelated chat history',()=>{
 const other=put('connections',{id:'other-page',provider:'facebook',accountId:'other',mode:'api'});
 const a=upsertComment(c,{id:'shared-id',message:'A',from:{id:'a'}}),b=upsertComment(other,{id:'shared-id',message:'B',from:{id:'b'}});
 assert.notEqual(a.conversationId,b.conversationId);
 const receipt=put('messages',{conversationId:a.conversationId,direction:'outgoing',status:'accepted',text:'Sent',actor:'staff',externalMessages:[{id:'receipt-id'}]});
 assert.equal(upsertComment(c,{id:'receipt-id',message:'Sent',from:{id:'page'},parent:{id:'shared-id'}}).id,receipt.id);
 const pending=put('messages',{conversationId:a.conversationId,direction:'outgoing',status:'sending',text:'Pending',replyToExternalId:'shared-id',actor:'staff'});
 assert.equal(upsertComment(c,{id:'pending-receipt',message:'Pending',from:{id:'page'},parent:{id:'shared-id'}}).id,pending.id);
 const insert=db.prepare('INSERT INTO records(kind,id,data,version,updated_at) VALUES(?,?,?,?,?)');
 db.exec('BEGIN');try{for(let i=0;i<10000;i++)insert.run('messages','bulk-'+i,JSON.stringify({conversationId:'unrelated',text:'unrelated-history-marker '+i}),1,'2026-10-18');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 const prepare=db.prepare;db.prepare=function(sql){const stmt=prepare.call(this,sql);if(sql.startsWith('SELECT m.id')){const read=stmt.get;stmt.get=function(...args){const plan=prepare.call(db,'EXPLAIN QUERY PLAN '+sql).all(...args);assert.ok(plan.some(r=>r.detail.startsWith('SEARCH m USING INDEX')),JSON.stringify(plan));return read.apply(this,args);};}return stmt;};
 const parse=JSON.parse;let unrelated=0;JSON.parse=function(value,...args){if(String(value).includes('unrelated-history-marker'))unrelated++;return parse(value,...args);};
 try{upsertComment(c,{id:'shared-id',message:'Changed',from:{id:'a'}});upsertComment(c,{id:'new-indexed-comment',message:'New',from:{id:'new-person'}});}finally{JSON.parse=parse;db.prepare=prepare;db.prepare("DELETE FROM records WHERE kind='messages' AND id LIKE 'bulk-%'").run();}
 assert.equal(unrelated,0);assert.equal(get('messages',a.id).text,'Changed');assert.equal(get('messages',b.id).text,'B');
 for(const id of [a.conversationId,b.conversationId,get('messages',pending.id)?.conversationId]){if(id){db.prepare("DELETE FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=?").run(id);db.prepare("DELETE FROM records WHERE kind='conversations' AND id=?").run(id);}}
 const fresh=get('messages',db.prepare("SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.externalId')='new-indexed-comment'").get()?.id);if(fresh){db.prepare("DELETE FROM records WHERE kind='messages' AND id=?").run(fresh.id);db.prepare("DELETE FROM records WHERE kind='conversations' AND id=?").run(fresh.conversationId);}
 db.prepare("DELETE FROM records WHERE kind='connections' AND id='other-page'").run();
});
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
test('Threads sync reads the replies edge instead of the post conversation edge',async()=>{
 const channel=put('connections',{id:'threads-sync',provider:'threads',accountId:'threads-user',status:'connected',mode:'api'});saveSecret(channel.id,{token:'test'});const calls=[];
 const request=async url=>{calls.push(url);if(url.includes('/threads-user/threads?'))return {data:[{id:'threads-post',text:'Post',timestamp:'2026-10-14T01:00:00Z',permalink:'https://www.threads.net/post'}]};if(url.includes('/threads-post/replies?'))return {data:[{id:'threads-reply',text:'Reply',username:'viewer',timestamp:'2026-10-14T02:00:00Z',replied_to:{id:'threads-post'}}]};throw Error('Unexpected Threads URL: '+url);};
 const state=await syncComments(channel,request);assert.equal(state.status,'ready');assert.ok(calls.some(url=>url.includes('/threads-post/replies?')));assert.ok(!calls.some(url=>url.includes('/threads-post/conversation?')));assert.ok(all('messages').some(m=>m.externalId==='threads-reply'));
});
test('Threads keeps a standalone reply owned by the connected account visible',()=>{
 const channel=put('connections',{id:'threads-own',provider:'threads',accountId:'threads-owner',name:'Owner',status:'connected',mode:'api'});
 const message=upsertComment(channel,{id:'own-visible',text:'My visible reply',username:'owner-name',timestamp:'2026-10-14T03:00:00Z',is_reply_owned_by_me:true,replied_to:{id:'own-post'}},{id:'own-post',text:'Post'});
 assert.ok(message);assert.equal(message.direction,'outgoing');assert.equal(get('conversations',message.conversationId).externalCommentId,'own-visible');
});

test('Instagram polls comments and accepts live comment webhook payloads',async()=>{
 const channel=put('connections',{id:'instagram-comments',provider:'instagram',accountId:'ig-user',name:'Instagram',apiVersion:'v25.0',mode:'api',status:'connected'});saveSecret(channel.id,{token:'page-token'});const calls=[];
 const request=async url=>{calls.push(url);if(url.includes('/ig-user/media?'))return {data:[{id:'ig-post',caption:'Post',timestamp:'2026-10-14T01:00:00Z',permalink:'https://www.instagram.com/p/post'}]};return {data:[{id:'ig-comment',text:'Hello',timestamp:'2026-10-14T02:00:00Z',username:'reader',from:{id:'reader-id',username:'reader'}}]};};
 const state=await syncComments(channel,request);assert.equal(state.status,'ready');assert.ok(calls.every(url=>url.startsWith('https://graph.facebook.com/v25.0/')));assert.ok(all('messages').some(m=>m.externalId==='ig-comment'));
 ingestCommentEvents(channel,[{id:'ig-user',time:200,changes:[{field:'comments',value:{id:'ig-live-comment',text:'Live hello',from:{id:'live-reader',username:'live_reader'},media:{id:'ig-post'}}}]}]);
 const live=all('messages').find(m=>m.externalId==='ig-live-comment');assert.equal(live.text,'Live hello');assert.equal(get('customers',get('conversations',live.conversationId).customerId).name,'live_reader');
});

test('Instagram replies to and deletes the selected comment through Facebook Graph',async()=>{
 const {sendMessage,deleteComment}=await import('../server/connectors.mjs');const channel=get('connections','instagram-comments'),previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return options.method==='DELETE'?Response.json({success:true}):Response.json({id:'ig-reply'});};
 try{const result=await sendMessage(channel,{kind:'comment',externalCommentId:'ig-comment'},'Cảm ơn bạn');assert.equal(result.id,'ig-reply');assert.equal(calls[0].url,'https://graph.facebook.com/v25.0/ig-comment/replies');assert.deepEqual(JSON.parse(calls[0].options.body),{message:'Cảm ơn bạn'});await deleteComment(channel,'ig-comment');assert.equal(calls[1].url,'https://graph.facebook.com/v25.0/ig-comment');assert.equal(calls[1].options.method,'DELETE');}finally{globalThis.fetch=previous;}
});

test('DEV.to comments are imported with author, post context and nested reply identity',async()=>{
 const channel=put('connections',{id:'dev-comments',provider:'devto',accountId:'author',name:'DEV.to',mode:'api',status:'connected'});saveSecret(channel.id,{token:'dev-key'});
 const request=async url=>url.includes('/articles/me')?[{id:11,title:'Article',url:'https://dev.to/a/article',published_at:'2026-10-14T01:00:00Z'}]:[{id_code:'dev-root',body_html:'<p>Hello</p>',created_at:'2026-10-14T02:00:00Z',user:{user_id:7,name:'Reader',username:'reader',profile_image_90:'https://example.com/a.png'},children:[{id_code:'dev-child',body_html:'<p>Nested</p>',created_at:'2026-10-14T03:00:00Z',user:{user_id:8,name:'Second reader',username:'second'},children:[]}]}];
 const state=await syncComments(channel,request);assert.equal(state.status,'ready');assert.ok(state.completedAt);const root=all('messages').find(m=>m.externalId==='dev-root'),child=all('messages').find(m=>m.externalId==='dev-child');assert.equal(root.text,'Hello');assert.equal(child.parentCommentId,'dev-root');assert.equal(get('customers',get('conversations',root.conversationId).customerId).name,'Reader');
});

test('YouTube comments use the uploads playlist and preserve video context',async()=>{
 const channel=put('connections',{id:'yt-comments',provider:'youtube',accountId:'youtube-channel',name:'YouTube',mode:'api',status:'connected'});saveSecret(channel.id,{token:'youtube-token'});
 const request=async url=>{if(url.includes('/channels?'))return {items:[{contentDetails:{relatedPlaylists:{uploads:'uploads-id'}}}]};if(url.includes('/playlistItems?'))return {items:[{contentDetails:{videoId:'video-id'},snippet:{title:'Video title',publishedAt:'2026-10-14T01:00:00Z'}}]};return {items:[{id:'thread-id',snippet:{topLevelComment:{id:'youtube-comment',snippet:{textDisplay:'Great video',publishedAt:'2026-10-14T02:00:00Z',authorDisplayName:'Viewer',authorChannelId:{value:'viewer-id'},authorProfileImageUrl:'https://example.com/viewer.png',likeCount:3}}}}]};};
 const state=await syncComments(channel,request);assert.equal(state.status,'ready');const message=all('messages').find(m=>m.externalId==='youtube-comment'),conversation=get('conversations',message.conversationId);assert.equal(conversation.postId,'video-id');assert.equal(conversation.postTitle,'Video title');assert.match(conversation.postUrl,/youtube\.com/);
});
test('YouTube skips unavailable videos and continues syncing the channel',async()=>{
 const channel=put('connections',{id:'yt-missing-video',provider:'youtube',accountId:'youtube-channel',name:'YouTube',mode:'api',status:'connected'});saveSecret(channel.id,{token:'youtube-token'});let comments=0;
 const request=async url=>{if(url.includes('/channels?'))return {items:[{contentDetails:{relatedPlaylists:{uploads:'uploads-id'}}}]};if(url.includes('/playlistItems?'))return {items:[{contentDetails:{videoId:'missing-video'}},{contentDetails:{videoId:'live-video'}}]};comments++;if(url.includes('missing-video'))throw Object.assign(Error('The video identified by the videoId parameter could not be found.'),{providerStatus:404});return {items:[]};};
 const state=await syncComments(channel,request);assert.equal(state.status,'ready');assert.equal(comments,2);
});

test('Threads reply publishes against the selected original comment and returns a receipt',async()=>{
 const {sendMessage}=await import('../server/connectors.mjs');saveSecret('threads',{token:'test'});const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify({id:calls.length===1?'container':'published-reply'}),{status:200});};
 try{const r=await sendMessage(get('connections','threads'),{kind:'comment',externalCommentId:'target'},'Response');assert.equal(r.id,'published-reply');assert.equal(calls[0].body.reply_to_id,'target');assert.equal(calls[1].body.creation_id,'container');assert.equal(calls.length,2);await assert.rejects(sendMessage(get('connections','threads'),{kind:'comment',externalCommentId:'target'},'a'.repeat(501)),/500/);}finally{globalThis.fetch=previous;}
});
test('DEV.to reply fails locally with an actionable read-only API message',async()=>{
 const {sendMessage}=await import('../server/connectors.mjs');const channel=put('connections',{id:'dev-reply',provider:'devto',mode:'api',status:'connected'});saveSecret(channel.id,{token:'dev-key'});const previous=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;throw Error('must not call');};
 try{await assert.rejects(sendMessage(channel,{kind:'comment',externalCommentId:'parent-code'},'Thanks'),/chỉ cung cấp API đọc bình luận/);assert.equal(called,false);}finally{globalThis.fetch=previous;}
});
test('Blogger reply fails locally because its comment API has no insert method',async()=>{
 const {sendMessage}=await import('../server/connectors.mjs');const channel=put('connections',{id:'blogger-reply',provider:'blogger',mode:'api',status:'connected'});saveSecret(channel.id,{token:'google-token'});const previous=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;throw Error('must not call');};
 try{await assert.rejects(sendMessage(channel,{kind:'comment',externalCommentId:'comment-id'},'Thanks'),/không hỗ trợ tạo trả lời/);assert.equal(called,false);}finally{globalThis.fetch=previous;}
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
test('Facebook context keeps local data and hides raw Graph traces when read permission is missing',async()=>{
 const owner={id:'owner',role:'owner'};
 const channel=put('connections',{id:'facebook-context-permission',provider:'facebook',accountId:'page-context',name:'Facebook',mode:'api',status:'connected'});saveSecret(channel.id,{token:'page-token'});
 const customer=put('customers',{name:'Viewer'}),conv=put('conversations',{customerId:customer.id,connectionId:channel.id,externalCommentId:'post_comment',postId:'page_post',postTitle:'Local post',kind:'comment',mode:'api',status:'open'});put('messages',{conversationId:conv.id,externalId:'post_comment',direction:'incoming',senderName:'Viewer',text:'Local comment',createdAt:'2026-10-14T01:00:00Z'});
 const {commentContext}=await import('../server/comment-context.mjs'),data=await commentContext(owner,conv.id,async()=>{throw Error("Unsupported get request. This endpoint requires the 'pages_read_engagement' permission · code 100 · subcode 33 · trace secret-trace");});
 assert.equal(data.post.text,'Local post');assert.equal(data.current.text,'Local comment');assert.ok(data.errors.every(x=>x.includes('kết nối lại Facebook Page')));assert.ok(data.errors.every(x=>!x.includes('secret-trace')));
});
test('Blogger context uses synchronized local data without calling Meta Graph',async()=>{
 const owner={id:'owner',role:'owner'},channel=put('connections',{id:'blogger-context',provider:'blogger',accountId:'blog-id',name:'Blogger',mode:'api',status:'connected'});saveSecret(channel.id,{token:'google-token'});
 const customer=put('customers',{name:'Blog reader'}),conv=put('conversations',{customerId:customer.id,connectionId:channel.id,externalCommentId:'blog-comment',postId:'blog-post',postTitle:'Blog title',postUrl:'https://example.blogspot.com/post',kind:'comment',mode:'api',status:'open'});put('messages',{conversationId:conv.id,externalId:'blog-comment',direction:'incoming',senderName:'Blog reader',text:'Blog comment',createdAt:'2026-10-14T01:00:00Z'});
 put('comment_context',{id:conv.id,conversationId:conv.id,post:{text:'stale'},current:{text:'stale'},errors:['Expected 1 dot · code 190 · trace old'],loadedAt:new Date().toISOString()});
 const {commentContext}=await import('../server/comment-context.mjs');let called=false,data=await commentContext(owner,conv.id,async()=>{called=true;throw Error('must not call Meta');});
 assert.equal(called,false);assert.equal(data.post.text,'Blog title');assert.equal(data.current.text,'Blog comment');assert.deepEqual(data.errors,[]);
});
test('Threads context uses synchronized data instead of unsupported object lookups',async()=>{
 const owner={id:'owner',role:'owner'},channel=put('connections',{id:'threads-context-local',provider:'threads',accountId:'threads-user',name:'Threads',mode:'api',status:'connected'});saveSecret(channel.id,{token:'threads-token'});
 const customer=put('customers',{name:'Threads reader'}),conv=put('conversations',{customerId:customer.id,connectionId:channel.id,externalCommentId:'threads-reply',postId:'threads-post',postTitle:'Thread text',kind:'comment',mode:'api',status:'open'});put('messages',{conversationId:conv.id,externalId:'threads-reply',direction:'incoming',senderName:'Threads reader',text:'Threads reply',createdAt:'2026-10-14T01:00:00Z'});
 put('comment_context',{id:conv.id,conversationId:conv.id,errors:['Unsupported get request'],loadedAt:new Date().toISOString()});
 const {commentContext}=await import('../server/comment-context.mjs');let called=false,data=await commentContext(owner,conv.id,async()=>{called=true;throw Error('must not call object endpoint');});
 assert.equal(called,false);assert.equal(data.post.text,'Thread text');assert.equal(data.current.text,'Threads reply');assert.deepEqual(data.errors,[]);
});
test('missing metrics render as unavailable and context HTML escapes social content',async()=>{
 const {commentContextHTML}=await import('../public/comment-detail.js');const html=commentContextHTML({post:{text:'<script>bad</script>',likes:null,shares:null,comments:0},parentId:'p',parent:{id:'p',text:'Parent',name:'Name',likes:2,dislikes:null}},'parent');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Trả lời bình luận gốc'));assert.ok(html.includes('—'));assert.ok(html.includes('data-target="current"'));
});

test('existing comment refresh never parses unrelated comment conversations',()=>{
 const message=upsertComment(c,{id:'target-perf',message:'Target',from:{id:'target-perf'}});
 for(let i=0;i<100;i++)put('conversations',{id:'unrelated-comment-'+i,kind:'comment',connectionId:c.id,externalCommentId:'unrelated-'+i,postTitle:'unrelated-comment-marker'});
 const parse=JSON.parse;let reads=0;JSON.parse=function(value,...rest){if(String(value).includes('unrelated-comment-marker'))reads++;return parse(value,...rest);};
 try{assert.equal(upsertComment(c,{id:'target-perf',message:'Updated target',from:{id:'target-perf'}}).id,message.id);}finally{JSON.parse=parse;}
 assert.equal(reads,0);db.prepare("DELETE FROM records WHERE kind='conversations' AND id LIKE 'unrelated-comment-%'").run();
});
