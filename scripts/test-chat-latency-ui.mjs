import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});
const env={...process.env,PORT:'4423',DATA_DIR:mkdtempSync(join(resolve('test-data'),'student-overview-ui-')),PLAN_REMOTE_CATALOG:'0'},base='http://127.0.0.1:4423';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Purge QA');await page.getByLabel('Email',{exact:true}).fill('purge@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('PurgeUI2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put,db,saveSecret}=await import('./server/store.mjs');const owner=db.prepare("SELECT id FROM users WHERE role='owner'").get();put('ai_connections',{id:'qa-ai',name:'QA AI',provider:'openai',model:'qa',enabled:true});saveSecret('bot-ai:qa-ai',{token:'qa-key'});put('media_categories',{id:'qa-category-a',name:'Danh mục A',active:true,order:1});put('media_categories',{id:'qa-category-b',name:'Danh mục B',active:true,order:2});put('templates',{id:'no-guide',name:'Mẫu chưa có hướng dẫn',text:'Xin chào bạn',usageInstructions:'',enabled:true});put('chatbots',{id:'qa-bot',name:'QA Bot',aiConnectionId:'qa-ai',aiConnectionIds:['qa-ai'],stages:['NEW'],channels:['qa'],templateIds:[],enabled:false,responseDelaySeconds:0,createdBy:owner.id});put('connections',{id:'qa',name:'QA',provider:'facebook',mode:'demo',status:'connected'});put('customers',{id:'standalone',name:'Học viên độc lập QA',origin:'taophacdo',video_date:'2026-10',status:'ACTIVE',start_date:'2026-01-01',end_date:'2099-01-01'});put('customers',{id:'chat-only',name:'Khách chỉ chat QA'});put('conversations',{id:'chat',connectionId:'qa',customerId:'chat-only',kind:'message',threadType:0,status:'open',lastMessage:'Xin chào',lastAt:new Date().toISOString()});put('messages',{conversationId:'chat',direction:'incoming',status:'received',text:'Xin chào'});`],{env,stdio:'pipe'});
execFileSync(process.execPath,['--input-type=module','-e',`const {put}=await import('./server/store.mjs');for(let i=0;i<30;i++){put('customers',{id:'p'+i,name:'Khách kiểm thử '+i});put('conversations',{id:'c'+i,customerId:'p'+i,connectionId:'qa',kind:'message',status:'open',lastMessage:'Tin QA',lastAt:new Date().toISOString()});}`],{env,stdio:'pipe'});
await page.reload();await page.goto(base+'/#inbox');
await page.locator('[data-action="open-conversation"][data-id="chat"]').click();
const box=page.locator('#reply-form textarea');await box.fill('Bản nháp đang gõ');await box.focus();
// Hold full state refreshes: the active conversation must still update independently.
await page.route('**/api/state',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Full state unavailable in QA"}'}));
execFileSync(process.execPath,['--input-type=module','-e',`const {put}=await import('./server/store.mjs');put('messages',{id:'live-incoming-ui',conversationId:'chat',direction:'incoming',status:'received',text:'Tin đến trực tiếp QA'});`],{env,stdio:'pipe'});
await page.locator('[data-message="live-incoming-ui"]').waitFor({timeout:6000});assert.equal(await box.inputValue(),'Bản nháp đang gõ');assert.equal(await box.evaluate(el=>el===document.activeElement),true);
let release;const gate=new Promise(r=>release=r);await page.route('**/api/conversations/chat/messages',async r=>{await gate;await r.continue();});
await box.fill('Tin gửi chậm kiểm thử QA');await page.locator('#reply-form [type=submit]').click();
await page.locator('[data-message^="pending:"]').waitFor({timeout:1000});assert.match(await page.locator('[data-message^="pending:"]').innerText(),/Tin gửi chậm kiểm thử QA/);
release();await page.waitForFunction(()=>[...document.querySelectorAll('[data-message]:not([data-message^="pending:"])')].some(el=>el.textContent.includes('Tin gửi chậm kiểm thử QA')),{timeout:6000});
assert.equal(await page.locator('[data-message^="pending:"]').count(),0);assert.equal(await page.locator('#reply-form textarea').inputValue(),'');
await page.screenshot({path:'test-results/chat-live-latency.png'});assert.deepEqual(errors,[]);console.log('Live incoming while typing and immediate pending/sent outgoing passed without full state refresh.');
}finally{await browser?.close();server.kill();}
