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
await page.locator('.chat-toolbar summary').click();await page.locator('[data-chat=selection-mode]').click();
await page.locator('[data-chat-select]').first().check();
const button=page.getByRole('button',{name:'Xóa hội thoại đã chọn',exact:true});
for(const width of [1440,900,390]){
 await page.setViewportSize({width,height:900});
 await page.locator('.conversation-list').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await page.waitForFunction(()=>{const el=document.querySelector('[data-chat=bulk-delete]');if(!el)return false;const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.ok(await button.isVisible());
 const bounds=await button.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<900,'Delete stays in viewport after scrolling');
 assert.equal(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'Delete button is not covered');
 await button.click();await page.locator('#chat-delete-form').waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.locator('.chat-bulk summary').click();const menuBox=await page.locator('.chat-bulk .chat-menu-panel').boundingBox();assert.ok(menuBox.x>=0&&menuBox.x+menuBox.width<=width,'Bulk menu fits the viewport');await page.locator('.chat-bulk summary').click();await page.screenshot({path:'test-results/chat-delete-selection-'+width+'.png'});
}
await page.setViewportSize({width:1440,height:900});
await page.locator('[data-chat-select]').nth(1).check();
assert.match(await page.locator('.chat-bulk').innerText(),/2 đã chọn/);
await button.click();await page.locator('#chat-delete-form').waitFor();await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Hủy chọn hội thoại',exact:true}).click();assert.equal(await page.locator('[data-chat-select]').count(),0);assert.equal(await page.locator('.chat-bulk').count(),0);await page.route('**/api/state',route=>route.fulfill({status:502,contentType:'text/html',body:'<html>Bad Gateway</html>'}));
await page.reload();await page.getByRole('button',{name:'Thử tải lại',exact:true}).waitFor();
assert.ok(await page.getByText('Máy chủ đang quá tải hoặc tạm gián đoạn. Vui lòng thử lại.',{exact:true}).isVisible());
await page.unroute('**/api/state');await page.getByRole('button',{name:'Thử tải lại',exact:true}).click();await page.locator('.sidebar').waitFor();
assert.deepEqual(errors,[]);console.log('Single/multiple selection deletion controls visible and usable on desktop/mobile after scrolling.');
}finally{await browser?.close();server.kill();}