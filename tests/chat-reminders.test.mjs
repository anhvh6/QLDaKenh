import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'reminders-'));
const {put,get,all,db}=await import('../server/store.mjs');
const {createChatReminder,reminderTick}=await import('../server/chat-reminders.mjs');
const {customerReminderTick,recoverCustomerReminders}=await import('../server/chat-reminders.mjs');
const owner={id:'owner',role:'owner'};db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('owner','reminder@qa.test','Owner','owner','qa');
put('connections',{id:'z',provider:'zalo_personal',mode:'api'});put('customers',{id:'p',name:'QA'});
const c=put('conversations',{id:'c',connectionId:'z',customerId:'p',externalUserId:'123',threadType:0});
const {progressFor}=await import('../public/learner-progress.js');const {progressState}=await import('../server/consultation-review.mjs');const {reminderPopup}=await import('../public/chat-tools.js');
const {finishMentionTasks}=await import('../server/staff-tasks.mjs');
const {chatRoute}=await import('../server/chat.mjs');
const {activeAppointmentTask}=await import('../public/reminder-model.js');

test('multi-recipient appointments create isolated call tasks and one alert per recipient; replies do not close call tasks',async()=>{
 db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('manager','manager@qa.test','Manager','manager','qa');
 const due=Date.now()+7200000,r=await createChatReminder(owner,c,{title:'Call QA',dueAt:new Date(due).toISOString(),assigneeIds:['owner','manager','manager'],customerReminder:true,reminderMinutes:17,reminderText:'Nhắc khách QA'});
 assert.deepEqual(r.assigneeIds,['owner','manager']);const tasks=all('staff_handoffs').filter(t=>t.reminderId===r.id);assert.equal(tasks.length,2);
 for(const id of r.assigneeIds)assert.equal(get('notifications','chat-reminder:created:'+r.id+':'+id).recipientId,id);
 finishMentionTasks(owner,c.id,'reply-qa');assert.ok(tasks.every(t=>get('staff_handoffs',t.id).status==='open'));
 let sent=0;await customerReminderTick(due-17*60000,async()=>{sent++;return{id:'qa-customer-reminder'};});await customerReminderTick(due-17*60000+1,async()=>{sent++;});assert.equal(sent,1);
 assert.ok(!get('chat_reminders',r.id).staffAdvanceAlertedAt);reminderTick(due-330000);
 for(const id of r.assigneeIds){const n=get('notifications','chat-reminder:advance:'+r.id+':'+id);assert.equal(n.title,'Sắp đến giờ nhắc hẹn');assert.match(n.body,/QA.*Lịch hẹn/);}
 assert.equal(activeAppointmentTask(tasks[0],due-1),true);assert.equal(activeAppointmentTask(tasks[0],due),false);reminderTick(due);assert.ok(tasks.every(t=>get('staff_handoffs',t.id).status==='resolved'));
});
test('invalid or unauthorized recipient rejects the entire appointment before saving tasks or notifications',async()=>{
 const input={title:'Invalid staff QA',dueAt:new Date(Date.now()+7200000).toISOString()},before=[all('chat_reminders').length,all('staff_handoffs').length,all('notifications').length];
 db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('no-channel','scope@qa.test','Support','support','qa');
 for(const assigneeIds of [[],['owner','missing'],['owner','no-channel'],'owner'])await assert.rejects(createChatReminder(owner,c,{...input,assigneeIds}));
 assert.deepEqual([all('chat_reminders').length,all('staff_handoffs').length,all('notifications').length],before);
});
test('cancelling an appointment closes every assigned call task and prevents automatic customer messages',async()=>{
 const due=Date.now()+10800000,r=await createChatReminder(owner,c,{title:'Cancel QA',dueAt:new Date(due).toISOString(),assigneeIds:['owner','manager'],customerReminder:true,reminderMinutes:15,reminderText:'Never send'});
 await chatRoute('/api/chat/reminders/'+r.id,'PATCH',{status:'cancelled',version:r.version},owner,new URL('http://localhost'));
 assert.ok(all('staff_handoffs').filter(t=>t.reminderId===r.id).every(t=>t.status==='resolved'));await customerReminderTick(due,async()=>{throw Error('Must not send cancelled reminder');});assert.equal(get('chat_reminders',r.id).customerReminderStatus,'pending');
});

