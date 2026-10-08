import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'crm-'));
const {put,get,db}=await import('../server/store.mjs');
const {customerContext,contextRoute}=await import('../server/customer-context.mjs');
const owner={id:'owner',role:'owner'};
put('customers',{id:'p',name:'Khách QA',learnerProgress:{stage:'CONSULTED'}});
put('conversations',{id:'c',customerId:'p',connectionId:'allowed'});
test('stored old relevant history and CRM enrich current context without failed or private messages',()=>{
 put('messages',{id:'old',conversationId:'c',direction:'incoming',text:'Mong muốn cải thiện khuôn mặt',createdAt:'2026-01-01T00:00:00Z'});
 for(let i=0;i<25;i++)put('messages',{id:'m'+i,conversationId:'c',direction:'incoming',text:'Xin chào',createdAt:`2026-02-01T00:00:${String(i).padStart(2,'0')}Z`});
 put('messages',{id:'latest',conversationId:'c',direction:'incoming',text:'Cải thiện khuôn mặt',createdAt:'2026-03-01T00:00:00Z'});
 for(const [id,extra] of [['failed',{status:'failed'}],['deleted',{deletedAt:'today'}],['note',{direction:'note'}]])put('messages',{id,conversationId:'c',direction:'outgoing',text:'SECRET',...extra});
 for(const [id,extra] of [['foreign',{connectionId:'denied'}],['group',{threadType:1}],['removed',{deletedAt:'today'}],['cleared',{clearedBefore:'2026-12-01'}]]){put('conversations',{id,customerId:'p',connectionId:'allowed',...extra});put('messages',{conversationId:id,direction:'incoming',text:'SECRET'});}
 const crm=contextRoute('/api/care/customers/p/crm','PATCH',{version:0,goals:'Học đều đặn'},owner);
 assert.equal(get('crm_profiles','p').goals,crm.goals);
 const c=customerContext('p',{conversationId:'c',allowedChannels:new Set(['allowed'])});
 assert.equal(c.customer.stage,'CONSULTED');assert.equal(c.customer.crm.goals,'Học đều đặn');assert.equal(c.history.recent.length,20);assert.ok(c.history.related.some(m=>m.id==='old'));assert.ok(!JSON.stringify(c).includes('SECRET'));
 assert.throws(()=>contextRoute('/api/care/customers/p/crm','PATCH',{version:0,goals:'overwrite'},owner),/thay đổi/);
 assert.throws(()=>contextRoute('/api/care/customers/p/context','GET',{}, {id:'viewer',role:'viewer'}),/quyền/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM crm_messages WHERE conversation_id=?').get('c').n,30);
 assert.ok(db.prepare("EXPLAIN QUERY PLAN SELECT * FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? ORDER BY json_extract(data,'$.createdAt') DESC LIMIT 600").all('c').some(r=>r.detail.includes('idx_messages_conversation_created')));
});
test('student and CRM can exist without any conversation',()=>{
 put('customers',{id:'student',name:'Không có chat'});put('study_plans',{customerId:'student',createdWithoutPayment:true,customer:{start_date:'2026-01-01',end_date:'2099-01-01',status:'ACTIVE'}});
 const c=customerContext('student');assert.equal(c.history.hasConversation,false);assert.equal(c.history.recent.length,0);assert.equal(c.learner.length,1);assert.equal(c.customer.stage,'STUDYING');
});
test('chat and CRM remain readable in a fresh server process',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',"const {get,db}=await import('./server/store.mjs');console.log(JSON.stringify({goal:get('crm_profiles','p').goals,message:get('messages','old').text,count:db.prepare('SELECT count(*) n FROM crm_messages').get().n}));"],{encoding:'utf8',env:process.env,windowsHide:true});
 assert.equal(result.status,0,result.stderr);const saved=JSON.parse(result.stdout);assert.equal(saved.goal,'Học đều đặn');assert.equal(saved.message,'Mong muốn cải thiện khuôn mặt');assert.ok(saved.count>=30);
});
