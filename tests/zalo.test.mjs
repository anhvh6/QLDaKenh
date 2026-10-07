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
 await t.test('new message persists atomically and replays do not duplicate',()=>{assert.equal(zalo.ingestMessage('z1',make()),true);assert.equal(zalo.ingestMessage('z1',make()),false);assert.equal(all('messages').length,1);assert.equal(all('conversations')[0].unread,true);assert.equal(all('messages')[0].createdAt,'2026-10-03T04:00:00.000Z');});
 await t.test('historic messages keep chronology and do not trigger workflows or unread',()=>{const conv=all('conversations')[0];put('conversations',{...conv,unread:false});put('workflows',{enabled:true,trigger:'message_received',action:'notify',name:'Test',value:'Test'});zalo.ingestMessage('z1',make('90',{data:{...make().data,msgId:'90',ts:'1790900000000',content:'Tin cũ'}}),{history:true});assert.equal(get('conversations',conv.id).lastMessage,'Xin chào');assert.equal(get('conversations',conv.id).unread,false);assert.equal(all('notifications').length,0);});
 await t.test('old poisoned event ids do not prevent recovery; accounts and groups remain distinct',()=>{db.prepare('INSERT INTO events VALUES(?,?,?,?)').run('z2100','z2','2026-01-01','{}');zalo.ingestMessage('z2',make());zalo.ingestMessage('z1',make('100',{type:1}));assert.equal(all('conversations').length,3);assert.equal(all('messages').length,4);});
 await t.test('transaction failure does not consume a message id',()=>{const before=db.prepare('SELECT count(*) AS n FROM events').get().n,customers=all('customers').length;db.exec("CREATE TEMP TRIGGER fail_zalo_test BEFORE INSERT ON records WHEN NEW.kind='messages' AND json_extract(NEW.data,'$.externalId')='rollback' BEGIN SELECT RAISE(ABORT,'test rollback'); END");try{assert.throws(()=>zalo.ingestMessage('z1',make('rollback',{threadId:'rollback-user'})));assert.equal(db.prepare('SELECT count(*) AS n FROM events').get().n,before);assert.equal(all('customers').length,customers);}finally{db.exec('DROP TRIGGER fail_zalo_test');}assert.equal(zalo.ingestMessage('z1',make('rollback',{threadId:'rollback-user'})),true);});
 const api=fake();zalo.setupListener('z1',api,{autoSync:false});
 await t.test('listener accepts new and old events; reconnect enabled',()=>{assert.equal(api.listener.options.retryOnClose,true);assert.equal(get('connections','z1').listenerState,'listening');api.listener.emit('message',make('101'));api.listener.emit('old_messages',[make('89')],0);assert.ok(all('messages').some(m=>m.externalId==='89'&&m.history));});
 await t.test('history fetch paginates individual/group cursors and has real completion state',async()=>{const requests=[];api.listener.requestOldMessages=(type,cursor)=>{requests.push([type,cursor]);queueMicrotask(()=>api.listener.emit('old_messages',cursor?[]:[make(String(50+type),{type})],type));};await zalo.syncZaloData('z1',api);assert.deepEqual(requests,[[0,null],[0,'50'],[1,null],[1,'51']]);assert.equal(get('connections','z1').zaloSync.status,'complete');});
 await t.test('sync errors are visible and never report complete',async()=>{api.getAllFriends=async()=>{throw Error('Test failure');};await assert.rejects(zalo.syncZaloData('z1',api));assert.equal(get('connections','z1').zaloSync.status,'failed');});
 await t.test('self echo reconciles pending send; personal sends bypass OA token gate and preserve group type',async()=>{const conv=all('conversations').find(c=>c.connectionId==='z1'&&c.threadType===0);const pending=put('messages',{conversationId:conv.id,text:'Trả lời',direction:'outgoing',status:'sending'});zalo.ingestMessage('z1',make('910',{isSelf:true,data:{...make().data,msgId:'910',content:'Trả lời'}}));assert.equal(get('messages',pending.id).externalId,'910');let sent;api.sendMessage=async(...args)=>{sent=args;return {message:{msgId:'920'}};};const result=await connectors.sendMessage(get('connections','z1'),{externalUserId:'group1',threadType:1},'Test');assert.equal(result.id,'920');assert.equal(sent[2],1);});
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
 await t.test('disconnect stops ingest and preserves history',async()=>{const count=all('messages').length;await zalo.disconnect('z1');api.listener.emit('message',make('999'));assert.equal(all('messages').length,count);assert.equal(get('connections','z1').status,'disconnected');});
});