test('creates native reminder once and durable system notification once',async()=>{
 const due=Date.now()+60000;let calls=0;const r=await createChatReminder(owner,c,{title:'Nhắc tư vấn',dueAt:new Date(due).toISOString(),platform:true},async(id,thread,type,title,time)=>{calls++;assert.equal(thread,'123');assert.equal(time,due);return{id:'native'};});
 assert.equal(get('customers','p').learnerProgress.stage,'APPOINTMENT');assert.equal(get('customers','p').learnerProgress.manualOverride,true);assert.equal(calls,1);assert.equal(r.platformStatus,'created');assert.equal(reminderTick(due-1),0);assert.equal(reminderTick(due),1);assert.equal(reminderTick(due+1),0);assert.equal(get('notifications','chat-reminder:'+r.id).recipientId,'owner');assert.ok(get('chat_reminders',r.id).alertedAt);
});
test('platform failure keeps internal reminder; unsupported channel never invokes native provider',async()=>{
 const input={title:'Nhắc QA',dueAt:new Date(Date.now()+120000).toISOString(),platform:true};const r=await createChatReminder(owner,c,input,async()=>{throw Error('offline');});assert.equal(r.platformStatus,'failed');assert.equal(r.status,'pending');
 put('connections',{id:'other',provider:'facebook',mode:'api'});const other=put('conversations',{id:'other-c',connectionId:'other',customerId:'p'});const x=await createChatReminder(owner,other,input,async()=>{throw Error('must not call');});assert.equal(x.platformStatus,'unsupported');
 await assert.rejects(createChatReminder(owner,c,{...input,assignee:'missing'}));await assert.rejects(createChatReminder(owner,c,{...input,dueAt:'invalid'}));
 put('chat_reminders',{...r,status:'cancelled'});assert.equal(reminderTick(Date.now()+200000),1);assert.equal(all('notifications').filter(n=>n.id==='chat-reminder:'+x.id||n.id==='chat-reminder:'+r.id).length,1);
});

test('opaque Zalo errors preserve code and empty success is not reported as created',async()=>{
 const input={title:'QA',dueAt:new Date(Date.now()+120000).toISOString(),platform:true};
 const failed=await createChatReminder(owner,c,input,async()=>{const error=new Error('null');error.code=999;throw error;});
 assert.equal(failed.platformErrorCode,999);assert.ok(failed.platformError.includes('999'));assert.notEqual(failed.platformError,'null');
 const empty=await createChatReminder(owner,c,input,async()=>null);assert.equal(empty.platformStatus,'failed');
});

test('Zalo rejection -20017 does not prevent the assigned system alert',async()=>{const due=Date.now()+900000;const r=await createChatReminder(owner,c,{title:'Provider rejection QA',dueAt:new Date(due).toISOString(),platform:true},async()=>{const error=new Error('null');error.code=-20017;throw error;});assert.equal(r.platformStatus,'failed');assert.equal(r.platformErrorCode,-20017);reminderTick(due);assert.equal(get('notifications','chat-reminder:'+r.id).body,'Provider rejection QA');assert.equal(get('notifications','chat-reminder:'+r.id).recipientId,owner.id);assert.equal(reminderTick(due),0);});

