import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'unified-access-'));process.env.PLAN_REMOTE_CATALOG='0';
const {db,get}=await import('../server/store.mjs');const A=await import('../server/access-control.mjs');const {guardAccessRequest,scopeAccessState}=await import('../server/access-guard.mjs');
const owner={id:'owner',role:'owner'};db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(owner.id,'owner@example.test','Owner','owner','unused');
const update=(kind,id,input)=>A.mutateAccess(owner,kind,id,{...input,version:A.accessConfig().version});
test('legacy roles, custom plan permissions and remote users merge once without overwriting existing owner',()=>{
 const cfg=A.importLegacyAccess({roles:[{name:'coach',display_name:'Coach'},{name:'super_admin',display_name:'Super admin'}],permissions:[{code:'custom_plan',display_name:'Custom'}],mappings:[{role_name:'coach',permission_code:'custom_plan'}],users:[{id:'remote-owner',email:'owner@example.test',role:'super_admin'},{id:'remote-coach',email:'coach@example.test',role:'coach'}]});
 assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get('owner').role,'owner');const c=db.prepare('SELECT * FROM users WHERE email=?').get('coach@example.test');assert.equal(c.active,0);assert.equal(cfg.users[c.id].needsPassword,true);assert.equal(A.accessFor(c)['plan.custom_plan'],true);assert.equal(A.accessFor(c)['settings.access'],false);const before=cfg.version;assert.equal(A.importLegacyAccess({}).version,before);
});
test('role defaults and explicit user allow/deny overrides remain independent',()=>{
 const role=update('roles',null,{name:'Sales',permissions:{'menu.orders':true,'menu.inbox':true}}).id;
 const id=update('users',null,{name:'Sales A',email:'sales@example.test',password:'StrongPassword123!',role}).id;
 assert.equal(A.hasAccess({id,role},'menu.orders'),true);assert.equal(A.hasAccess({id,role},'menu.content'),false);
 update('permissions',id,{overrides:{'menu.orders':false,'menu.content':true}});assert.equal(A.hasAccess({id,role},'menu.orders'),false);assert.equal(A.hasAccess({id,role},'menu.content'),true);
 update('roles',role,{name:'Sales renamed',permissions:{'menu.orders':true,'menu.content':false}});assert.equal(A.hasAccess({id,role},'menu.content'),true);assert.equal(A.hasAccess({id,role},'menu.orders'),false);
});
test('stale updates, self lock/delete and owner demotion are rejected; deleting preserves identity history',()=>{
 assert.throws(()=>A.mutateAccess(owner,'roles',null,{version:0,name:'stale',permissions:{}}),e=>e.status===409);
 assert.throws(()=>update('lock','owner',{active:false}),e=>e.status===403);assert.throws(()=>update('delete','owner',{}),e=>e.status===403);assert.throws(()=>update('users','owner',{name:'Owner',email:'owner@example.test',role:'viewer'}));
 const u=db.prepare('SELECT * FROM users WHERE email=?').get('sales@example.test');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('testsession',u.id,'csrf',Date.now()+10000);update('delete',u.id,{});assert.equal(db.prepare('SELECT active FROM users WHERE id=?').get(u.id).active,0);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(u.id).n,0);assert.ok(!A.accessSnapshot(owner).users.some(v=>v.id===u.id));
});
test('delegated managers cannot grant rights they do not have or mutate their own role',()=>{
 const role=update('roles',null,{name:'Delegated',permissions:{'settings.access':true,'menu.settings':true}}).id,id=update('users',null,{name:'Delegated',email:'delegated@example.test',password:'StrongPassword123!',role}).id,actor={id,role};
 assert.throws(()=>A.mutateAccess(actor,'roles',null,{name:'Escalation',permissions:{'menu.orders':true},version:A.accessConfig().version}),e=>e.status===403);
 assert.throws(()=>A.mutateAccess(actor,'roles',role,{name:'Own role',permissions:{},version:A.accessConfig().version}),e=>e.status===403);
 assert.throws(()=>A.mutateAccess(actor,'users','owner',{name:'Owner',email:'owner@example.test',role:'owner',version:A.accessConfig().version}),e=>e.status===403);
});
test('API guards deny direct access and sensitive Supabase proxy bypasses while preserving unchecked menu defaults',()=>{
 const role=update('roles',null,{name:'Plan reader',permissions:{'menu.phacdo':true,'plan.view_students':true}}).id,user={id:'reader',role};
 const guard=(path,method='GET',input={})=>guardAccessRequest(user,new URL('http://local'+path).pathname,method,new URL('http://local'+path),input);
 guard('/api/proxy/supabase/rest/v1/customers');guard('/api/state?view=calendar');
 for(const [path,method]of [['/api/proxy/supabase/rest/v1/customers','PATCH'],['/api/proxy/supabase/rest/v1/roles','POST'],['/api/proxy/supabase/functions/v1/manage-admin-users','POST'],['/api/proxy/supabase/auth/v1/admin/users','GET'],['/api/state?view=content','GET'],['/api/orders','POST']])assert.throws(()=>guard(path,method),e=>e.status===403);
 const scoped=scopeAccessState({contents:[{id:'private'}],conversations:[{id:'chat',kind:'message'}],messages:[{conversationId:'chat'}],users:[owner]},user);assert.deepEqual(scoped.contents,[]);assert.deepEqual(scoped.messages,[]);assert.equal(scoped.users[0].email,undefined);
});
test('learner upserts check actual changes rather than requiring add, restore and email rights on every edit',async()=>{
 const {guardPlanCustomerWrite}=await import('../server/access-guard.mjs');const role=update('roles',null,{name:'Learner editor',permissions:{'menu.phacdo':true,'plan.edit_student':true}}).id,user={id:'learner-editor',role},url=new URL('http://local/api/proxy/supabase/rest/v1/customers'),old={customer_id:'C1',email:'unchanged@example.test',status:'ACTIVE',video_date:'2026-01-01',is_customized:false};
 await guardPlanCustomerWrite(user,'POST',url,{...old,customer_name:'Edited name'},async()=>[old]);
 await assert.rejects(guardPlanCustomerWrite(user,'POST',url,{customer_id:'NEW',customer_name:'New'},async()=>[]),e=>e.status===403);
 await assert.rejects(guardPlanCustomerWrite(user,'PATCH',url,{email:'different@example.test'},async()=>[old]),e=>e.status===403);
 await assert.rejects(guardPlanCustomerWrite(user,'PATCH',url,{status:'ACTIVE'},async()=>[{...old,status:'DELETED'}]),e=>e.status===403);
 await assert.rejects(guardPlanCustomerWrite(user,'PATCH',url,{video_date:'2026-02-01'},async()=>[old]),e=>e.status===403);
});
test('comment-only permission does not grant access to a normal chat thread',async()=>{
 const {put}=await import('../server/store.mjs');const role=update('roles',null,{name:'Comment moderator',permissions:{'menu.comments':true,'menu.inbox':false}}).id,user={id:'comment-only',role};
 put('conversations',{id:'comment-permission',kind:'comment'});put('conversations',{id:'chat-permission',kind:'message'});
 assert.equal(A.hasAction(user,'inbox'),true);const invoke=id=>{const url=new URL('http://local/api/conversations/'+id+'/reply');guardAccessRequest(user,url.pathname,'POST',url,{});};invoke('comment-permission');assert.throws(()=>invoke('chat-permission'),e=>e.status===403);
});
