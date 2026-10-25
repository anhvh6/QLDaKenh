import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results/fold-navigation',{recursive:true});
const dir=mkdtempSync(join(resolve('test-data'),'fold-')),base='http://127.0.0.1:4481';
const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'4481',DATA_DIR:dir},stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:840,height:700},isMobile:true,hasTouch:true});const page=await context.newPage();
 assert.equal((await context.request.post(base+'/api/setup',{data:{name:'Fold QA',email:'fold@example.test',password:'FoldQATest2026!',demo:true}})).status(),200);await page.goto(base);await page.waitForSelector('.sidebar');
 execFileSync(process.execPath,['--input-type=module','-e',`const {put}=await import('./server/store.mjs');put('connections',{id:'fold-demo',name:'Fold QA',provider:'zalo_personal',mode:'demo',status:'connected'});put('customers',{id:'fold-customer',name:'Khách QA Fold',tags:[]});put('conversations',{id:'fold-conversation',customerId:'fold-customer',connectionId:'fold-demo',kind:'message',threadType:0,mode:'demo',status:'open',unread:false,tags:[],lastMessage:'Kiểm thử bố cục',lastAt:new Date().toISOString()});put('messages',{id:'fold-message',conversationId:'fold-conversation',direction:'incoming',status:'demo',text:'Kiểm thử bố cục'});`],{env:{...process.env,DATA_DIR:dir},stdio:'pipe'});
 const cases=[];
 for(const [name,width,height]of [['phone',390,844],['fold-open',840,700],['fold-landscape',1100,600]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  assert.ok(await page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right<=1),'drawer hidden '+name);
  assert.equal(await page.locator('.mobile-bottom').isVisible(),true);
  await page.locator('.mobile-bottom [data-action=menu]').click();await page.waitForTimeout(250);
  assert.ok(await page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().left>=-1));
  await page.locator('.sidebar [data-route=settings]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.sidebar [data-route=settings]').isVisible(),true);
  await page.screenshot({path:'test-results/fold-navigation/'+name+'-menu.png'});
  await page.locator('.sidebar-toggle').click();await page.waitForTimeout(250);assert.ok(await page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right<=1));
  await page.locator('.mobile-bottom [data-action=menu]').click();await page.locator('.mobile-scrim').click({position:{x:width-20,y:100}});await page.waitForTimeout(250);assert.ok(await page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right<=1));
  await page.locator('.mobile-bottom [data-action=menu]').click();await page.locator('.sidebar [data-route=content]').click();await page.waitForTimeout(250);assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('menu-open')),false);
  await page.screenshot({path:'test-results/fold-navigation/'+name+'.png'});
  for(const route of ['dashboard','content','calendar','media','handoffs','campaigns','comments','inbox','phacdo','products','orders','shipping','automation','reports','settings']){
   await page.goto(base+'/#'+route);await page.waitForSelector('#page');await page.waitForTimeout(200);
   await page.waitForFunction(()=>document.querySelector('#page')?.innerText.trim()||document.querySelector('#page iframe'));assert.ok((await page.locator('#page').innerText()).trim()||await page.locator('#page iframe').count(),'empty '+route+' '+name);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'body overflow '+route+' '+name);
   if(route==='inbox'){
    await page.locator('.chat-toolbar summary').click();
    await page.locator('[data-chat="channel-status"]').click();
    await page.waitForSelector('#chat-channel-status');
    await page.waitForFunction(()=>document.querySelector('#chat-channel-status')?.textContent.includes('Chưa có kênh'));
    await page.screenshot({path:'test-results/fold-navigation/'+name+'-channel-status.png'});
    await page.keyboard.press('Escape');
    await page.locator('.conversation-item').first().click();await page.locator('#reply-form').waitFor();
    const list=await page.locator('.conversation-list').boundingBox(),chat=await page.locator('.chat').boundingBox(),compose=await page.locator('.chat-compose').boundingBox(),bottom=await page.locator('.mobile-bottom').boundingBox();
    assert.equal(await page.locator('.conversation-list').isVisible(),false,'selected list hidden '+name);
    assert.ok(compose.y+compose.height<=bottom.y+2,'composer behind bottom navigation '+name);
   }
   await page.screenshot({path:'test-results/fold-navigation/'+name+'-'+route+'.png'});
  }
  cases.push({name,width,height,passed:true});
 }
 const desktopContext=await browser.newContext({storageState:await context.storageState(),viewport:{width:1280,height:900}}),desktop=await desktopContext.newPage();await desktop.goto(base);await desktop.waitForSelector('.sidebar');assert.equal(await desktop.locator('.mobile-bottom').isVisible(),false);assert.ok(await desktop.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().left===0));cases.push({name:'desktop-mouse',passed:true});
 writeFileSync('test-results/fold-navigation/report.json',JSON.stringify({cases},null,2));console.log(JSON.stringify(cases));
}finally{await browser?.close();server.kill();}
