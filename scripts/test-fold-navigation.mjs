import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results/fold-navigation',{recursive:true});
const dir=mkdtempSync(join(resolve('test-data'),'fold-')),base='http://127.0.0.1:4412';
const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'4412',DATA_DIR:dir},stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:840,height:700},isMobile:true,hasTouch:true});const page=await context.newPage();
 await page.goto(base);await page.getByLabel('Tên của bạn',{exact:true}).fill('Fold QA');await page.getByLabel('Email',{exact:true}).fill('fold@example.test');await page.getByLabel('Mật khẩu (tối thiểu 10 ký tự)',{exact:true}).fill('FoldQATest2026!');await page.getByRole('button',{name:'Tạo không gian làm việc'}).click();await page.waitForSelector('.sidebar');
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
  await page.screenshot({path:'test-results/fold-navigation/'+name+'.png'});cases.push({name,width,height,passed:true});
 }
 const desktop=await browser.newPage({viewport:{width:1280,height:900}});await desktop.goto(base);await desktop.getByLabel('Email',{exact:true}).fill('fold@example.test');await desktop.getByLabel('Mật khẩu',{exact:true}).fill('FoldQATest2026!');await desktop.getByRole('button',{name:/Đăng nhập/}).click();await desktop.waitForSelector('.sidebar');assert.equal(await desktop.locator('.mobile-bottom').isVisible(),false);assert.ok(await desktop.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().left===0));cases.push({name:'desktop-mouse',passed:true});
 writeFileSync('test-results/fold-navigation/report.json',JSON.stringify({cases},null,2));console.log(JSON.stringify(cases));
}finally{await browser?.close();server.kill();}
