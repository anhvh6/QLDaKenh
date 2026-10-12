import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});
const env={...process.env,PORT:'4422',DATA_DIR:mkdtempSync(join(resolve('test-data'),'student-overview-ui-')),PLAN_REMOTE_CATALOG:'0'},base='http://127.0.0.1:4422';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Purge QA');await page.getByLabel('Email',{exact:true}).fill('purge@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('PurgeUI2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put}=await import('./server/store.mjs');put('connections',{id:'qa',name:'QA',provider:'facebook',mode:'demo',status:'connected'});put('customers',{id:'standalone',name:'Học viên độc lập QA',origin:'taophacdo',video_date:'2026-10',status:'ACTIVE',start_date:'2026-01-01',end_date:'2099-01-01'});put('customers',{id:'chat-only',name:'Khách chỉ chat QA'});put('conversations',{id:'chat',connectionId:'qa',customerId:'chat-only',kind:'message',threadType:0,status:'open',lastMessage:'Xin chào',lastAt:new Date().toISOString()});put('messages',{conversationId:'chat',direction:'incoming',status:'received',text:'Xin chào'});`],{env,stdio:'pipe'});
 await page.reload();await page.goto(base+'/#students');const standalone=page.locator('tr[data-student]').filter({hasText:'Học viên độc lập QA'}),chat=page.locator('tr[data-student]').filter({hasText:'Khách chỉ chat QA'});await standalone.waitFor();assert.equal(await standalone.getAttribute('data-stage'),'STUDYING');assert.ok((await standalone.innerText()).includes('Chưa có tin nhắn được lưu'));assert.ok((await standalone.innerText()).includes('Có phác đồ học tập'));assert.equal(await chat.getAttribute('data-stage'),'NEW');assert.ok((await chat.innerText()).includes('Có tin nhắn được lưu'));await page.locator('[data-care=stage-filter][data-id=STUDYING]').click();assert.equal(await standalone.isVisible(),true);assert.equal(await chat.isVisible(),false);await page.screenshot({path:resolve('test-results/student-overview-independent.png')});await page.goto(base+'/#inbox');await page.locator('.conversation-item[data-id=chat]').waitFor();assert.equal(await page.locator('.conversation-item').count(),1);assert.deepEqual(errors,[]);console.log('Independent learner records, progress filtering and real chat history UI passed.');

}finally{await browser?.close();server.kill();}