test('appointments always allowed and only promote a lower stage, including group representatives',async()=>{for(const stage of ['NEW','APPOINTMENT','CONSULTED','DEPOSIT','PAID','STUDYING','EXPIRING','EXPIRED']){const p=put('customers',{id:'stage-'+stage,name:stage,learnerProgress:{stage,manualOverride:true,source:'staff'}}),conv=put('conversations',{id:'chat-'+stage,customerId:p.id,connectionId:'z',threadType:0,externalUserId:'uid-'+stage}),before=get('customers',p.id).learnerProgress;const r=await createChatReminder(owner,conv,{title:'QA',dueAt:new Date(Date.now()+60000).toISOString(),platform:false});assert.equal(r.status,'pending');assert.equal(progressFor(progressState(),get('customers',p.id)).stage,stage==='NEW'?'APPOINTMENT':stage);if(!['NEW','APPOINTMENT'].includes(stage))assert.deepEqual(get('customers',p.id).learnerProgress,before);let body;reminderPopup({state:{...progressState(),customers:[get('customers',p.id)],conversations:[conv],connections:[get('connections','z')],users:[{...owner,active:true,name:'Owner'}],user:owner},modal:(_title,html)=>body=html},conv);assert.ok(!body.includes('name="confirmDowngrade"'));}
const group=put('conversations',{id:'group-stage',connectionId:'z',threadType:1,learnerCustomerId:'stage-DEPOSIT',learnerMemberId:'uid-DEPOSIT',group:{memberIds:['uid-DEPOSIT']}});const before=get('customers','stage-DEPOSIT').learnerProgress,r=await createChatReminder(owner,group,{title:'Nhóm QA',dueAt:new Date(Date.now()+60000).toISOString()});assert.equal(r.customerId,'stage-DEPOSIT');assert.deepEqual(get('customers','stage-DEPOSIT').learnerProgress,before);});
test('Hoàng Anh deleted source replaces stale study status and a new appointment becomes visible',async()=>{const p=put('customers',{id:'deleted-learner',name:'Hoàng Anh',origin:'taophacdo',status:'ACTIVE',link:'https://example.test/plan',start_date:'2026-01-01',end_date:'2099-12-31',learnerProgress:{stage:'CONSULTED',manualOverride:true,source:'staff'}}),facts=put('learner_source_facts',{id:p.id,status:'DELETED',learnerDeleted:true,statusCheckedAt:new Date().toISOString()}),conv=put('conversations',{id:'deleted-chat',connectionId:'z',customerId:p.id,threadType:0});assert.equal(progressFor(progressState(),{...p,...facts,id:p.id}).stage,'NEW');const r=await createChatReminder(owner,conv,{title:'Tư vấn lại',dueAt:new Date(Date.now()+60000).toISOString(),platform:false});const saved=get('customers',p.id);assert.equal(r.status,'pending');assert.equal(progressFor(progressState(),{...saved,...facts,id:p.id}).stage,'APPOINTMENT');assert.equal(all('journey_events').find(e=>e.reminderId===r.id).from,'NEW');assert.equal(progressFor(progressState(),{...saved,...facts,id:p.id,statusCheckedAt:'2099-01-01T00:00:00.000Z'}).stage,'NEW');});
test('automatic consultation status cannot be downgraded by a new pending reminder',async()=>{const p=put('customers',{id:'automatic-consulted',name:'QA',is_consultation:true}),conv=put('conversations',{id:'auto-chat',connectionId:'z',customerId:p.id,threadType:0});await createChatReminder(owner,conv,{title:'Tái hẹn',dueAt:new Date(Date.now()+60000).toISOString()});assert.equal(progressFor(progressState(),get('customers',p.id)).stage,'CONSULTED');assert.equal(get('customers',p.id).learnerProgress,undefined);});

