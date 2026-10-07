import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'staff-tasks-'));
const {put,get,db}=await import('../server/store.mjs'),{chatRoute}=await import('../server/chat.mjs'),{botRoute,botState}=await import('../server/chatbot.mjs'),{reply}=await import('../server/domain.mjs');
const owner={id:'owner',role:'owner'},staff={id:'staff',role:'support'},other={id:'other',role:'support'};
for(const u of [owner,staff,other])db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(u.id,u.id+'@qa.test',u.id,u.role,'qa');
put('connections',{id:'ch',provider:'zalo_personal',mode:'demo',status:'connected'});put('team_members',{userId:staff.id,teamId:'team'});put('channel_teams',{connectionId:'ch',teamId:'team'});put('customers',{id:'p',name:'Customer'});put('conversations',{id:'c',connectionId:'ch',customerId:'p',kind:'message'});put('messages',{id:'incoming',conversationId:'c',direction:'incoming',text:'Cần tư vấn'});
const path='/api/chat/conversations/c/staff-tasks';
test('mentions assign only permitted staff and preserve quoted customer message; no external message',async()=>{
 const choices=await chatRoute('/api/chat/conversations/c/task-staff','GET',{},owner);assert.ok(choices.users.some(u=>u.id==='staff'));assert.ok(!choices.users.some(u=>u.id==='other'));
 await assert.rejects(chatRoute(path,'POST',{assignedStaffId:'other',text:'Help',version:get('conversations','c').version},owner),/quyền/);
 const task=await chatRoute(path,'POST',{assignedStaffId:'staff',text:'Kiểm tra giúp',messageId:'incoming',version:get('conversations','c').version},owner);assert.equal(task.source,'mention');assert.equal(task.questions[0].text,'Cần tư vấn');assert.equal(botState(staff).staffHandoffs[0].id,task.id);assert.equal(botState(other).staffHandoffs.length,0);
 await assert.rejects(botRoute('/api/chatbot/handoffs/'+task.id,'PATCH',{status:'resolved',version:task.version},other),/kênh|phân công/i);
 await reply(owner,'c',{text:'Owner reply',version:get('conversations','c').version});assert.equal(get('staff_handoffs',task.id).status,'open');
 await reply(staff,'c',{text:'Internal note',note:true,version:get('conversations','c').version});assert.equal(get('staff_handoffs',task.id).status,'open');
 await reply(staff,'c',{text:'Đã tư vấn',version:get('conversations','c').version});assert.equal(get('staff_handoffs',task.id).status,'resolved');assert.equal(botState(staff).chatMentions.length,0);
});
test('unquoted task can be resolved explicitly and failed reply does not complete task',async()=>{
 const t=await chatRoute(path,'POST',{assignedStaffId:'staff',text:'Gọi lại học viên',version:get('conversations','c').version},owner);put('connections',{...get('connections','ch'),mode:'api',status:'disconnected'});
 await assert.rejects(reply(staff,'c',{text:'Reply failure',version:get('conversations','c').version}));assert.equal(get('staff_handoffs',t.id).status,'open');
 await botRoute('/api/chatbot/handoffs/'+t.id,'PATCH',{version:t.version,status:'resolved'},staff);assert.equal(botState(staff).staffHandoffs.filter(h=>h.status!=='resolved').length,0);
});

test('can remind outgoing messages and internal notes, rejects another conversation',async()=>{
 for(const direction of ['outgoing','note']){const m=put('messages',{conversationId:'c',direction,text:'Source '+direction});const task=await chatRoute(path,'POST',{assignedStaffId:'staff',messageId:m.id,version:get('conversations','c').version},owner);assert.equal(task.messageId,m.id);assert.equal(task.questions[0].text,m.text);await botRoute('/api/chatbot/handoffs/'+task.id,'PATCH',{status:'resolved',version:task.version},staff);}
 const foreign=put('messages',{conversationId:'other-conv',direction:'outgoing',text:'Other chat'});await assert.rejects(chatRoute(path,'POST',{assignedStaffId:'staff',messageId:foreign.id,version:get('conversations','c').version},owner),/thuộc hội thoại/);
});
