import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});
const env={...process.env,HOST:'127.0.0.1',PORT:'4427',DATA_DIR:mkdtempSync(join(resolve('test-data'),'inbox-perf-')),PLAN_REMOTE_CATALOG:'0'},base='http://127.0.0.1:4427';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser,page;
try{
 for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Inbox QA');await page.getByLabel('Email',{exact:true}).fill('inbox-perf@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('InboxPerfTest2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.locator('.sidebar').waitFor();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put,transaction}=await import('./server/store.mjs');transaction(()=>{put('connections',{id:'demo',name:'QA',provider:'zalo_personal',mode:'demo',status:'connected'});for(let c=0;c<40;c++){put('customers',{id:'p'+c,name:'QA '+c});put('conversations',{id:'c'+c,customerId:'p'+c,connectionId:'demo',kind:'message',unread:false,lastMessage:'Latest '+c,lastAt:new Date(1800000000000+c*1000).toISOString()});for(let i=0;i<250;i++)put('messages',{id:'m'+c+'-'+i,conversationId:'c'+c,direction:'incoming',status:'received',text:'Message '+c+' / '+i,createdAt:new Date(1700000000000+i*1000).toISOString()});}for(let i=0;i<1000;i++)put('contents',{id:'post'+i,caption:'Publishing unrelated to inbox '.repeat(100),channels:['demo'],type:'text'});});`],{env,stdio:'pipe'});
 const measure=async view=>{const start=performance.now(),r=await page.request.get(base+'/api/state?view='+view),text=await r.text();assert.equal(r.status(),200);return {ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(text),data:JSON.parse(text)};};
 const full=await measure('workspace'),compact=await measure('inbox');assert.ok(compact.bytes<full.bytes/2);assert.equal(compact.data.initialChatWindow.messages.length,60);
 const responses=[];page.on('response',r=>{if(r.url().includes('/api/state'))responses.push(r.url());});const start=performance.now();await page.goto(base+'/#inbox');await page.locator('[data-message]').first().waitFor();const firstPaintMs=Math.round(performance.now()-start);assert.ok(responses.every(u=>new URL(u).searchParams.get('view')==='inbox'));
 for(const id of ['c0','c1']){await page.locator('.conversation-item[data-id='+id+']').click();await page.locator('[data-message="m'+id.slice(1)+'-249"]').waitFor();}
 await page.locator('#reply-form textarea').fill('Draft survives switching');
 await page.route('**/api/chat/conversations/c0/live?**',async route=>{await new Promise(r=>setTimeout(r,1000));await route.continue();});
 await page.locator('.conversation-item[data-id=c0]').click();assert.ok(await page.locator('[data-message="m0-249"]').count());assert.equal(await page.getByText('Đang tải tin nhắn…',{exact:true}).count(),0);
 await page.locator('.conversation-item[data-id=c1]').click();assert.equal(await page.locator('#reply-form textarea').inputValue(),'Draft survives switching');
 await page.locator('[data-action=older-chat]').click();await page.locator('[data-message="m1-130"]').waitFor();
 await page.screenshot({path:'test-results/inbox-performance-desktop.png'});assert.deepEqual(errors,[]);
 const report={ok:true,fixture:{conversations:40,messages:10000,unrelatedPosts:1000},workspace:{ms:full.ms,bytes:full.bytes},inbox:{ms:compact.ms,bytes:compact.bytes},firstPaintMs,checks:['bounded first window','no workspace request','immediate revisit despite delayed network','draft preserved','older history']};writeFileSync('test-results/inbox-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page?.screenshot({path:'test-results/inbox-performance-failure.png'});throw error;}finally{await browser?.close();server.kill();}
