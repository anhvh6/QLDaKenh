import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results',{recursive:true});
const base='http://127.0.0.1:4468',child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'4468',DATA_DIR:mkdtempSync(join(resolve('test-data'),'menu-ui-')),PLAN_REMOTE_CATALOG:'0'},stdio:'ignore',windowsHide:true});
let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),setup=await context.request.post(base+'/api/setup',{data:{name:'Menu QA',email:'menu@example.test',password:'MenuTest2026!',demo:false}}),auth=await setup.json();assert.equal(setup.status(),200);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/proxy/supabase/rest/v1/**',r=>r.fulfill({json:[]}));
 await page.goto(base+'/#handoffs');await page.locator('.sidebar [data-route=handoffs]').waitFor();assert.equal(await page.locator('.sidebar [data-route=handoffs]').innerText(),'YC Xử lý');
 for(const route of ['leads','courses','reply-library','chatbot','students','customers','care-admin','integration'])assert.equal(await page.locator(`.sidebar [data-route="${route}"]`).count(),0);
 assert.equal(await page.locator('[data-action=help]').count(),0);
 for(const [section,heading] of [['students','Khách hàng & học viên'],['customers','Khách hàng'],['care-admin','Đội ngũ & chăm sóc'],['integration','Tích hợp taophacdo'],['chatbot','Chatbot AI'],['reply-library','Mẫu trả lời']]){
  await page.goto(base+'/#'+section);await page.waitForURL('**/#settings');await page.locator('#page').getByRole('heading',{name:heading,exact:true}).waitFor();assert.equal(await page.locator('.tabs .tab.active').count(),1);
 }
 await page.locator('[data-action=filter][data-id=knowledge]').click();await page.locator('[data-action=new-template]').click();await page.locator('#record-form').waitFor();assert.equal(await page.locator('#record-form [name=text]').count(),1);await page.locator('#record-form [name=name]').fill('Mẫu kiểm thử menu');await page.locator('#record-form [name=text]').fill('Nội dung mẫu vẫn lưu được');await page.locator('button[form=record-form]').click();await page.getByRole('heading',{name:'Mẫu kiểm thử menu',exact:true}).waitFor();assert.ok((await (await context.request.get(base+'/api/state')).json()).templates.some(t=>t.name==='Mẫu kiểm thử menu'&&t.text==='Nội dung mẫu vẫn lưu được'));
 for(const route of ['leads','courses','help']){await page.goto(base+'/#'+route);await page.waitForURL('**/#dashboard');}
 for(const [path,method] of [['/care/courses','POST'],['/care/leads/old-id','PATCH']])assert.equal((await context.request.fetch(base+'/api'+path,{method,headers:{'X-CSRF-Token':auth.csrf},data:{}})).status(),404);
 await page.goto(base+'/#integration');await page.waitForURL('**/#settings');await page.screenshot({path:'test-results/menu-cleanup-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.locator('.mobile-bottom [data-action=menu]').click();await page.locator('.sidebar [data-route=handoffs]').click();await page.waitForURL('**/#handoffs');assert.equal(await page.locator('body.menu-open').count(),0);await page.screenshot({path:'test-results/menu-cleanup-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: compact PC/mobile navigation, five settings sections, legacy redirects, preserved template editor, removed Lead/course endpoints, no browser errors.');
}finally{await browser?.close();child.kill();}
