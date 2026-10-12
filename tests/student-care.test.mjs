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
test('full defaults, permission matrix, personal and representative group',async()=>{
 const saved=await studentCareRoute('/api/chat/student-care-settings','PUT',{version:0,stages:{CONSULTED:{color:'#123456',staffPermissions:{a:{receive:true,mute:false},reader:{receive:true,mute:true},b:{receive:false,mute:false}}}}},owner);
 assert.deepEqual(saved.stages.CONSULTED.staffPermissions.b,{receive:false,mute:true});
 for(const id of ['personal','group']){const c=get('conversations',id),state=studentCareState();assert.equal(carePolicy(state,c).stage,'CONSULTED');assert.equal(canReadCare(state,c,reader),true);assert.equal(receivesCare(state,c,reader),false);assert.equal(canReadCare(state,c,b),false);assert.equal(eventFor('messages',{id:'m',conversationId:id,direction:'incoming'},reader,prefs),null);assert.ok(eventFor('messages',{id:'m',conversationId:id,direction:'incoming'},a,prefs));}
 assert.throws(()=>patchChat(b,'personal',{version:get('conversations','personal').version,unread:true}),e=>e.status===403);
 const scoped=scopeCareChats({...studentCareState(),messages:all('messages')},b);assert.equal(scoped.conversations.length,0);assert.equal(scoped.messages.length,0);
 const ch=get('connections','channel');put('connections',{...ch,mode:'demo'});assert.equal((await reply(reader,'personal',{version:get('conversations','personal').version,text:'Reply permitted'})).status,'demo');
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,1)').run('new','new@test.invalid','New','support','unused');assert.equal(receivesCare(studentCareState(),get('conversations','personal'),{id:'new',role:'support'}),true);
});
test('exceptions take priority, confirmation protects defaults and rejects stale previews',async()=>{
 let c=get('conversations','personal');c=patchChat(owner,c.id,{version:c.version,carePermissions:{a:{receive:true,mute:true},b:{receive:true,mute:false}}});
 assert.equal(receivesCare(studentCareState(),c,a),false);assert.equal(canReadCare(studentCareState(),c,b),true);
 const body={version:get('settings','student-care').version,stages:{CONSULTED:{color:'#123456',staffPermissions:{a:{receive:false,mute:true},b:{receive:false,mute:true}}}}};
 const preview=await studentCareRoute('/api/chat/student-care-settings/preview','POST',body,owner);assert.equal(preview.rows.length,2);
 await assert.rejects(studentCareRoute('/api/chat/student-care-settings','PUT',body,owner),e=>e.status===409);
 c=patchChat(owner,c.id,{version:c.version,carePermissions:{...c.carePermissions,reader:{receive:false,mute:true}}});
 await assert.rejects(studentCareRoute('/api/chat/student-care-settings','PUT',{...body,exceptionToken:preview.exceptionToken},owner),e=>e.status===409);
 const fresh=await studentCareRoute('/api/chat/student-care-settings/preview','POST',body,owner);await studentCareRoute('/api/chat/student-care-settings','PUT',{...body,exceptionToken:fresh.exceptionToken},owner);
 assert.equal(canReadCare(studentCareState(),c,a),true);assert.equal(receivesCare(studentCareState(),c,b),true);
 notifyCareMessage(c,{id:'notify-exception',direction:'incoming',text:'New'});assert.equal(all('notifications').some(n=>n.messageId==='notify-exception'&&n.recipientId==='a'),false);assert.equal(all('notifications').some(n=>n.messageId==='notify-exception'&&n.recipientId==='b'),true);
 c=patchChat(owner,c.id,{version:c.version,carePermissions:{}});assert.equal(canReadCare(studentCareState(),c,a),false);
});
test('old permissions reset to full and invalid inputs rejected',async()=>{
 put('settings',{id:'student-care',stages:{CONSULTED:{staffConfigured:true,notifyStaffIds:[],readStaffIds:[]}}});assert.equal(receivesCare(studentCareState(),get('conversations','group'),reader),true);
 const body={version:get('settings','student-care').version,stages:{NEW:{color:'#123456',staffPermissions:{missing:{receive:true,mute:false}}}}};
 await assert.rejects(studentCareRoute('/api/chat/student-care-settings','PUT',body,a),e=>e.status===403);await assert.rejects(studentCareRoute('/api/chat/student-care-settings','PUT',body,owner));
});

