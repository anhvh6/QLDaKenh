import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'facebook-chat-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,all,saveSecret,dataDir}=await import('../server/store.mjs');
const {ingestFacebookMessage,ingestFacebookEvents,syncFacebookChat,facebookChatTick}=await import('../server/facebook-chat.mjs');
const {chatRoute}=await import('../server/chat.mjs');
const {defaultFilters,filterThreads}=await import('../public/inbox-model.js');
const ch=put('connections',{id:'page',provider:'facebook',mode:'api',status:'connected',accountId:'page-id'});
const item=(id,date,message='Xin chào')=>({id,created_time:date,message,from:{id:'person',name:'Khách'},to:{data:[{id:'page-id'}]}});

test('a slow Facebook channel does not delay Instagram polling',async()=>{
 const slow=put('connections',{id:'slow-page',provider:'facebook',mode:'api',status:'connected',accountId:'slow-page'});
 const ig=put('connections',{id:'fast-ig',provider:'instagram',mode:'api',status:'connected',accountId:'fast-ig'});
 let release,igCalled=false;
 const gate=new Promise(resolve=>{release=resolve;});
 const ticking=facebookChatTick(async url=>{
  if(url.includes('/slow-page/'))await gate;
  if(url.includes('/fast-ig/'))igCalled=true;
  return {data:[]};
 });
 try{await new Promise(resolve=>setImmediate(resolve));assert.equal(igCalled,true);}
 finally{release();await ticking;put('connections',{...slow,status:'disconnected'});put('connections',{...ig,status:'disconnected'});}
});

test('history import keeps platform timestamps, attachments and sender direction without duplicates',()=>{
 const a=ingestFacebookMessage(ch,{...item('one','2026-10-13T08:00:00Z'),attachments:{data:[{mime_type:'image/jpeg',image_data:{url:'https://example.com/a.jpg'}}]}},{history:true});
 assert.equal(a.createdAt,'2026-10-13T08:00:00.000Z');assert.equal(a.attachments[0].type,'image');
 assert.equal(ingestFacebookMessage(ch,item('one','2026-10-13T08:00:00Z'),{history:true}).id,a.id);
 const b=ingestFacebookMessage(ch,{...item('two','2026-10-13T09:00:00Z','Trả lời'),from:{id:'page-id'},to:{data:[{id:'person'}]}},{history:true});
 assert.equal(b.direction,'outgoing');assert.equal(all('conversations').length,1);assert.equal(get('conversations',a.conversationId).lastMessage,'Trả lời');
 ingestFacebookMessage(ch,item('old','2026-10-12T08:00:00Z'),{history:true});assert.equal(get('conversations',a.conversationId).lastMessage,'Trả lời');
});
test('webhooks import attachments-only and Page echoes; replays remain idempotent',()=>{
 const entries=[{messaging:[{sender:{id:'person'},recipient:{id:'page-id'},timestamp:Date.parse('2026-10-14T08:00:00Z'),message:{mid:'photo',attachments:[{type:'image',payload:{url:'https://example.com/p.jpg'}}]}},{sender:{id:'page-id'},recipient:{id:'person'},timestamp:Date.parse('2026-10-14T08:01:00Z'),message:{mid:'echo',is_echo:true,text:'Gửi từ Page'}}]}];
 ingestFacebookEvents(ch,entries);const before=all('messages').length;ingestFacebookEvents(ch,entries);assert.equal(all('messages').length,before);assert.equal(all('messages').find(m=>m.externalId==='echo').direction,'outgoing');
});

