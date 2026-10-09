import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});
const env={...process.env,PORT:'4406',DATA_DIR:mkdtempSync(join(resolve('test-data'),'chat-ui-'))},base='http://127.0.0.1:4406';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const openMenu=async selector=>{const m=page.locator(selector);if(await m.getAttribute('open')===null)await m.locator('summary').click();};
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Chat QA');await page.getByLabel('Email',{exact:true}).fill('chat-qa@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('ChatUITest2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put,db}=await import('./server/store.mjs');const user=db.prepare('SELECT id FROM users LIMIT 1').get().id;put('connections',{id:'demo',name:'Zalo kiểm thử',provider:'zalo_personal',mode:'demo',status:'connected'});for(const [id,name,phone] of [['p1','Khách kiểm thử Mai','0900000001'],['p2','Nhóm Học viên QA',''],['p3','Người nhận Linh','0900000003']])put('customers',{id,name,phone,tags:[]});for(const [id,p,type] of [['c1','p1',0],['c2','p2',1],['c3','p3',0]]){put('conversations',{id,customerId:p,connectionId:'demo',kind:'message',threadType:type,mode:'demo',status:'open',unread:true,tags:['Cần tư vấn'],lastMessage:'Tin nhắn kiểm thử',lastAt:new Date().toISOString(),group:type?{name:'Nhóm Học viên QA',memberCount:2,members:[{id:'u1',name:'Học viên QA',role:'member'},{id:'u2',name:'Giáo viên QA',role:'owner'}]}:null});put('messages',{id:'m-'+id,conversationId:id,direction:'incoming',status:'demo',senderName:'Học viên QA',text:'Tư vấn khóa học '+id+' https://example.com/course'});}put('templates',{id:'tpl',name:'Chào mừng QA',shortcut:'chaoqa',text:'Chào {{name}}, mình có thể hỗ trợ gì?'});`],{env,stdio:'pipe'});
 await page.goto(base+'/#inbox');
 const card=page.locator('.conversation-item[data-id=c1]');await card.waitFor();
 assert.equal(await card.locator('time').evaluate(el=>getComputedStyle(el).color),'rgb(113, 72, 44)');
 await card.click();await page.locator('#reply-form[data-id=c1]').waitFor();
 await page.waitForFunction(()=>!document.querySelector('.conversation-item[data-id=c1]').classList.contains('chat-unread'));
 assert.notEqual(await card.locator('time').evaluate(el=>getComputedStyle(el).color),'rgb(113, 72, 44)');
 const row=page.locator('[data-message=m-c1]');assert.doesNotMatch(await row.locator('.message-info').innerText(),/Học viên QA|Khách kiểm thử/);
 await row.hover();const tools=row.locator('.message-tools');await tools.waitFor({state:'visible'});
 assert.equal(await tools.locator('[data-chat=forward]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.equal(await tools.locator('.message-more').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 const rb=await row.boundingBox(),tb=await tools.boundingBox();assert.ok(tb.x>=rb.x+rb.width-1,'Incoming actions beside the message');assert.ok(Math.abs(tb.y+tb.height/2-rb.y-rb.height/2)<2,'Actions vertically centered');
 await page.locator('#reply-form textarea').fill('Nội dung đang gõ');await page.locator('.chat-typing-status').getByText('Chat QA · Đang trả lời').waitFor();
 await page.locator('#reply-form textarea').fill('');await page.waitForFunction(()=>document.querySelector('.chat-typing-status').hidden);
 await row.locator('[data-chat=forward]').click();const f=page.locator('#message-forward-send');await f.waitFor();
 assert.ok(await f.locator('.forward-target .avatar').count()>=2);
 await f.locator('[name=search]').fill('hoc vien');assert.equal(await f.locator('.forward-target:visible').count(),1);
 await f.locator('[value=c2]').check();await f.locator('[name=search]').fill('Linh');await f.locator('[value=c3]').check();
 assert.match(await f.locator('.forward-count').innerText(),/Đã chọn 2/);
 await f.getByRole('button',{name:'Gửi chuyển tiếp ngay'}).click();await f.locator('.forward-result').getByText('Nhóm Học viên QA: Đã gửi',{exact:true}).waitFor();assert.equal(await f.locator('.forward-result p').count(),2);
 await page.keyboard.press('Escape');await page.locator('.conversation-item[data-id=c2]').click();
 await page.locator('#reply-form[data-id=c2]').waitFor();assert.equal(await page.locator('#reply-form textarea').inputValue(),'');
 assert.match(await page.locator('[data-message=m-c2] .message-info').innerText(),/Học viên QA/);
 assert.equal(await page.locator('.bubble-wrap.outgoing').count(),1,'Forwarded message sent without draft');
 await page.locator('.bubble-wrap.outgoing').hover();await page.screenshot({path:'test-results/chat-request-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:'test-results/chat-request-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 writeFileSync('test-results/chat-request-ui-report.json',JSON.stringify({ok:true,checks:['unread time resets on read','personal sender hidden','group sender preserved','transparent actions beside message','own typing indicator','search and multi recipient direct forwarding','no draft','no mobile overflow']},null,2));
}finally{await browser?.close();server.kill();}

