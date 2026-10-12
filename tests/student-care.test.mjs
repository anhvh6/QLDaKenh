import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'student-care-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,all,db}=await import('../server/store.mjs');
const {studentCareRoute,studentCareState,scopeCareChats,assertCareConversation,notifyCareMessage}=await import('../server/student-care.mjs');
const {carePolicy,canReadCare,receivesCare,stageInfo}=await import('../public/student-care.js');
const {chatRoute,patchChat}=await import('../server/chat.mjs');
const {eventFor}=await import('../server/web-push.mjs');
const {reply}=await import('../server/domain.mjs');
const owner={id:'owner',role:'owner'},a={id:'a',role:'support'},b={id:'b',role:'support'},reader={id:'reader',role:'support'},outside={id:'outside',role:'support'};
for(const user of [owner,a,b,reader,outside])db.prepare('INSERT INTO users VALUES(?,?,?,?,?,1)').run(user.id,user.id+'@test.invalid',user.id,user.role,'unused');
put('connections',{id:'channel',status:'connected',provider:'zalo_personal',listenerState:'listening'});
put('channel_teams',{teamId:'team',connectionId:'channel'});
for(const user of [a,b,reader])put('team_members',{userId:user.id,teamId:'team'});
put('customers',{id:'learner',name:'Học viên QA',learnerProgress:{stage:'CONSULTED'}});
put('conversations',{id:'personal',connectionId:'channel',customerId:'learner',externalUserId:'member',threadType:0,kind:'message'});
put('conversations',{id:'group',connectionId:'channel',customerId:'group-person',threadType:1,kind:'message',title:'Nhóm QA',learnerCustomerId:'learner',group:{ownId:'self',members:[{id:'member'}]}});
put('messages',{id:'incoming',conversationId:'personal',direction:'incoming',text:'Cần tư vấn'});
const prefs={messages:true,preview:true};
test('settings validate owner, versions, colors and staff; multiple notify recipients and reader-only roles persist',async()=>{
 const input={version:0,stages:{CONSULTED:{color:'#123456',staffConfigured:true,notifyStaffIds:['a','b'],readStaffIds:['reader']}}};
 await assert.rejects(studentCareRoute('/api/chat/student-care-settings','PUT',input,a),e=>e.status===403);
 await assert.rejects(studentCareRoute('/api/chat/student-care-settings','PUT',{...input,stages:{CONSULTED:{...input.stages.CONSULTED,color:'red'}}},owner),/Màu/);
 await assert.rejects(studentCareRoute('/api/chat/student-care-settings','PUT',{...input,stages:{CONSULTED:{...input.stages.CONSULTED,notifyStaffIds:['missing']}}},owner),/Nhân viên/);
 const saved=await studentCareRoute('/api/chat/student-care-settings','PUT',input,owner);
 assert.deepEqual(saved.stages.CONSULTED.notifyStaffIds,['a','b']);
 await assert.rejects(studentCareRoute('/api/chat/student-care-settings','PUT',input,owner),e=>e.status===409);
 assert.equal(stageInfo(studentCareState(),'CONSULTED').color,'#123456');
});
test('personal and representative group share state routing; readers can reply without push and outsiders cannot read',()=>{
 const state=studentCareState();
 for(const id of ['personal','group']){
  const c=get('conversations',id);assert.equal(carePolicy(state,c).stage,'CONSULTED');
  assert.equal(canReadCare(state,c,reader),true);assert.equal(receivesCare(state,c,reader),false);
  assert.equal(canReadCare(state,c,outside),false);assert.equal(receivesCare(state,c,a),true);
  const m={id:'live-'+id,conversationId:id,direction:'incoming',text:'QA'};
  assert.ok(eventFor('messages',m,a,prefs));assert.ok(eventFor('messages',m,b,prefs));assert.equal(eventFor('messages',m,reader,prefs),null);assert.equal(eventFor('messages',m,outside,prefs),null);
 }
 assert.throws(()=>assertCareConversation(outside,get('conversations','personal')),e=>e.status===403);
 const c=get('conversations','personal');assert.ok(patchChat(reader,c.id,{version:c.version,unread:false}));
 const scoped=scopeCareChats({...state,messages:all('messages')},outside);assert.equal(scoped.conversations.length,0);assert.equal(scoped.messages.length,0);
});
test('transfer applies to subsequent messages, rejects channel outsiders and can return to stage defaults',()=>{
 let c=get('conversations','personal');
 assert.throws(()=>patchChat(owner,c.id,{version:c.version,assigneeIds:['outside']}),e=>e.status===403);
 c=patchChat(owner,c.id,{version:c.version,assigneeIds:['b']});
 assert.deepEqual(carePolicy(studentCareState(),c).notifyStaffIds,['b']);
 const message={id:'after-transfer',conversationId:c.id,direction:'incoming',text:'Tin tiếp theo'};
 assert.equal(eventFor('messages',message,a,prefs),null);assert.ok(eventFor('messages',message,b,prefs));
 notifyCareMessage(c,message);notifyCareMessage(c,message);
 assert.deepEqual(all('notifications').filter(n=>n.messageId===message.id).map(n=>n.recipientId),['b']);
 assert.equal(eventFor('notifications',all('notifications')[0],b,prefs),null);
 c=patchChat(owner,c.id,{version:c.version,notificationAssignment:'stage'});
 assert.deepEqual(carePolicy(studentCareState(),c).notifyStaffIds,['a','b']);
});
test('state changes reroute automatically, explicit empty assignments silence notifications, history does not notify',()=>{
 let c=get('conversations','group');c=patchChat(owner,c.id,{version:c.version,assigneeIds:[]});
 assert.equal(receivesCare(studentCareState(),c,a),false);
 notifyCareMessage(c,{id:'history',direction:'incoming',history:true});assert.equal(all('notifications').some(n=>n.messageId==='history'),false);
 const p=get('customers','learner');put('customers',{...p,learnerProgress:{stage:'NEW'}});
 assert.equal(carePolicy(studentCareState(),get('conversations','personal')).stage,'NEW');
 assert.equal(stageInfo(studentCareState(),'NEW').color,'#475467');
 assert.equal(canReadCare(studentCareState(),c,reader),true,'Notification assignment alone does not remove channel read access');
});
test('custom name status policies are saved and route group chats through their representative learner',async()=>{
 const p=get('customers','learner');put('customers',{...p,chatStatusIds:['vip']});
 await chatRoute('/api/chat/name-settings','PUT',{version:0,expiringDays:7,rules:[{id:'vip',label:'VIP',condition:'manual',enabled:true,color:'#456789',staffConfigured:true,notifyStaffIds:['a'],readStaffIds:['reader']}]},owner);
 const saved=get('settings','chat-names');assert.deepEqual(saved.rules[0].notifyStaffIds,['a']);
 let group=get('conversations','group');group=patchChat(owner,group.id,{version:group.version,notificationAssignment:'stage'});
 assert.deepEqual(carePolicy(studentCareState(),group).notifyStaffIds,['a']);
 assert.equal(canReadCare(studentCareState(),group,reader),true);
});
test('reader-only staff can send replies; staff outside the state policy cannot bypass it',async()=>{
 const ch=get('connections','channel');put('connections',{...ch,mode:'demo'});
 let c=get('conversations','personal');
 await assert.rejects(reply(b,c.id,{text:'Không được phép',version:c.version}),e=>e.status===403);
 const message=await reply(reader,c.id,{text:'Phản hồi từ người đọc',version:c.version});assert.equal(message.status,'demo');
 c=get('conversations','personal');assert.deepEqual(carePolicy(studentCareState(),c).notifyStaffIds,['a']);
});