test('replaying an active webhook does not change conversation revision or invalidate Inbox',()=>{
 const entries=[{messaging:[{sender:{id:'replay-peer'},recipient:{id:'page-id'},timestamp:Date.parse('2026-10-25T08:00:00Z'),message:{mid:'replay-proof',text:'Hello'}}]}];
 ingestFacebookEvents(ch,entries);
 const c=all('conversations').find(c=>c.externalUserId==='replay-peer');
 ingestFacebookEvents(ch,entries);
 assert.equal(get('conversations',c.id).version,c.version);
});
test('purged history is not resurrected; sent album receipts deduplicate each external ID',()=>{
 put('chat_purge_tombstones',{id:'page:0:purged',cutoff:'2026-10-14T00:00:00.000Z'});assert.equal(ingestFacebookMessage(ch,{...item('deleted','2026-10-13T00:00:00Z'),from:{id:'purged'}},{history:true}),null);
 const c=all('conversations').find(c=>c.externalUserId==='person');const receipt=put('messages',{conversationId:c.id,direction:'outgoing',externalId:'first-id',externalMessages:[{id:'first-id'},{id:'second-id'}]});
 assert.equal(ingestFacebookMessage(ch,{...item('second-id','2026-10-14T10:00:00Z'),from:{id:'page-id'},to:{data:[{id:'person'}]}},{history:true}).id,receipt.id);
});
test('sync paginates history, records diagnostics, and does not repeat complete old pages',async()=>{
 let calls=[];const request=async url=>{calls.push(url);return url.includes('/conversations?')?{data:[{id:'thread',participants:{data:[{id:'page-id'},{id:'person',name:'Khách'}]}}]}:{data:[item('sync-msg','2026-10-13T12:00:00Z')]};};
 await syncFacebookChat(ch,request);assert.equal(get('facebook_chat_sync','page').status,'ready');const count=all('messages').length;await syncFacebookChat(ch,request);assert.equal(all('messages').length,count);assert.equal(calls.length,4);
 await assert.rejects(syncFacebookChat(ch,async()=>{throw Error('Thiếu quyền pages_messaging');}),/pages_messaging/);assert.equal(get('facebook_chat_sync','page').status,'error');
});
test('multi-channel OR, all active default and empty selection remain distinct',()=>{
 const state={user:{id:'staff'},customers:[],messages:[],connections:[{id:'a',status:'connected'},{id:'b',status:'connected'},{id:'c',status:'disconnected'}],conversations:['a','b','c'].map(id=>({id,connectionId:id,kind:'message'}))};
 assert.deepEqual(filterThreads(state).map(c=>c.id).sort(),['a','b']);assert.deepEqual(filterThreads(state,'','all',{...defaultFilters,connectionIds:['a']}).map(c=>c.id),['a']);assert.equal(filterThreads(state,'','all',{...defaultFilters,connectionIds:[]}).length,0);
});
test('saved filters belong to authenticated staff and survive subsequent requests',async()=>{
 const a={id:'staff-a',role:'owner'},b={id:'staff-b',role:'owner'};const filters={...defaultFilters,connectionIds:['page']};
 await chatRoute('/api/chat/filter-preferences','POST',{filters,userId:b.id},a);assert.deepEqual((await chatRoute('/api/chat/filter-preferences','GET',{},a)).filters.connectionIds,['page']);assert.equal((await chatRoute('/api/chat/filter-preferences','GET',{},b)).filters,null);
 await assert.rejects(chatRoute('/api/chat/filter-preferences','POST',{filters:{...filters,tags:'broken'}},a),/không hợp lệ/);
 await chatRoute('/api/chat/filter-preferences','POST',{filters:{...filters,connectionIds:null}},a);assert.equal((await chatRoute('/api/chat/filter-preferences','GET',{},a)).filters.connectionIds,null);
});

