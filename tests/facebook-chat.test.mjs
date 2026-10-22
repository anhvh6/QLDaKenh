import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'facebook-chat-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,all,saveSecret,dataDir}=await import('../server/store.mjs');
const {ingestFacebookMessage,ingestFacebookEvents,syncFacebookChat}=await import('../server/facebook-chat.mjs');
const {chatRoute}=await import('../server/chat.mjs');
const {defaultFilters,filterThreads}=await import('../public/inbox-model.js');
const ch=put('connections',{id:'page',provider:'facebook',mode:'api',status:'connected',accountId:'page-id'});
const item=(id,date,message='Xin chào')=>({id,created_time:date,message,from:{id:'person',name:'Khách'},to:{data:[{id:'page-id'}]}});

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
test('purged history is not resurrected; sent album receipts deduplicate each external ID',()=>{
 put('chat_purge_tombstones',{id:'page:0:purged',cutoff:'2026-10-14T00:00:00.000Z'});assert.equal(ingestFacebookMessage(ch,{...item('deleted','2026-10-13T00:00:00Z'),from:{id:'purged'}},{history:true}),null);
 const c=all('conversations')[0];const receipt=put('messages',{conversationId:c.id,direction:'outgoing',externalId:'first-id',externalMessages:[{id:'first-id'},{id:'second-id'}]});
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
 const channel=put('connections',{id:'ig-standby',provider:'instagram',mode:'api',status:'connected',accountId:'ig-standby-business'});saveSecret(channel.id,{token:'mock'});
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
