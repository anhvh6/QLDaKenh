import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});
const env={...process.env,PORT:'4409',PLAN_REMOTE_CATALOG:'0',DATA_DIR:mkdtempSync(join(resolve('test-data'),'chat-ui-'))},base='http://127.0.0.1:4409';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const openMenu=async selector=>{const m=page.locator(selector);if(await m.getAttribute('open')===null)await m.locator('summary').click();};
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Chat QA');await page.getByLabel('Email',{exact:true}).fill('chat-qa@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('ChatUITest2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put,db}=await import('./server/store.mjs');const user=db.prepare('SELECT id FROM users LIMIT 1').get().id;put('connections',{id:'demo',name:'Zalo kiểm thử',provider:'zalo_personal',mode:'demo',status:'connected'});for(const [id,name,phone] of [['p1','Khách kiểm thử Mai','0900000001'],['p2','Nhóm Học viên QA',''],['p3','Người nhận Linh','0900000003']])put('customers',{id,name,phone,tags:[]});for(const [id,p,type] of [['c1','p1',0],['c2','p2',1],['c3','p3',0]]){put('conversations',{id,customerId:p,externalUserId:id==='c1'?'u1':id==='c3'?'u3':'g1',connectionId:'demo',kind:'message',threadType:type,mode:'demo',status:'open',unread:true,tags:['Cần tư vấn'],lastMessage:'Tin nhắn kiểm thử',lastAt:new Date().toISOString(),group:type?{name:'Nhóm Học viên QA',memberCount:2,members:[{id:'u1',name:'Khách kiểm thử Mai',role:'member'},{id:'u3',name:'Người nhận Linh',role:'member'}]}:null});put('messages',{id:'m-'+id,conversationId:id,direction:'incoming',status:'demo',senderName:'Học viên QA',text:'Tư vấn khóa học '+id+' https://example.com/course'});}put('customers',{id:'p1',name:'Khách kiểm thử Mai',learnerProgress:{stage:'CONSULTED',manualOverride:true},tags:[]});put('templates',{id:'tpl',name:'Chào mừng QA',shortcut:'chaoqa',text:'Chào {{name}}, mình có thể hỗ trợ gì?'});`],{env,stdio:'pipe'});
 await page.goto(base+'/#inbox');await page.locator('.conversation-item[data-id=c1]').click();
 const row=page.locator('[data-message=m-c1]');await row.hover();const reaction=row.locator(':scope > .message-reaction-selector');await reaction.waitFor({state:'visible'});const rb=await row.locator('.bubble').boundingBox(),eb=await reaction.boundingBox();assert.ok(eb.y>=rb.y+rb.height-6,'Reaction below the message');
 await reaction.getByRole('button',{name:'Gửi tim',exact:true}).click();await page.locator('.message-reaction-selector.has-reactions').waitFor();
 await page.locator('.chat-head [data-care=profile]').click();await page.getByRole('heading',{name:'Nhóm chung (1)',exact:true}).waitFor();await page.locator('[data-learner=open-related]').click();await page.locator('#reply-form[data-id=c2]').waitFor();
 await page.locator('.chat-head [data-care=profile]').click();await page.getByRole('heading',{name:'Hồ sơ nhóm',exact:true}).waitFor();assert.equal(await page.locator('[data-learner=open-member]').count(),2);
 assert.equal(await page.locator('[data-learner=open-member][data-id=c1] strong').evaluate(el=>getComputedStyle(el).color),'rgb(8, 126, 139)');await page.screenshot({path:'test-results/chat-group-profile.png',fullPage:true});
 await page.locator('[data-learner=open-member][data-id=c1]').click();await page.locator('#reply-form[data-id=c1]').waitFor();
 await page.locator('.chat-head [data-care=profile]').click();await page.locator('.learner-profile-grid').waitFor();await page.locator('#modal-root [data-plan=customer]').click();
 const editor=page.frameLocator('.plan-editor-frame');try{await page.getByRole('button',{name:'Lưu',exact:true}).waitFor({timeout:8000});}catch(error){console.log(await editor.locator('body').innerText());console.log(errors);throw error;}await page.getByRole('button',{name:'Lưu',exact:true}).click();
 const preview=editor.frameLocator('.shared-plan-preview');try{await preview.getByText(/Học viên:/i).waitFor({timeout:8000});}catch(err){console.log(await editor.locator('body').innerText());console.log(errors);await page.screenshot({path:'test-results/preview-failure.png',fullPage:true});throw err;}assert.equal(await editor.locator('.plan-preview').count(),0);await page.screenshot({path:'test-results/chat-saved-plan-preview.png',fullPage:true});assert.deepEqual(errors,[]);
 writeFileSync('test-results/chat-profile-relations-report.json',JSON.stringify({ok:true,checks:['reaction below bubble','mutual groups open chat','member avatar and stage color','member opens personal chat','save from profile opens shared ClientView preview']},null,2));
}finally{await browser?.close();server.kill();}