test('Messenger media sends preserve all receipts; a partial failure cannot be retried as unsent',async()=>{
 const {sendMessage}=await import('../server/connectors.mjs');saveSecret(ch.id,{token:'test-token'});
 const priorFetch=global.fetch,priorOrigin=process.env.OAUTH_BASE_URL;process.env.OAUTH_BASE_URL='https://example.com';let bodies=[];
 writeFileSync(join(dataDir,'uploads','asset_test.jpg'),'image');const asset=put('assets',{type:'image',url:'/uploads/asset_test.jpg'}),conv={externalUserId:'person',lastInboundAt:new Date().toISOString()};
 try{
  global.fetch=async(url,options)=>{if(url.includes('message_attachments'))return new Response(JSON.stringify({attachment_id:'uploaded'}),{status:200});bodies.push(JSON.parse(options.body));return new Response(JSON.stringify({message_id:'sent-'+bodies.length}),{status:200});};
  const result=await sendMessage(ch,conv,'Xin chào',{assetRefs:[asset]});assert.equal(result.externalMessages.length,2);assert.equal(bodies[0].message.text,'Xin chào');assert.equal(bodies[1].message.attachment.type,'image');assert.equal(bodies[1].message.attachment.payload.attachment_id,'uploaded');
  bodies=[];global.fetch=async(url,options)=>{bodies.push(JSON.parse(options.body));return bodies.length===1?new Response(JSON.stringify({message_id:'partial'}),{status:200}):new Response(JSON.stringify({error:{message:'Media bị từ chối'}}),{status:400});};
  await assert.rejects(sendMessage(ch,conv,'Xin chào',{assetRefs:[asset]}),e=>e.unknown===true&&e.externalMessages[0].id==='partial');
 }finally{global.fetch=priorFetch;if(priorOrigin)process.env.OAUTH_BASE_URL=priorOrigin;else delete process.env.OAUTH_BASE_URL;}
});

test('Facebook reaction adapter requires platform acknowledgement and pin stays explicitly internal',async()=>{
 const {reactFacebookMessage}=await import('../server/facebook-reactions.mjs');let body;
 await reactFacebookMessage(ch,{externalUserId:'person'},{externalId:'message-id'},'heart',async(url,options)=>{body=JSON.parse(options.body);return {recipient_id:'person'};});
 assert.equal(body.sender_action,'react');assert.equal(body.payload.message_id,'message-id');assert.equal(body.payload.reaction,'❤️');
 await assert.rejects(reactFacebookMessage(ch,{externalUserId:'person'},{externalId:'message-id'},'heart',async()=>({})),/chưa xác nhận/);
 const conv=all('conversations')[0],m=put('messages',{conversationId:conv.id,direction:'incoming',text:'Ghim QA'}),user={id:'owner',role:'owner'};
 const pinned=await chatRoute('/api/chat/messages/'+m.id,'PATCH',{pinned:true,expectedPinned:false,version:m.version},user);assert.equal(pinned.pinned,true);
 const unpinned=await chatRoute('/api/chat/messages/'+m.id,'PATCH',{pinned:false,expectedPinned:true,version:pinned.version},user);assert.equal(unpinned.pinned,false);
});

test('Facebook sticker and reactions are rendered as media; media-only placeholder text is suppressed',async()=>{
 const {richMessage}=await import('../public/chat-message-rich.js');
 const m=ingestFacebookMessage(ch,{...item('sticker-new','2026-10-14T12:00:00Z',''),sticker:'https://example.com/sticker.png'},{history:true});assert.equal(m.text,'');assert.equal(m.sticker.url,'https://example.com/sticker.png');assert.match(richMessage(m),/chat-sticker/);
 const html=richMessage({text:'[image-12345]',attachments:[{type:'image',url:'https://example.com/image.jpg'}]});assert.doesNotMatch(html,/image-12345/);assert.match(html,/<img/);
 ingestFacebookEvents(ch,[{messaging:[{sender:{id:'person'},recipient:{id:'page-id'},reaction:{mid:'sticker-new',action:'react',emoji:'😆'}}]}]);assert.equal(get('messages',m.id).reactions[0].emoji,'😆');
 ingestFacebookEvents(ch,[{messaging:[{sender:{id:'person'},recipient:{id:'page-id'},reaction:{mid:'sticker-new',action:'unreact'}}]}]);assert.equal(get('messages',m.id).reactions.length,0);
});

