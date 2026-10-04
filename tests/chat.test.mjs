import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {filterThreads,defaultFilters,safeLink} from '../public/inbox-model.js';
import {defaultNameSettings,nameStatuses} from '../public/chat-names.js';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'chat-'));
const {put,get,db,all}=await import('../server/store.mjs');
const {chatRoute,patchChat}=await import('../server/chat.mjs');
const {reply}=await import('../server/domain.mjs');
const {scopeState}=await import('../server/taophacdo.mjs');
const owner={id:'owner',role:'owner'},support={id:'staff',role:'support'},viewer={id:'viewer',role:'viewer'};
for(const u of [owner,support,viewer])db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(u.id,u.id+'@example.test',u.id,u.role,'test-only');
put('connections',{id:'a',mode:'demo',status:'connected',provider:'zalo_personal'});put('connections',{id:'b',mode:'demo',status:'connected',provider:'zalo_personal'});
put('team_members',{teamId:'team',userId:'staff'});put('channel_teams',{teamId:'team',connectionId:'a'});
put('customers',{id:'p1',name:'Nguyễn Mai',phone:'0900000001'});put('customers',{id:'p2',name:'Nhóm chăm sóc'});
const create=(id,patch={})=>put('conversations',{id,customerId:'p1',connectionId:'a',kind:'message',status:'open',unread:true,lastAt:'2026-10-03T12:00:00Z',tags:[],...patch});
create('one');create('two',{connectionId:'b'});
test('chat mutations enforce permissions, channel scope and revision',async()=>{
 assert.throws(()=>patchChat(viewer,'one',{pinned:true,version:get('conversations','one').version}),{status:403});
 assert.throws(()=>patchChat(support,'two',{pinned:true,version:get('conversations','two').version}),{status:403});
 assert.throws(()=>patchChat(owner,'one',{pinned:true,version:0}),{status:409});
 const r=patchChat(support,'one',{pinned:true,assigneeIds:['owner','staff'],version:get('conversations','one').version});assert.equal(r.pinned,true);assert.deepEqual(r.assigneeIds,['owner','staff']);
 assert.throws(()=>patchChat(owner,'two',{assigneeIds:['staff'],version:get('conversations','two').version}),{status:403});
});
test('bulk updates are atomic if any selected conversation conflicts',async()=>{
 const c=get('conversations','one');await assert.rejects(chatRoute('/api/chat/bulk','POST',{items:[{id:'one',version:c.version},{id:'two',version:0}],patch:{archived:true}},owner),{status:409});assert.equal(get('conversations','one').archived,undefined);
});
test('reminders validate time, assignee access and revision; completion persists',async()=>{
 await assert.rejects(chatRoute('/api/chat/conversations/one/reminders','POST',{title:'Gọi tư vấn',dueAt:'invalid'},owner));
 await assert.rejects(chatRoute('/api/chat/conversations/two/reminders','POST',{title:'Gọi',dueAt:new Date(Date.now()+60000).toISOString(),assignee:'staff'},owner),{status:403});
 const r=await chatRoute('/api/chat/conversations/one/reminders','POST',{title:'Gọi tư vấn',dueAt:new Date(Date.now()+60000).toISOString(),assignee:'staff'},owner);
 assert.equal(r.status,'pending');const done=await chatRoute('/api/chat/reminders/'+r.id,'PATCH',{status:'done',version:r.version},support);assert.equal(done.status,'done');
});
test('message pinning is internal and cannot cross a channel boundary',async()=>{
 put('messages',{id:'secret-message',conversationId:'two',text:'private',direction:'incoming'});
 await assert.rejects(chatRoute('/api/chat/messages/secret-message','PATCH',{pinned:true,version:1},support),{status:403});
 const m=put('messages',{conversationId:'one',text:'Tin cần ghim',direction:'incoming'});const pinned=await chatRoute('/api/chat/messages/'+m.id,'PATCH',{pinned:true,version:m.version},support);assert.equal(pinned.pinned,true);
});
test('quote rejects cross-conversation and internal-note leakage; notes preserve SLA and message ordering',async()=>{
 const note=put('messages',{conversationId:'one',direction:'note',text:'Chỉ nội bộ'});
 await assert.rejects(reply(owner,'one',{text:'Reply',quoteId:'secret-message',version:get('conversations','one').version}));
 await assert.rejects(reply(owner,'one',{text:'Reply',quoteId:note.id,version:get('conversations','one').version}));
 const c=put('conversations',{...get('conversations','one'),waitingSince:'2026-10-03T12:00:00Z'});await reply(owner,'one',{text:'Ghi chú mới',note:true,version:c.version});const after=get('conversations','one');assert.equal(after.lastAt,c.lastAt);assert.equal(after.waitingSince,c.waitingSince);
});
test('media IDs must be valid assets and quotes are attached to outgoing messages',async()=>{
 await assert.rejects(reply(owner,'one',{text:'',assetIds:['missing'],version:get('conversations','one').version}));
 const a=put('assets',{id:'asset_123',url:'/uploads/asset_123.jpg',name:'Ảnh',type:'image'}),m=put('messages',{conversationId:'one',direction:'incoming',text:'Xin tư vấn'});
 const out=await reply(owner,'one',{text:'Dạ vâng',assetIds:[a.id],quoteId:m.id,version:get('conversations','one').version});assert.equal(out.quoteId,m.id);assert.equal(out.attachments.length,1);assert.equal(out.status,'demo');
});
test('filters combine type, labels, staff, phone, date, unread and full-message search',()=>{
 const S={customers:[{id:'p1',name:'Nguyễn Mai',phone:'09001'},{id:'p2',name:'Nhóm B'}],messages:[{conversationId:'x',text:'Bài học số một'}],conversations:[
  {id:'x',customerId:'p1',kind:'message',threadType:1,connectionId:'a',tags:['A','B'],assigneeIds:['owner','staff'],lastAt:'2026-10-03T16:59:00Z',waitingSince:'2026-10-03T12:00:00Z',unread:false},
  {id:'y',customerId:'p2',kind:'message',threadType:0,lastAt:'2026-10-03T17:01:00Z',tags:['A'],assignee:'owner',unread:true},
  {id:'comment',kind:'comment',customerId:'p1'},{id:'archive',kind:'message',customerId:'p1',archived:true} ]};
 const f={...defaultFilters,type:'group',phone:'yes',tags:['A','B'],tagMode:'all',assignees:['owner','staff'],assigneeMode:'all',reply:'read-waiting',from:'2026-10-03',to:'2026-10-03'};
 assert.deepEqual(filterThreads(S,'bai hoc','all',f).map(c=>c.id),['x']);assert.equal(filterThreads(S,'','unread',f).length,0);
 assert.deepEqual(filterThreads(S,'','all',{...defaultFilters,archive:'archived'}).map(c=>c.id),['archive']);assert.equal(filterThreads(S,'','all',{...defaultFilters,phone:'no'}).length,1);
});
test('unsafe link protocols and credential-bearing URLs are not rendered',()=>{assert.equal(safeLink('javascript:alert(1)'), '');assert.equal(safeLink('https://user:pass@example.com'), '');assert.equal(safeLink('https://example.com/a'),'https://example.com/a');});
test('display rename is revision checked and synchronizes the learner name without changing group customers',async()=>{
 const {editorData}=await import('../server/plan-bridge.mjs');create('rename-person');let c=get('conversations','rename-person'),p=get('customers',c.customerId);
 await assert.rejects(chatRoute('/api/chat/conversations/rename-person/rename','POST',{name:'Tên mới',version:c.version,customerVersion:0},owner),{status:409});
 await chatRoute('/api/chat/conversations/rename-person/rename','POST',{name:'Tên học viên mới',version:c.version,customerVersion:p.version},owner);
 assert.equal(get('customers','p1').name,'Tên học viên mới');assert.equal(editorData(owner,'draft:p1').customer.customer_name,'Tên học viên mới');
 c=create('rename-group',{threadType:1,customerId:'p2'});p=get('customers','p2');await chatRoute('/api/chat/conversations/rename-group/rename','POST',{name:'Nhóm tên mới',version:c.version},owner);
 assert.equal(get('conversations',c.id).title,'Nhóm tên mới');assert.equal(get('customers','p2').name,p.name);
 await assert.rejects(chatRoute('/api/chat/conversations/two/rename','POST',{name:'Không được',version:get('conversations','two').version},support),{status:403});
});
test('name rules validate owner access, revision, colors and manual status IDs',async()=>{
 const cfg={...structuredClone(defaultNameSettings),rules:[{id:'vip',label:'Khách ưu tiên',condition:'manual',color:'#6941C6',enabled:true},...defaultNameSettings.rules]};
 await assert.rejects(chatRoute('/api/chat/name-settings','PUT',cfg,support),{status:403});
 await assert.rejects(chatRoute('/api/chat/name-settings','PUT',{...cfg,rules:[{...cfg.rules[0],color:'red;display:none'}]},owner));
 const saved=await chatRoute('/api/chat/name-settings','PUT',cfg,owner);assert.equal(saved.version,1);
 await assert.rejects(chatRoute('/api/chat/name-settings','PUT',cfg,owner),{status:409});
 const c=get('conversations','one'),p=get('customers',c.customerId);
 await assert.rejects(chatRoute('/api/chat/conversations/one/name-statuses','POST',{statusIds:['active'],version:c.version,customerVersion:p.version},support));
 const result=await chatRoute('/api/chat/conversations/one/name-statuses','POST',{statusIds:['vip'],version:c.version,customerVersion:p.version},support);assert.deepEqual(result.chatStatusIds,['vip']);
});
test('name status priority handles deposits, expiration boundaries, unknown friendship and manual overrides',()=>{
 const time=Date.parse('2026-10-04T10:00:00+07:00'),S={customers:[{id:'p',name:'QA'}],connections:[{id:'z',provider:'zalo_personal'}],orders:[{customerId:'p',total:100,paid:20,status:'confirmed'}],chatPlanSummaries:[],journeys:[],plan_handoffs:[]},c={customerId:'p',connectionId:'z',threadType:0};
 assert.equal(nameStatuses(S,c,defaultNameSettings,time)[0].id,'deposit');assert.ok(!nameStatuses(S,c,defaultNameSettings,time).some(r=>r.id==='not-friend'));
 S.chatPlanSummaries=[{customerId:'p',startDate:'2026-09-01',endDate:'2026-10-04',status:'ACTIVE'}];assert.equal(nameStatuses(S,c,defaultNameSettings,time)[0].id,'expiring');
 S.chatPlanSummaries[0].endDate='2026-10-03';assert.equal(nameStatuses(S,c,defaultNameSettings,time)[0].id,'expired');
 S.chatPlanSummaries[0].endDate='2026-10-30';assert.equal(nameStatuses(S,c,defaultNameSettings,time)[0].id,'active');S.chatPlanSummaries[0].status='REVOKED';assert.ok(!nameStatuses(S,c,defaultNameSettings,time).some(r=>r.id==='active'));
 const cfg={...defaultNameSettings,rules:[{id:'vip',label:'VIP',condition:'manual',color:'#123456',enabled:true},...defaultNameSettings.rules]};S.customers[0].chatStatusIds=['vip'];assert.equal(nameStatuses(S,c,cfg,time)[0].id,'vip');assert.deepEqual(nameStatuses(S,{...c,threadType:1},cfg,time),[]);
});
test('friend actions cannot use demo channels, bypass confirmation or mutate a foreign channel',async()=>{
 create('friend',{externalUserId:'123'});const version=get('conversations','friend').version;
 await assert.rejects(chatRoute('/api/chat/conversations/friend/friend','POST',{version,action:'request',confirm:true},owner));
 put('connections',{id:'friend-api',provider:'zalo_personal',mode:'api',status:'connected'});const c=create('friend-real',{connectionId:'friend-api',externalUserId:'123'});
 await assert.rejects(chatRoute('/api/chat/conversations/friend-real/friend','POST',{version:c.version,action:'request'},owner),/xác nhận/);
 await assert.rejects(chatRoute('/api/chat/conversations/friend-real/friend','POST',{version:c.version,action:'sync'},support),{status:403});
});
