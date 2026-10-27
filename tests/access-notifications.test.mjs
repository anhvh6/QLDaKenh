import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'access-notify-'));process.env.PLAN_REMOTE_CATALOG='0';
const {db,get,put,all}=await import('../server/store.mjs');const A=await import('../server/access-control.mjs');const {allowsNotification}=await import('../server/notification-access.mjs');const {filterCareNotifications}=await import('../server/student-care.mjs');const {eventFor}=await import('../server/web-push.mjs');
const owner={id:'owner',role:'owner'};db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('owner','owner@example.test','Owner','owner','unused');A.importLegacyAccess({});
const change=(kind,id,input={})=>A.mutateAccess(owner,kind,id,{...input,version:A.accessConfig().version});
test('delete refuses an occupied role, allows an empty role and renames permission labels without changing their key',()=>{
 const role=change('roles',null,{name:'Empty',permissions:{}}).id;change('role-delete',role);assert.ok(!A.accessConfig().roles.some(r=>r.id===role));
 assert.throws(()=>change('role-delete','owner'),e=>e.status===403);change('permission-label','menu.content',{name:'Bài đăng'});assert.equal(A.accessConfig().catalog.find(p=>p.id==='menu.content').label,'Bài đăng');
 const r=change('roles',null,{name:'Occupied',permissions:{}}).id;change('users',null,{role:r,name:'Member',email:'member@example.test',password:'TestPassword123!'});assert.throws(()=>change('role-delete',r),e=>e.status===409);
});
test('deleting a permission grants its capability to every user and never resurrects the column after reload',()=>{
 change('permission-delete','plan.edit_plan');assert.equal(A.hasAccess({id:'other',role:'viewer'},'plan.edit_plan'),true);assert.ok(!A.accessConfig().catalog.some(p=>p.id==='plan.edit_plan'));
 change('permission-delete','notify.chat_new');assert.equal(A.hasAccess({id:'other',role:'viewer'},'notify.chat_new'),true);assert.ok(!A.accessConfig().catalog.some(p=>p.id==='notify.chat_new'));
});
test('owner can turn their own notification off and on; this never allows changing their security permissions',()=>{
 change('permissions','owner',{overrides:{'notify.post_failed':false}});const n={id:'failure',notificationType:'post_failed'};assert.equal(allowsNotification(owner,'notifications',n),false);assert.equal(eventFor('notifications',n,owner,{messages:true}),null);
 change('permissions','owner',{overrides:{'notify.post_failed':true}});assert.equal(allowsNotification(owner,'notifications',n),true);
 assert.throws(()=>change('permissions','owner',{overrides:{'menu.orders':false}}),e=>e.status===403);
});
test('publication and automatic message events create one notification per event and skip failed sends or history',()=>{
 let p=put('publications',{id:'post',title:'Test',status:'scheduled'});assert.ok(get('notifications','access-event:publications:post:post_planned'));p=put('publications',{...p,status:'published'});put('publications',{...p,url:'https://example.test/post'});assert.equal(all('notifications').filter(n=>n.publicationId==='post'&&n.notificationType==='post_published').length,1);
 put('messages',{id:'ai',conversationId:'c',direction:'outgoing',botId:'bot',status:'sending'});assert.equal(get('notifications','access-event:messages:ai:ai_sent'),null);put('messages',{...get('messages','ai'),status:'accepted'});assert.ok(get('notifications','access-event:messages:ai:ai_sent'));
 put('messages',{id:'failed-auto',direction:'outgoing',communicationCampaignId:'campaign',status:'failed'});assert.equal(get('notifications','access-event:messages:failed-auto:automatic_sent'),null);
 put('chat_reminders',{id:'automatic-reminder',customerReminderStatus:'sent',conversationId:'c',customerReminderMessageId:'m'});assert.ok(get('notifications','access-event:chat_reminders:automatic-reminder:automatic_sent'));
 put('publications',{id:'history',status:'published',createdAt:'2020-01-01T00:00:00Z'});assert.equal(get('notifications','access-event:publications:history:post_published'),null);
});
test('read receipts are isolated by account and are respected by push delivery',()=>{
 const n=put('notifications',{id:'shared',title:'Shared',read:false});put('notification_reads',{id:'owner:shared',userId:'owner',notificationId:'shared'});assert.equal(filterCareNotifications([n],owner)[0].read,true);assert.equal(filterCareNotifications([n],{id:'other',role:'manager'})[0].read,false);assert.equal(eventFor('notifications',n,owner,{messages:true}),null);
});