test('customer reactions resolve every receipt ID in a staff text/media send',()=>{
 const conv=all('conversations')[0],m=put('messages',{conversationId:conv.id,direction:'outgoing',actor:'staff',externalId:'text-part',externalMessages:[{id:'text-part'},{id:'image-part'}],text:'Hình ảnh'});
 ingestFacebookEvents(ch,[{messaging:[{sender:{id:'person'},recipient:{id:'page-id'},reaction:{mid:'image-part',action:'react',emoji:'😄'}}]}]);
 assert.equal(get('messages',m.id).reactions[0].emoji,'😄');assert.equal(get('messages',m.id).actor,'staff');
});

test('multiple images upload concurrently, send as one album and reuse cached Facebook attachments',async()=>{
 const {facebookMessageMedia}=await import('../server/facebook-media.mjs');
 const assets=[1,2].map(i=>{writeFileSync(join(dataDir,'uploads',`asset_album${i}.jpg`),'image');return put('assets',{id:'album'+i,type:'image',url:`/uploads/asset_album${i}.jpg`,mime:'image/jpeg'});});
 let calls=0;const request=async(url,options)=>{calls++;assert.ok(options.body instanceof FormData);assert.equal(JSON.parse(options.body.get('message')).attachment.payload.is_reusable,true);return{attachment_id:'upload-'+calls};};
 const messages=await facebookMessageMedia(ch,assets,request,'token');assert.equal(messages.length,1);assert.equal(messages[0].attachments.length,2);assert.equal(calls,2);
 assert.deepEqual(await facebookMessageMedia(ch,assets,request,'token'),messages);assert.equal(calls,2);
});

test('active Instagram conversation polling uses the Instagram platform and imports customer replies',async()=>{
 const {syncFacebookConversation}=await import('../server/facebook-chat.mjs');const channel=put('connections',{id:'ig-live',provider:'instagram',accountId:'ig-business',mode:'api',status:'connected'});saveSecret(channel.id,{token:'mock'});const customer=put('customers',{name:'IG customer'}),c=put('conversations',{id:'ig-live-chat',kind:'message',connectionId:channel.id,customerId:customer.id,externalUserId:'ig-person'});let platforms=[];
 await syncFacebookConversation(channel,c,async url=>{if(url.includes('/conversations?')){platforms.push(new URL(url).searchParams.get('platform'));return {data:[{id:'ig-thread'}]};}return {data:[{id:'ig-response',created_time:'2026-10-19T12:00:00Z',message:'IG reply',from:{id:'ig-person'},to:{data:[{id:'ig-business'}]}}]};});assert.deepEqual(platforms,['instagram']);assert.equal(all('messages').find(m=>m.externalId==='ig-response').conversationId,c.id);assert.ok(get('conversations',c.id).lastInboundAt);
});

