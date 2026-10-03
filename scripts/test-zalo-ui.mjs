import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});
const dir=mkdtempSync(join(resolve('test-data'),'zalo-ui-')),base='http://127.0.0.1:4405';
const env={...process.env,PORT:'4405',DATA_DIR:dir};
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<60;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Zalo UI QA');await page.getByLabel('Email',{exact:true}).fill('zalo-ui@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('ZaloUITest2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();
 execFileSync(process.execPath,['--input-type=module','-e',`const s=await import('./server/store.mjs');const z=await import('./server/zalo.mjs');s.put('connections',{id:'ui-zalo',provider:'zalo_personal',mode:'api',status:'connected',name:'Zalo kiểm thử',listenerState:'listening'});z.importFriends('ui-zalo',[{userId:'u1',displayName:'Khách Zalo UI'}]);z.ingestMessage('ui-zalo',{threadId:'u1',type:0,isSelf:false,data:{msgId:'1',ts:String(Date.now()),content:'Tin ban đầu Zalo',dName:'Khách Zalo UI'}});`],{env,stdio:'pipe'});
 await page.goto(base+'/#inbox');await page.getByText('Tin ban đầu Zalo',{exact:true}).first().waitFor();await page.locator('.conversation-item').filter({hasText:'Khách Zalo UI'}).click();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});const original=await page.locator('#reply-form').getAttribute('data-id');
  await page.locator('#reply-form textarea').fill('Bản nháp cần giữ '+width);
  execFileSync(process.execPath,['--input-type=module','-e',`const z=await import('./server/zalo.mjs');for(const [thread,msg] of [['u1','Tin mới ${width}'],['u2','Hội thoại khác ${width}']])z.ingestMessage('ui-zalo',{threadId:thread,type:0,isSelf:false,data:{msgId:'${width}',ts:String(Date.now()),content:msg,dName:thread}});`],{env,stdio:'pipe'});
  await page.locator('.bubble').getByText('Tin mới '+width,{exact:true}).waitFor({timeout:12000});
  assert.equal(await page.locator('#reply-form textarea').inputValue(),'Bản nháp cần giữ '+width);
  assert.equal(await page.locator('#reply-form').getAttribute('data-id'),original);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`test-results/zalo-realtime-${width}.png`,fullPage:true});
 }
 await page.goto(base+'/#settings');await page.getByText('Nhận tin: listening',{exact:false}).waitFor();assert.deepEqual(errors,[]);
 writeFileSync('test-results/zalo-ui-report.json',JSON.stringify({ok:true,widths:[1440,390],realtime:true,draftPreserved:true,conversationPreserved:true,errors},null,2));console.log('Zalo realtime UI passed on desktop/mobile; drafts and selected conversation preserved.');
}finally{await browser?.close();server.kill();}
