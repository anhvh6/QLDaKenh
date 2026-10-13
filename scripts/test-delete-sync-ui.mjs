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
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Purge QA');await page.getByLabel('Email',{exact:true}).fill('purge@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('PurgeUI2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put,db,saveSecret}=await import('./server/store.mjs');const owner=db.prepare("SELECT id FROM users WHERE role='owner'").get();put('ai_connections',{id:'qa-ai',name:'QA AI',provider:'openai',model:'qa',enabled:true});saveSecret('bot-ai:qa-ai',{token:'qa-key'});put('media_categories',{id:'qa-category-a',name:'Danh mục A',active:true,order:1});put('media_categories',{id:'qa-category-b',name:'Danh mục B',active:true,order:2});put('templates',{id:'no-guide',name:'Mẫu chưa có hướng dẫn',text:'Xin chào bạn',usageInstructions:'',enabled:true});put('chatbots',{id:'qa-bot',name:'QA Bot',aiConnectionId:'qa-ai',aiConnectionIds:['qa-ai'],stages:['NEW'],channels:['qa'],templateIds:[],enabled:false,responseDelaySeconds:0,createdBy:owner.id});put('connections',{id:'qa',name:'QA',provider:'facebook',mode:'demo',status:'connected'});put('customers',{id:'standalone',name:'Học viên độc lập QA',origin:'taophacdo',video_date:'2026-10',status:'ACTIVE',start_date:'2026-01-01',end_date:'2099-01-01'});put('customers',{id:'chat-only',name:'Khách chỉ chat QA'});put('conversations',{id:'chat',connectionId:'qa',customerId:'chat-only',kind:'message',threadType:0,status:'open',lastMessage:'Xin chào',lastAt:new Date().toISOString()});put('messages',{conversationId:'chat',direction:'incoming',status:'received',text:'Xin chào'});`],{env,stdio:'pipe'});
execFileSync(process.execPath,['--input-type=module','-e',`const {put}=await import('./server/store.mjs');for(let i=0;i<30;i++){put('customers',{id:'p'+i,name:'Khách kiểm thử '+i});put('conversations',{id:'c'+i,customerId:'p'+i,connectionId:'qa',kind:'message',status:'open',lastMessage:'Tin QA',lastAt:new Date().toISOString()});}`],{env,stdio:'pipe'});
await page.reload();await page.goto(base+'/#inbox');
await page.locator('[data-action="open-conversation"][data-id="chat"]').click();
const peer=await context.newPage();await peer.goto(base+'/#inbox');await peer.locator('[data-action="open-conversation"][data-id="chat"]').click();await peer.locator('#reply-form textarea').fill('Bản nháp ở thiết bị khác');
// Keep another device on an old full snapshot and with a menu open; lightweight checks must remove the deleted card anyway.
await peer.route('**/api/state',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"QA full state delayed"}'}));
await peer.locator('[data-message] .bubble').first().focus();await peer.locator('[data-message] .message-more summary').first().click();
let release;const gate=new Promise(r=>release=r);await page.route('**/api/chat/delete/preview',async r=>{await gate;await r.continue();});
await page.locator('.chat-toolbar summary').click();await page.locator('[data-chat=selection-mode]').click();await page.locator('[data-chat-select="chat"]').check();
await page.getByRole('button',{name:'Xóa hội thoại đã chọn',exact:true}).click();await page.locator('#chat-delete-loading').waitFor({timeout:1000});assert.equal(await page.locator('#chat-delete-form').count(),0,'Confirm is unavailable before preview');
release();await page.locator('#chat-delete-form').waitFor({timeout:6000});await page.locator('#chat-delete-form [type=submit]').click();
await page.waitForFunction(()=>!document.querySelector('[data-chat-select="chat"]')&&!document.querySelector('.conversation-item[data-id="chat"]'),{timeout:6000});
await peer.waitForFunction(()=>!document.querySelector('.conversation-item[data-id="chat"]')&&document.querySelector('#reply-form')?.dataset.id!=='chat',{timeout:6000});
assert.equal(await peer.locator('#reply-form[data-id="chat"]').count(),0,'Cannot reply to deleted chat');
await peer.screenshot({path:'test-results/delete-sync-peer.png'});await peer.close();assert.deepEqual(errors,[]);console.log('Immediate delete preview modal and removal on both devices passed while full state is unavailable and a message menu is open.');
}finally{await browser?.close();server.kill();}