test('Instagram standby messages appear in inbox but cannot send until the active stream resumes',async()=>{
 const {sendMessage}=await import('../server/connectors.mjs');
 const channel=put('connections',{id:'ig-standby',provider:'instagram',mode:'api',status:'connected',accountId:'ig-standby-business'});saveSecret(channel.id,{token:'mock',pageId:'ig-linked-page'});
 const event={sender:{id:'ig-standby-person'},recipient:{id:channel.accountId},timestamp:Date.now(),message:{mid:'ig-standby-message',text:'Tin khách gửi khi công cụ khác giữ hội thoại'}};
 ingestFacebookEvents(channel,[{id:channel.accountId,standby:[event]}]);
 const message=all('messages').find(m=>m.externalId===event.message.mid),conv=get('conversations',message.conversationId);
 assert.equal(message.direction,'incoming');assert.equal(conv.unread,true);assert.ok(conv.lastInboundAt);assert.equal(conv.metaRoutingState,'standby');
 const beforeFetch=global.fetch;let sends=0;
 try{
  global.fetch=async()=>{sends++;return new Response(JSON.stringify({message_id:'ig-active-reply'}),{status:200});};
  await assert.rejects(sendMessage(channel,conv,'Trả lời'),/ứng dụng khác/);assert.equal(sends,0);
  ingestFacebookEvents(channel,[{id:channel.accountId,messaging:[event]}]);
  assert.equal(all('messages').filter(m=>m.externalId===event.message.mid).length,1);
  const active=get('conversations',conv.id);assert.equal(active.metaRoutingState,'active');
  assert.equal((await sendMessage(channel,active,'Trả lời')).message_id,'ig-active-reply');assert.equal(sends,1);
  ingestFacebookEvents(channel,[{id:channel.accountId,standby:[event,{...event,timestamp:event.timestamp-1000,message:{mid:'ig-older-standby',text:'Tin cũ'}}]}]);
  assert.equal(get('conversations',conv.id).metaRoutingState,'active');
 }finally{global.fetch=beforeFetch;}
});
test('Instagram Page-linked polling imports the customer reply into an existing private chat and unlocks it',async()=>{
 const {syncFacebookConversation}=await import('../server/facebook-chat.mjs'),{privateChatWaitMessage}=await import('../public/private-chat-state.js');
 const channel=put('connections',{id:'ig-linked',provider:'instagram',accountId:'ig-linked-business',mode:'api',status:'connected'});saveSecret(channel.id,{token:'mock',pageId:'linked-page'});
 const customer=put('customers',{name:'QA private customer'}),c=put('conversations',{customerId:customer.id,id:'ig-private-wait',connectionId:channel.id,kind:'message',externalUserId:'linked-customer',privateReplyCommentId:'comment',privateReplySentAt:new Date().toISOString()});let urls=[];
 await syncFacebookConversation(channel,c,async(url,options)=>{urls.push(url);assert.ok(options.signal);if(url.includes('/conversations?')){assert.match(url,/linked-page\/conversations\?platform=instagram/);return {data:[{id:'linked-thread'}]};}return {data:[{id:'reply-linked',created_time:new Date().toISOString(),from:{id:'linked-customer'},to:{data:[{id:channel.accountId}]},message:'sd'}]};});
 const current=get('conversations',c.id);assert.equal(privateChatWaitMessage(current),'');assert.equal(current.facebookThreadId,'linked-thread');assert.equal(all('messages').find(m=>m.externalId==='reply-linked').conversationId,c.id);assert.equal(urls.length,2);
 const m=all('messages').find(m=>m.externalId==='reply-linked');put('conversations',{...current,lastInboundAt:null});ingestFacebookMessage(channel,{id:m.externalId,created_time:m.createdAt,from:{id:'linked-customer'},to:{data:[{id:channel.accountId}]},message:m.text},{history:true});assert.equal(privateChatWaitMessage(get('conversations',c.id)),'');assert.equal(all('messages').filter(x=>x.externalId===m.externalId).length,1);
});
test('Page and Instagram identities classify echoes correctly and never cross-route provider webhooks',()=>{
 const channel=put('connections',{id:'ig-alias',provider:'instagram',accountId:'ig-own',mode:'api',status:'connected'});saveSecret(channel.id,{pageId:'shared-page'});const fb=put('connections',{id:'shared-fb',provider:'facebook',accountId:'shared-page',status:'connected',mode:'api'});
 const entry=[{id:'ig-own',messaging:[{sender:{id:'shared-page'},recipient:{id:'alias-peer'},timestamp:Date.now(),message:{mid:'alias-out',is_echo:true,text:'Sent'}},{sender:{id:'alias-peer'},recipient:{id:'ig-own'},timestamp:Date.now()+1,message:{mid:'alias-in',attachments:[{type:'image',payload:{url:'https://example.test/a.jpg'}},{type:'image',payload:{url:'https://example.test/b.jpg'}}]}}]}];
 ingestFacebookEvents(fb,entry,'instagram');assert.equal(all('messages').some(m=>m.externalId==='alias-out'),false);ingestFacebookEvents(channel,entry,'instagram');const out=all('messages').find(m=>m.externalId==='alias-out'),incoming=all('messages').find(m=>m.externalId==='alias-in');assert.equal(out.direction,'outgoing');assert.equal(out.conversationId,incoming.conversationId);assert.equal(incoming.attachments.length,2);assert.equal(get('conversations',out.conversationId).externalUserId,'alias-peer');
});
test('slow first history thread does not delay importing another Instagram conversation',async()=>{
 const channel=put('connections',{id:'ig-parallel',provider:'instagram',accountId:'ig-parallel-own',mode:'api',status:'connected'});saveSecret(channel.id,{pageId:'parallel-page'});let release;const gate=new Promise(r=>release=r);
 const work=syncFacebookChat(channel,async url=>{if(url.includes('/conversations?'))return {data:[1,2].map(n=>({id:'parallel-'+n,participants:{data:[{id:'ig-parallel-own'},{id:'parallel-customer-'+n}]}}))};if(url.includes('/parallel-1/'))await gate;const n=url.includes('/parallel-1/')?1:2;return {data:[{id:'parallel-msg-'+n,from:{id:'parallel-customer-'+n},to:{data:[{id:channel.accountId}]},message:'QA',created_time:new Date().toISOString()}]};});
 try{await new Promise(r=>setImmediate(r));assert.ok(all('messages').find(m=>m.externalId==='parallel-msg-2'));assert.equal(all('messages').some(m=>m.externalId==='parallel-msg-1'),false);}finally{release();await work;}
});
test('empty Page result can recover from the verified Instagram account without confusing Page messages',async()=>{
 const channel=put('connections',{id:'ig-fallback',provider:'instagram',accountId:'fallback-ig-own',mode:'api',status:'connected'});saveSecret(channel.id,{pageId:'fallback-page'});const paths=[];
 await syncFacebookChat(channel,async url=>{paths.push(url);if(url.includes('/fallback-page/'))return {data:[]};if(url.includes('/conversations?'))return {data:[{id:'fallback-thread',participants:{data:[{id:channel.accountId},{id:'fallback-customer'}]}}]};return {data:[{id:'fallback-incoming',from:{id:'fallback-customer'},to:{data:[{id:channel.accountId}]},message:'Recovered',created_time:new Date().toISOString()}]};});assert.ok(paths.every(url=>!url.includes('/conversations?')||url.includes('platform=instagram')));assert.ok(all('messages').find(m=>m.externalId==='fallback-incoming'));
});
test('Instagram is advertised as a supported chat sync channel and received carousel images remain grouped',async()=>{
 const rows=await chatRoute('/api/chat/channel-status','GET',{}, {id:'qa-owner',role:'owner'});assert.equal(rows.find(r=>r.id==='ig-linked').messaging,true);
 const channel=get('connections','ig-alias'),msg=ingestFacebookMessage(channel,{id:'template-received',created_time:new Date().toISOString(),from:{id:'alias-peer'},to:{data:[{id:channel.accountId}]},attachments:[{type:'template',payload:{template_type:'generic',elements:[{title:'1',image_url:'https://example.test/1.jpg'},{title:'2',image_url:'https://example.test/2.jpg'}]}}]});assert.equal(msg.attachments.length,2);assert.equal(all('messages').filter(m=>m.externalId==='template-received').length,1);
});

