import {createRequire} from 'node:module';import {spawn,execFileSync} from 'node:child_process';import {mkdirSync,mkdtempSync} from 'node:fs';import {resolve,join} from 'node:path';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});const env={...process.env,PORT:'4423',PLAN_REMOTE_CATALOG:'0',DATA_DIR:mkdtempSync(join(resolve('test-data'),'plan-chat-ui-'))},base='http://127.0.0.1:4423';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser,page;
try{for(let i=0;i<60;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});page=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Plan QA');await page.getByLabel('Email',{exact:true}).fill('plan-ui@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('PlanUITest2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();


 await page.goto(base+'/#inbox');const rows=page.locator('.conversation-item');await rows.first().click();const initial=await page.locator('#reply-form').getAttribute('data-id');
 assert.equal(await page.locator('[data-chat-select]').count(),0);
 const height=await page.locator('.chat-head').evaluate(el=>el.getBoundingClientRect().height);assert.ok(height<=64,'desktop header '+height);
 await page.locator('.chat-actions summary').click();await page.locator('.chat-head [data-care=toggle-panel]').waitFor({state:'visible'});await page.locator('.chat-actions summary').click();
 const ids=[await rows.nth(0).getAttribute('data-id'),await rows.nth(1).getAttribute('data-id')];
 const box=await rows.nth(1).boundingBox();await page.mouse.move(box.x+80,box.y+20);await page.mouse.down();await page.mouse.move(box.x+105,box.y+20);await page.waitForTimeout(700);await page.mouse.up();assert.equal(await page.locator('[data-chat-select]').count(),0);await rows.first().click();
 await page.mouse.move(box.x+80,box.y+20);await page.mouse.down();await page.waitForTimeout(700);await page.mouse.up();await page.locator('.chat-bulk').waitFor();assert.equal(await page.locator('[data-chat-select]:checked').count(),1);assert.equal(await page.locator('#reply-form').getAttribute('data-id'),initial);
 await rows.first().click({position:{x:80,y:20}});assert.equal(await page.locator('[data-chat-select]:checked').count(),2);assert.equal(await page.locator('#reply-form').getAttribute('data-id'),initial);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);const mobileHeight=await page.locator('.chat-head').evaluate(el=>el.getBoundingClientRect().height);assert.ok(mobileHeight<=64,'mobile header '+mobileHeight);assert.ok(await page.locator('.chat-head').evaluate(el=>el.scrollWidth<=el.clientWidth),'mobile overflow');await page.screenshot({path:'test-results/compact-chat-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:950});
 await page.screenshot({path:'test-results/compact-chat-selection.png',fullPage:true});
 await page.locator('[data-chat=bulk-delete]').click();await page.locator('#chat-delete-form [type=submit]').click();for(const id of ids)await page.locator('.conversation-item[data-id="'+id+'"]').waitFor({state:'detached'});assert.equal(await page.locator('[data-chat-select]').count(),0);assert.equal(await page.locator('#reply-form').count(),0);
assert.deepEqual(errors,[]);console.log('Compact chat UI passed: desktop/mobile header, drag cancellation, long hold, multi-select, delete');
}finally{await browser?.close();server.kill();}

