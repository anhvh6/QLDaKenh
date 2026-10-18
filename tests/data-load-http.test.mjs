import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});
process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'data-load-http-'));
const base='http://127.0.0.1:4493';
test('conditional state and notifications invalidate after writes, isolate users and avoid repeat read writes',async()=>{
 const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'4493',PLAN_REMOTE_CATALOG:'0'},stdio:'pipe',windowsHide:true});
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const bundle=await fetch(base+'/app.bundle.js');assert.equal(bundle.headers.get('content-encoding'),'gzip');const tag=bundle.headers.get('etag');assert.ok(tag);assert.equal((await fetch(base+'/app.bundle.js',{headers:{'If-None-Match':tag}})).status,304);assert.equal((await fetch(base+'/app.bundle.js',{headers:{Range:'bytes=0-20'}})).status,206);
  const setup=await fetch(base+'/api/setup',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'Load QA',email:'load@example.test',password:'LoadAudit2026!'})});
  assert.equal(setup.status,200);const user=await setup.json(),headers={Cookie:setup.headers.get('set-cookie').split(';')[0],Origin:base,'Content-Type':'application/json','X-CSRF-Token':user.csrf};
  const {put,db,stateRevision}=await import('../server/store.mjs');
  for(let i=0;i<50;i++)put('notifications',{id:'load-'+i,recipientId:user.id,title:'Test',body:'Repeated text '.repeat(40),read:false});
  const first=await (await fetch(base+'/api/state',{headers})).json();assert.ok(first.snapshotRevision);
  const unchanged=await (await fetch(base+'/api/state?since='+first.snapshotRevision,{headers})).json();assert.equal(unchanged.unchanged,true);assert.ok(JSON.stringify(unchanged).length<JSON.stringify(first).length/100);
  const notifications=await fetch(base+'/api/notifications?since=',{headers});assert.equal(notifications.headers.get('content-encoding'),'gzip');const snapshot=await notifications.json();assert.equal(snapshot.rows.filter(n=>n.id.startsWith('load-')).length,50);
  const tiny=await (await fetch(base+'/api/notifications?since='+snapshot.revision,{headers})).json();assert.equal(tiny.unchanged,true);
  assert.ok(Array.isArray(await (await fetch(base+'/api/notifications',{headers})).json()));
  put('notifications',{id:'load-new',recipientId:user.id,title:'New',read:false});
  assert.equal((await (await fetch(base+'/api/state?since='+first.snapshotRevision,{headers})).json()).unchanged,undefined);
  assert.notEqual((await (await fetch(base+'/api/notifications?since='+snapshot.revision,{headers})).json()).revision,snapshot.revision);
  assert.equal((await fetch(base+'/api/state?since='+first.snapshotRevision)).status,401);
  db.prepare('INSERT INTO users(id,name,email,role,password,active) SELECT ?,?,?,role,password,active FROM users WHERE id=?').run('load-other','Other','other@example.test',user.id);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'other@example.test',password:'LoadAudit2026!'})});assert.equal(login.status,200);
  const otherHeaders={Cookie:login.headers.get('set-cookie').split(';')[0]};
  const other=await (await fetch(base+'/api/notifications?since='+snapshot.revision,{headers:otherHeaders})).json();assert.equal(other.rows.some(n=>n.id.startsWith('load-')),false);
  const otherState=await (await fetch(base+'/api/state?since='+first.snapshotRevision,{headers:otherHeaders})).json();assert.equal(otherState.user.id,'load-other');assert.equal(otherState.unchanged,undefined);
  const mark=()=>fetch(base+'/api/notifications/read',{method:'POST',headers,body:'{}'});assert.equal((await mark()).status,200);const revision=stateRevision();assert.equal((await mark()).status,200);assert.equal(stateRevision(),revision);
  const stamp=new Date().toISOString();put('connections',{id:'dash-channel',provider:'zalo_personal',status:'connected',mode:'demo'});put('customers',{id:'dash-customer',name:'Dashboard QA'});put('conversations',{id:'dash-conv',customerId:'dash-customer',connectionId:'dash-channel',lastAt:stamp});
  for(let i=0;i<100;i++)put('messages',{id:'dash-history-'+i,conversationId:'dash-conv',direction:'outgoing',createdAt:'2026-01-01T00:00:00Z',text:'Historical body '.repeat(200)});
  put('messages',{id:'dash-last',conversationId:'dash-conv',direction:'incoming',createdAt:stamp,text:'Private message body',attachments:[{url:'https://example.test/private.jpg'}]});
  const compact=await(await fetch(base+'/api/state?view=dashboard',{headers})).json();assert.equal(compact.snapshotView,'dashboard');assert.equal(compact.messages.length,1);assert.equal(compact.messages[0].id,'dash-last');assert.equal(compact.messages[0].text,undefined);assert.equal(compact.messages[0].attachments,undefined);
  assert.equal((await(await fetch(base+'/api/state?view=dashboard&since='+compact.snapshotRevision,{headers})).json()).unchanged,true);
  const inbox=await(await fetch(base+'/api/state?view=inbox&since='+compact.snapshotRevision,{headers})).json();assert.equal(inbox.snapshotView,'inbox');assert.equal(inbox.messages.length,0);
  const workspace=await(await fetch(base+'/api/state?view=workspace',{headers})).json();assert.equal(workspace.messages.length,0);assert.equal(workspace.messageSummaries.length,1);assert.equal(workspace.messageSummaries[0].text,undefined);assert.equal(workspace.contents.length,compact.contents.length);
  const full=await(await fetch(base+'/api/state?since='+compact.snapshotRevision,{headers})).json();assert.equal(full.snapshotView,'full');assert.equal(full.messages.length,101);assert.equal(full.messages.find(m=>m.id==='dash-last').text,'Private message body');assert.ok(JSON.stringify(full).length>JSON.stringify(compact).length*5);
 }finally{server.kill();}
});