test('customer advance reminder uses 15-minute steps, remembers defaults, sends once and preserves local Facebook appointment',async()=>{
 const page=put('connections',{id:'reminder-page',provider:'facebook',mode:'api',status:'connected'}),chat=put('conversations',{id:'reminder-page-chat',connectionId:page.id,customerId:'p'});
 const due=Date.now()+3600000,input={title:'Lịch tư vấn',dueAt:new Date(due).toISOString(),customerReminder:true,reminderMinutes:15,reminderText:'Chị sắp đến giờ tư vấn nhé.'};
 await assert.rejects(createChatReminder(owner,chat,{...input,reminderMinutes:1.5}),/số nguyên/);
 const r=await createChatReminder(owner,chat,input);assert.equal(r.platformStatus,'not_requested');assert.equal(Date.parse(r.customerReminderAt),due-900000);assert.equal(get('settings','chat-reminder-defaults-owner').text,input.reminderText);
 let calls=0;const send=async(user,id,body)=>{calls++;assert.equal(id,chat.id);assert.equal(body.text,input.reminderText);return{id:'reminder-sent'};};
 await customerReminderTick(due-900001,send);assert.equal(calls,0);await customerReminderTick(due-900000,send);await customerReminderTick(due-899999,send);assert.equal(calls,1);assert.equal(get('chat_reminders',r.id).customerReminderStatus,'sent');
});
test('customer reminder errors notify staff; expired, cancelled and crash-interrupted reminders never resend',async()=>{
 const due=Date.now()+3600000,r=await createChatReminder(owner,c,{title:'Lịch lỗi',dueAt:new Date(due).toISOString(),customerReminder:true,reminderMinutes:30,reminderText:'Nhắc hẹn'});
 await customerReminderTick(due-1800000,async()=>{throw Error('Ngoài cửa sổ Messenger');});assert.equal(get('chat_reminders',r.id).customerReminderStatus,'failed');assert.match(get('notifications','chat-reminder-error:'+r.id).body,/cửa sổ/);
 put('chat_reminders',{id:'crash-auto',customerReminderStatus:'sending',actor:'owner',conversationId:c.id});recoverCustomerReminders();assert.equal(get('chat_reminders','crash-auto').customerReminderStatus,'unknown');
 put('chat_reminders',{id:'late-auto',status:'pending',customerReminder:true,customerReminderStatus:'pending',customerReminderAt:new Date(due-1000).toISOString(),dueAt:new Date(due).toISOString()});
 put('chat_reminders',{id:'cancel-auto',status:'cancelled',customerReminder:true,customerReminderStatus:'pending',customerReminderAt:new Date(due-1000).toISOString(),dueAt:new Date(due+1000).toISOString()});
 let calls=0;await customerReminderTick(due,async()=>{calls++;});assert.equal(calls,0);assert.equal(get('chat_reminders','late-auto').customerReminderStatus,'skipped');
});

test('staff-only reminders alert every assignee before five minutes and again when due, once each',async()=>{
 const due=Date.now()+4*3600000;
 const r=await createChatReminder(owner,c,{title:'Nhắc nhân viên độc lập',dueAt:new Date(due).toISOString(),assigneeIds:['manager'],customerReminder:false,platform:false});
 reminderTick(due-330001);assert.equal(get('chat_reminders',r.id).staffAdvanceAlertedAt,undefined);
 reminderTick(due-330000);reminderTick(due-300000);
 const advance=all('notifications').filter(n=>n.reminderId===r.id&&n.id.includes(':advance:'));
 assert.equal(advance.length,1);assert.equal(advance[0].recipientId,'manager');assert.equal(advance[0].conversationId,c.id);assert.match(advance[0].body,/Nhắc nhân viên độc lập/);
 assert.equal(get('chat_reminders',r.id).alertedAt,undefined);
 reminderTick(due);reminderTick(due+1000);
 const alerts=all('notifications').filter(n=>n.reminderId===r.id&&!n.id.includes(':created:'));
 assert.equal(alerts.length,2);assert.ok(alerts.every(n=>n.recipientId==='manager'&&n.conversationId===c.id));
 assert.ok(alerts.some(n=>n.title==='Đến giờ nhắc hẹn'));assert.equal(get('chat_reminders',r.id).customerReminderStatus,'disabled');
});

test('cancelled or completed reminders stay silent and a short-notice appointment alerts immediately',async()=>{
 const time=Date.now(),due=time+4*3600000;
 for(const status of ['cancelled','done']){const r=await createChatReminder(owner,c,{title:'Không nhắc '+status,dueAt:new Date(due).toISOString()});put('chat_reminders',{...r,status});reminderTick(due);assert.ok(!all('notifications').some(n=>n.reminderId===r.id&&!n.id.includes(':created:')));}
 const r=await createChatReminder(owner,c,{title:'Lịch sát giờ',dueAt:new Date(time+120000).toISOString()});reminderTick(time);reminderTick(time+1000);
 assert.equal(all('notifications').filter(n=>n.reminderId===r.id&&n.id.includes(':advance:')).length,1);
});
