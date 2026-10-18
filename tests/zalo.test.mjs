import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {EventEmitter} from 'node:events';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'zalo-'));
const store=await import('../server/store.mjs');
const zalo=await import('../server/zalo.mjs');
const connectors=await import('../server/connectors.mjs');
const {put,get,all,db}=store;
const make=(msgId='100',extra={})=>({threadId:'friend1',type:0,isSelf:false,data:{msgId,content:'Xin chào',dName:'Khách Zalo',ts:'1791000000000',uidFrom:'friend1'},...extra});
function fake(){const listener=new EventEmitter();listener.start=options=>{listener.options=options;listener.emit('connected');listener.emit('cipher_key','not-a-real-key');};listener.stop=()=>listener.emit('closed',1000);return {listener,getAllFriends:async()=>[{userId:'friend1',displayName:'Bạn Zalo'}],sendMessage:async()=>({message:{msgId:'900',cliMsgId:'901'}})};}
test('Zalo persistence, history, listener and routing',async t=>{
 put('connections',{id:'z1',provider:'zalo_personal',mode:'api',status:'connected'});put('connections',{id:'z2',provider:'zalo_personal',mode:'api',status:'connected'});
 await t.test('contacts are committed with the actual SQLite transaction helper and deduplicated',()=>{assert.equal(zalo.importFriends('z1',[{userId:'friend1',displayName:'Bạn A'}]),1);zalo.importFriends('z1',[{userId:'friend1',displayName:'Bạn B'}]);assert.equal(all('conversations').length,1);assert.equal(all('customers')[0].name,'Bạn B');});
 await t.test('new message persists atomically and replays do not duplicate',()=>{assert.equal(zalo.ingestMessage('z1',make()),true);assert.equal(zalo.ingestMessage('z1',make()),false);assert.equal(all('messages').length,1);zalo.ingestMessage('z1',make('100',{data:{...make().data,cliMsgId:'native-client'}}),{history:true});assert.equal(all('messages')[0].externalClientId,'native-client');assert.equal(all('conversations')[0].unread,true);assert.equal(all('messages')[0].createdAt,'2026-10-03T04:00:00.000Z');});
 await t.test('historic messages keep chronology and do not trigger workflows or unread',()=>{const conv=all('conversations')[0];put('conversations',{...conv,unread:false});put('workflows',{enabled:true,trigger:'message_received',action:'notify',name:'Test',value:'Test'});zalo.ingestMessage('z1',make('90',{data:{...make().data,msgId:'90',ts:'1790900000000',content:'Tin cũ'}}),{history:true});assert.equal(get('conversations',conv.id).lastMessage,'Xin chào');assert.equal(get('conversations',conv.id).unread,false);assert.equal(all('notifications').length,0);});
 await t.test('old poisoned event ids do not prevent recovery; accounts and groups remain distinct',()=>{db.prepare('INSERT INTO events VALUES(?,?,?,?)').run('z2100','z2','2026-01-01','{}');zalo.ingestMessage('z2',make());zalo.ingestMessage('z1',make('100',{type:1}));assert.equal(all('conversations').length,3);assert.equal(all('messages').length,4);});
 await t.test('transaction failure does not consume a message id',()=>{const before=db.prepare('SELECT count(*) AS n FROM events').get().n,customers=all('customers').length;db.exec("CREATE TEMP TRIGGER fail_zalo_test BEFORE INSERT ON records WHEN NEW.kind='messages' AND json_extract(NEW.data,'$.externalId')='rollback' BEGIN SELECT RAISE(ABORT,'test rollback'); END");try{assert.throws(()=>zalo.ingestMessage('z1',make('rollback',{threadId:'rollback-user'})));assert.equal(db.prepare('SELECT count(*) AS n FROM events').get().n,before);assert.equal(all('customers').length,customers);}finally{db.exec('DROP TRIGGER fail_zalo_test');}assert.equal(zalo.ingestMessage('z1',make('rollback',{threadId:'rollback-user'})),true);});
 const api=fake();zalo.setupListener('z1',api,{autoSync:false});
 await t.test('listener accepts new and old events; reconnect enabled',()=>{assert.equal(api.listener.options.retryOnClose,true);assert.equal(get('connections','z1').listenerState,'listening');api.listener.emit('message',make('101'));api.listener.emit('old_messages',[make('89')],0);assert.ok(all('messages').some(m=>m.externalId==='89'&&m.history));const live=all('messages').find(m=>m.externalId==='101'),history=all('messages').find(m=>m.externalId==='89');assert.ok(Date.parse(live.pushReceivedAt)>Date.now()-5000);assert.equal(history.pushReceivedAt,undefined);});
 await t.test('history fetch paginates individual/group cursors and has real completion state',async()=>{const requests=[];api.listener.requestOldMessages=(type,cursor)=>{requests.push([type,cursor]);queueMicrotask(()=>api.listener.emit('old_messages',cursor?[]:[make(String(50+type),{type})],type));};await zalo.syncZaloData('z1',api);assert.deepEqual(requests,[[0,null],[0,'50'],[1,null],[1,'51']]);assert.equal(get('connections','z1').zaloSync.status,'complete');});
 await t.test('sync errors are visible and never report complete',async()=>{api.getAllFriends=async()=>{throw Error('Test failure');};await assert.rejects(zalo.syncZaloData('z1',api));assert.equal(get('connections','z1').zaloSync.status,'failed');});
 await t.test('self echo reconciles pending send; personal sends bypass OA token gate and preserve group type',async()=>{const conv=all('conversations').find(c=>c.connectionId==='z1'&&c.threadType===0);const pending=put('messages',{conversationId:conv.id,text:'Trả lời',direction:'outgoing',status:'sending'});zalo.ingestMessage('z1',make('910',{isSelf:true,data:{...make().data,msgId:'910',content:'Trả lời'}}));assert.equal(get('messages',pending.id).externalId,'910');let sent;api.sendMessage=async(...args)=>{sent=args;return {message:{msgId:'920'}};};const result=await connectors.sendMessage(get('connections','z1'),{externalUserId:'group1',threadType:1},'Test',{mentions:[{uid:'200',pos:0,len:4}]});assert.equal(result.id,'920');assert.equal(sent[2],1);assert.deepEqual(sent[0].mentions,[{uid:'200',pos:0,len:4}]);});
 await t.test('group adapters preserve roles, reject unsafe self-removal and call SDK with correct order',async()=>{
  api.getOwnId=()=> '100';api.getGroupInfo=async id=>({gridInfoMap:{[id]:{name:'Nhóm kiểm thử',creatorId:'100',adminIds:[],memberIds:['100','200'],totalMember:2}}});api.getGroupMembersInfo=async()=>({profiles:{'100':{id:'100',displayName:'Chủ nhóm'},'200':{id:'200',displayName:'Học viên'}}});
  const g=await zalo.groupDetails('z1','group1');assert.equal(g.ownRole,'owner');assert.equal(g.members.length,2);
  let call;api.changeGroupName=async(...args)=>{call=args;return {status:1};};await zalo.changeGroup('z1','group1','rename',{name:'Tên mới'});assert.deepEqual(call,['Tên mới','group1']);
  api.removeUserFromGroup=async()=>{throw Error('must not call');};await assert.rejects(zalo.changeGroup('z1','group1','remove',{memberIds:['100']}));
  api.getOwnId=()=> '200';await assert.rejects(zalo.changeGroup('z1','group1','disband'));
  api.createGroup=async options=>{assert.deepEqual(options.members,['100','200']);return {groupId:'created-group',sucessMembers:['100','200'],errorMembers:[]};};const created=await zalo.newGroup('z1','Nhóm mới',['100','200']);assert.equal(created.threadType,1);assert.equal(created.title,'Nhóm mới');
 });
 await t.test('image metadata callback supplies actual dimensions and size for SDK upload',async()=>{const path=join(process.env.DATA_DIR,'pixel.png');const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPZsAAAAASUVORK5CYII=','base64');writeFileSync(path,bytes);const meta=await zalo.imageMetadataGetter(path);assert.equal(meta.width,1);assert.equal(meta.height,1);assert.equal(meta.size,bytes.length);});
 await t.test('friend requests stay pending and removal uses the exact SDK recipient',async()=>{
  let isFr=0,call;api.getUserInfo=async id=>({changed_profiles:{[id]:{userId:id,isFr}},unchanged_profiles:{}});api.sendFriendRequest=async(...args)=>{call=args;return '';};
  const pending=await zalo.friendAction('z1','friend1','request','Chào bạn');assert.deepEqual(call,['Chào bạn','friend1']);assert.equal(pending.isFriend,false);assert.equal(pending.friendRequestPending,true);
  isFr=1;assert.deepEqual(await zalo.friendAction('z1','friend1','sync'),{isFriend:true,friendRequestPending:false});api.removeFriend=async id=>{call=id;return '';};assert.equal((await zalo.friendAction('z1','friend1','remove')).isFriend,false);assert.equal(call,'friend1');
  const c=all('conversations').find(c=>c.externalUserId==='friend1'&&c.connectionId==='z1'&&c.threadType===0),p=get('customers',c.customerId);put('customers',{...p,name:'Tên tự đặt',nameEditedLocally:true});zalo.importFriends('z1',[{userId:'friend1',displayName:'Tên Zalo gốc'}]);assert.equal(get('customers',p.id).name,'Tên tự đặt');
 });
 await t.test('deleted chat stays hidden on history sync and reopens only for fresh incoming messages',async()=>{
  const {deleteChats,filterDeletedChats}=await import('../server/chat-delete.mjs');
  const c=all('conversations').find(c=>c.connectionId==='z1'&&c.threadType===0);
  deleteChats({id:'owner',role:'owner'},{confirm:true,items:[{id:c.id,version:c.version}]});
  assert.ok(get('conversations',c.id).deletedAt);
  zalo.ingestMessage('z1',make('deleted-history'),{history:true});assert.ok(get('conversations',c.id).deletedAt);
  const at=Date.now()+1000;zalo.ingestMessage('z1',make('after-delete',{data:{...make().data,msgId:'after-delete',content:'Tin mới sau xóa',ts:String(at)}}));
  assert.equal(get('conversations',c.id).deletedAt,null);assert.equal(get('conversations',c.id).archived,false);
  const state=filterDeletedChats({conversations:[get('conversations',c.id)],messages:all('messages')});assert.deepEqual(state.messages.map(m=>m.externalId),['after-delete']);
 });
 await t.test('native recall uses exact platform IDs and outgoing echo IDs survive send completion',async()=>{
  let args;api.undo=async(...v)=>{args=v;return {};};await zalo.recallMessage('z1','group1',1,'msg','client');assert.deepEqual(args,[{msgId:'msg',cliMsgId:'client'},'group1',1]);
  const {reply}=await import('../server/domain.mjs');const c=all('conversations').find(c=>c.connectionId==='z1'&&c.threadType===0);const original=api.sendMessage;api.sendMessage=async()=>{zalo.ingestMessage('z1',make('race-id',{isSelf:true,data:{...make().data,msgId:'race-id',cliMsgId:'race-client',content:'Echo race'}}));return {message:{msgId:'race-id'}};};
  try{const m=await reply({id:'owner',role:'owner'},c.id,{text:'Echo race',version:c.version});assert.equal(m.externalClientId,'race-client');assert.equal(m.externalId,'race-id');}finally{api.sendMessage=original;}
 });
 await t.test('one album send keeps every native ID and never duplicates self echoes',async()=>{
  const {saveSendReceipt}=await import('../server/chat-send-receipt.mjs');const c=all('conversations').find(c=>c.connectionId==='z1'&&c.threadType===0),original=api.sendMessage;let calls=0;
  const photos=[{url:'https://example.com/1.jpg',type:'image'},{url:'https://example.com/2.jpg',type:'image'}];
  const image=(id,url,self=true)=>make(id,{isSelf:self,data:{...make().data,msgId:id,cliMsgId:'cli-'+id,msgType:'chat.photo',content:{href:url,params:JSON.stringify({groupLayoutId:'album-qa'})}}});
  const pending=put('messages',{conversationId:c.id,direction:'outgoing',status:'sending',text:'Album QA',attachments:photos});
  api.sendMessage=async(...args)=>{calls++;assert.deepEqual(args[0].attachments,['first.png','second.png']);zalo.ingestMessage('z1',image('album-1',photos[0].url));zalo.ingestMessage('z1',image('album-2',photos[1].url));return {message:{msgId:'album-text',cliMsgId:'cli-text'},attachment:[{msgId:'album-1',cliMsgId:'cli-album-1'},{msgId:'album-2',cliMsgId:'cli-album-2'}]};};
  try{const r=await zalo.sendMessage('z1','friend1',0,'Album QA',{attachments:['first.png','second.png']});const saved=saveSendReceipt(pending,r,photos);assert.equal(calls,1);assert.equal(saved.attachments.length,2);assert.equal(saved.externalMessages.length,3);assert.equal(all('messages').filter(m=>m.id===pending.id||m.externalId?.startsWith('album-')).length,1);assert.equal(zalo.ingestMessage('z1',image('album-2',photos[1].url)),false);assert.equal(get('messages',pending.id).attachments.length,2);
   api.sendMessage=async()=>({});await assert.rejects(zalo.sendMessage('z1','friend1',0,'No confirmation'),{unknown:true});
  }finally{api.sendMessage=original;}
 });
 await t.test('incoming album groups exact layout IDs but not unrelated senders',()=>{
  const image=(id,sender)=>make(id,{data:{...make().data,msgId:id,uidFrom:sender,msgType:'chat.photo',content:{href:'https://example.com/'+id+'.jpg',params:JSON.stringify({groupLayoutId:'incoming-album'})}}});
  zalo.ingestMessage('z1',image('incoming-1','friend1'));zalo.ingestMessage('z1',image('incoming-2','friend1'));zalo.ingestMessage('z1',image('incoming-3','other'));
  const rows=all('messages').filter(m=>m.albumId==='incoming-album');assert.equal(rows.length,2);assert.equal(rows.find(m=>m.senderId==='friend1').attachments.length,2);assert.equal(zalo.ingestMessage('z1',image('incoming-2','friend1')),false);
 });
 await t.test('message and conversation lookup use indexes instead of scanning all records',()=>{
  const messagePlan=db.prepare("EXPLAIN QUERY PLAN SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.externalId')=?").all('c','m');assert.match(JSON.stringify(messagePlan),/SEARCH records USING INDEX idx_messages_(conversation|external)/);
  const channelPlan=db.prepare("EXPLAIN QUERY PLAN SELECT id FROM records WHERE kind='conversations' AND json_extract(data,'$.connectionId')=? AND json_extract(data,'$.externalUserId')=? AND coalesce(json_extract(data,'$.threadType'),0)=?").all('z1','friend1',0);assert.match(JSON.stringify(channelPlan),/idx_zalo_conversation/);
 });
 await t.test('receipt reconciliation rolls back duplicate removal if saving fails',async()=>{
  const {saveSendReceipt}=await import('../server/chat-send-receipt.mjs');const pending=put('messages',{id:'receipt-rollback',conversationId:'rollback-receipt-c',text:'Original',direction:'outgoing'}),echo=put('messages',{conversationId:pending.conversationId,direction:'outgoing',externalId:'rollback-echo'});
  db.exec("CREATE TEMP TRIGGER fail_receipt BEFORE INSERT ON records WHEN NEW.kind='messages' AND NEW.id='receipt-rollback' BEGIN SELECT RAISE(ABORT,'receipt failed'); END");
  try{assert.throws(()=>saveSendReceipt(pending,{id:'rollback-echo'},[]),/receipt failed/);assert.ok(get('messages',echo.id));}finally{db.exec('DROP TRIGGER fail_receipt');}
 });
 await t.test('disconnect stops ingest and preserves history',async()=>{const count=all('messages').length;await zalo.disconnect('z1');api.listener.emit('message',make('999'));assert.equal(all('messages').length,count);assert.equal(get('connections','z1').status,'disconnected');});
});

