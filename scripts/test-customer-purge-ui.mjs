import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});
const env={...process.env,PORT:'4421',DATA_DIR:mkdtempSync(join(resolve('test-data'),'purge-ui-')),PLAN_REMOTE_CATALOG:'0'},base='http://127.0.0.1:4421';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Purge QA');await page.getByLabel('Email',{exact:true}).fill('purge@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('PurgeUI2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put}=await import('./server/store.mjs');put('connections',{id:'qa',name:'QA',provider:'facebook',mode:'demo',status:'connected'});put('customers',{id:'learner',name:'Học viên QA',learnerProgress:{stage:'CONSULTED',manualOverride:true}});put('conversations',{id:'chat',connectionId:'qa',customerId:'learner',kind:'message',threadType:0,status:'open',lastMessage:'QA',lastAt:new Date().toISOString()});`],{env,stdio:'pipe'});
 await page.reload();await page.goto(base+'/#inbox');await page.locator('.conversation-item[data-id=chat]').click();await page.locator('.chat-actions details').evaluate(el=>el.open=true);await page.getByRole('button',{name:'Xóa hội thoại',exact:true}).click();const form=page.locator('#chat-delete-form');await form.waitFor();await form.getByText('Đã tư vấn',{exact:true}).waitFor();assert.equal(await form.locator('[name=confirmStage]').isChecked(),false);await form.getByRole('button',{name:'Xác nhận xóa vĩnh viễn'}).click();assert.equal(await form.isVisible(),true);await form.locator('[name=confirmStage]').check();await page.screenshot({path:resolve('test-results/customer-purge-confirmation.png')});await form.getByRole('button',{name:'Xác nhận xóa vĩnh viễn'}).click();await form.waitFor({state:'hidden'});assert.equal(await page.locator('.conversation-item[data-id=chat]').count(),0);assert.deepEqual(errors,[]);console.log('Customer purge preview, stage consent and deletion UI passed.');
}finally{await browser?.close();server.kill();}