test('Instagram hydrates ID-only messages and imports a thread without participants',async()=>{
 const channel=put('connections',{id:'ig-id-only',provider:'instagram',accountId:'id-only-own',mode:'api',status:'connected'});saveSecret(channel.id,{pageId:'id-only-page'});
 let detailReads=0;
 await syncFacebookChat(channel,async url=>{
  if(url.includes('/conversations?'))return {data:[{id:'id-only-thread',updated_time:'2026-10-25T00:00:00Z'}]};
  if(url.includes('/id-only-thread/messages?'))return {data:[{id:'id-only-message',created_time:'2026-10-25T10:00:00Z'}]};
  assert.match(url,/\/id-only-message\?fields=/);detailReads++;
  return {id:'id-only-message',created_time:'2026-10-25T10:00:00Z',from:{id:'id-only-customer'},to:{data:[{id:channel.accountId}]},message:'Customer reply'};
 });
 assert.equal(detailReads,1);const message=all('messages').find(m=>m.externalId==='id-only-message');assert.equal(message.text,'Customer reply');assert.equal(message.direction,'incoming');assert.ok(get('conversations',message.conversationId).lastInboundAt);
});

test('unchanged Instagram thread timestamps do not suppress new customer messages',async()=>{
 const channel=put('connections',{id:'ig-stale-time',provider:'instagram',accountId:'stale-own',mode:'api',status:'connected'});saveSecret(channel.id,{pageId:'stale-page'});let cycle=1;
 const request=async url=>url.includes('/conversations?')?{data:[{id:'stale-thread',updated_time:'2026-10-25T00:00:00Z'}]}:{data:[{id:'stale-message-'+cycle,created_time:new Date().toISOString(),from:{id:'stale-peer'},message:'Reply '+cycle}]};
 await syncFacebookChat(channel,request);cycle=2;await syncFacebookChat(channel,request);
 assert.ok(all('messages').find(m=>m.externalId==='stale-message-2'));
});