test('exceptions list includes hidden chats and individual edits retain other staff overrides',async()=>{
 let c=get('conversations','group');c=patchChat(owner,c.id,{version:c.version,carePermissions:{owner:{receive:false,mute:true},a:{receive:true,mute:true}}});
 const rows=await studentCareRoute('/api/chat/student-care-exceptions','GET',{},owner);assert.ok(rows.some(r=>r.conversationId===c.id&&r.employeeId==='owner'));
 c=await studentCareRoute('/api/chat/student-care-exceptions','PATCH',{conversationId:c.id,employeeId:'owner',version:c.version,reset:true},owner);
 assert.equal(c.carePermissions.owner,undefined);assert.deepEqual(c.carePermissions.a,{receive:true,mute:true});
 await assert.rejects(studentCareRoute('/api/chat/student-care-exceptions','PATCH',{conversationId:c.id,employeeId:'a',version:c.version,reset:true},a),e=>e.status===403);
});

test('appointment reminders use the same stage for settings, exceptions and resetting assignments',async()=>{
 put('customers',{id:'appointment-learner',name:'Appointment'});
 put('chat_reminders',{id:'appointment-reminder',customerId:'appointment-learner',status:'pending'});
 let c=put('conversations',{id:'appointment-chat',customerId:'appointment-learner',connectionId:'channel',kind:'message',threadType:0});
 put('settings',{id:'chat-names',expiringDays:7,rules:[{id:'no-plan',condition:'no_plan',enabled:true,color:'#123456',staffPermissions:{a:{receive:true,mute:false}}}]});
 const previous=get('settings','student-care');await studentCareRoute('/api/chat/student-care-settings','PUT',{version:previous.version,stages:{APPOINTMENT:{color:'#123456',staffPermissions:{a:{receive:true,mute:true}}}}},owner);
 assert.equal(carePolicy(studentCareState(),c).stage,'APPOINTMENT');assert.equal(receivesCare(studentCareState(),c,a),false);
 c=patchChat(owner,c.id,{version:c.version,carePermissions:{a:{receive:true,mute:false}}});
 assert.ok((await studentCareRoute('/api/chat/student-care-exceptions','GET',{},owner)).some(r=>r.conversationId===c.id&&r.stage==='APPOINTMENT'));
 const body={version:get('settings','student-care').version,stages:{APPOINTMENT:{color:'#456789',staffPermissions:{a:{receive:false,mute:true}}}}};
 const preview=await studentCareRoute('/api/chat/student-care-settings/preview','POST',body,owner);assert.ok(preview.rows.some(r=>r.conversationId===c.id));
 await studentCareRoute('/api/chat/student-care-settings','PUT',{...body,exceptionToken:preview.exceptionToken},owner);
 c=patchChat(owner,c.id,{version:c.version,carePermissions:{}});assert.equal(canReadCare(studentCareState(),c,a),false);
});

test('remote learner facts override stored plan stage consistently for access, reset and exceptions',async()=>{
 put('customers',{id:'remote-learner',name:'Hoang Anh',learnerProgress:{stage:'STUDYING'}});
 put('learner_source_facts',{id:'remote-learner',learnerProgress:{stage:'APPOINTMENT',manualOverride:true,planOverride:true}});
 let c=put('conversations',{id:'remote-chat',customerId:'remote-learner',connectionId:'channel',kind:'message',threadType:0});
 assert.equal(carePolicy(studentCareState(),c).stage,'APPOINTMENT');
 c=patchChat(owner,c.id,{version:c.version,carePermissions:{a:{receive:true,mute:true}}});
 const rows=await studentCareRoute('/api/chat/student-care-exceptions','GET',{},owner);assert.ok(rows.some(r=>r.conversationId===c.id&&r.stage==='APPOINTMENT'));
 const previous=get('settings','student-care');const body={version:previous.version,stages:{...previous.stages,APPOINTMENT:{color:'#123456',staffPermissions:{a:{receive:true,mute:false}}}}};
 const preview=await studentCareRoute('/api/chat/student-care-settings/preview','POST',body,owner);assert.ok(preview.rows.some(r=>r.conversationId===c.id));
 await studentCareRoute('/api/chat/student-care-settings','PUT',{...body,exceptionToken:preview.exceptionToken},owner);
 c=patchChat(owner,c.id,{version:c.version,carePermissions:{}});assert.equal(receivesCare(studentCareState(),c,a),true);
});