test('empty or incomplete Instagram responses cannot report a successful content sync',async()=>{
 const channel=put('connections',{id:'ig-empty-proof',provider:'instagram',accountId:'empty-proof',mode:'api',status:'connected'});
 await syncFacebookChat(channel,async()=>({data:[]}));assert.equal(get('facebook_chat_sync',channel.id).status,'attention');
 await assert.rejects(syncFacebookChat(channel,async url=>url.includes('/conversations?')?{data:[{id:'broken-thread'}]}:url.includes('/messages?')?{data:[{id:'broken-message'}]}:{id:'broken-message'}),/thiếu người gửi/);
 assert.equal(get('facebook_chat_sync',channel.id).status,'error');assert.equal(all('messages').some(m=>m.externalId==='broken-message'),false);
 await assert.rejects(syncFacebookChat(channel,async url=>url.includes('/conversations?')?{data:[{id:'bad-time-thread'}]}:{data:[{id:'bad-time-message',from:{id:'bad-time-peer'},message:'Missing date'}]}),/thiếu thời gian gửi/);
 assert.equal(all('messages').some(m=>m.externalId==='bad-time-message'),false);
});

test('sync records the actual failing network stage and retries reads without reporting ready',async()=>{
 const channel=put('connections',{id:'ig-network-proof',provider:'instagram',accountId:'network-own',mode:'api',status:'connected'});let calls=0;
 await assert.rejects(syncFacebookChat(channel,async()=>{calls++;assert.equal(get('facebook_chat_sync',channel.id).status,'syncing');throw Object.assign(new Error('opaque network failure'),{networkCode:'UND_ERR_CONNECT_TIMEOUT'});}),/UND_ERR_CONNECT_TIMEOUT/);
 const state=get('facebook_chat_sync',channel.id);assert.equal(calls,2);assert.equal(state.status,'error');assert.equal(state.failure.stage,'conversations');assert.equal(state.failure.networkCode,'UND_ERR_CONNECT_TIMEOUT');assert.equal(state.failure.attempts,2);
});

test('sent message adopts Meta timestamp from its echo so order matches Messenger',()=>{
 const incoming=ingestFacebookMessage(ch,item('order-in','2026-10-20T10:00:20.000Z','hihi'),{history:true});
 const sent=put('messages',{conversationId:incoming.conversationId,direction:'outgoing',text:'Lại',externalId:'order-out',status:'accepted',createdAt:'2026-10-20T10:00:28.000Z'});
 const echo={...item('order-out','2026-10-20T10:00:10.000Z','Lại'),from:{id:'page-id'},to:{data:[{id:'person'}]},is_echo:true};
 const fixed=ingestFacebookMessage(ch,echo);
 assert.equal(fixed.id,sent.id);assert.equal(fixed.createdAt,'2026-10-20T10:00:10.000Z');assert.equal(fixed.localCreatedAt,'2026-10-20T10:00:28.000Z');assert.ok(fixed.version>sent.version);
 assert.equal(ingestFacebookMessage(ch,{...echo,created_time:'2026-10-20T10:00:11.000Z'}).createdAt,'2026-10-20T10:00:10.000Z');
});
