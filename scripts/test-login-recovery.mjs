import {createRequire} from 'node:module';import {spawn} from 'node:child_process';import {mkdtempSync,mkdirSync} from 'node:fs';import {resolve,join} from 'node:path';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results/login-recovery',{recursive:true});const dir=mkdtempSync(join(resolve('test-data'),'login-recovery-')),base='http://127.0.0.1:4489';let browser;
const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'4489',DATA_DIR:dir,PLAN_REMOTE_CATALOG:'0'},windowsHide:true,stdio:'pipe'});
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const setup=await browser.newContext(),page=await setup.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#auth-form[data-setup=true]').waitFor();assert.equal(await page.getByText('Chưa kết nối được máy chủ',{exact:true}).count(),0);
 await page.locator('#auth-form [name=name]').fill('Login QA');await page.locator('#auth-form [name=email]').fill('login@example.test');await page.locator('#auth-form [name=password]').fill('LoginQA2026Password!');await page.locator('#auth-form [name=demo]').uncheck();await page.locator('#auth-form button[type=submit]').click();await page.locator('.overview-head').waitFor();assert.deepEqual(errors,[]);await setup.close();
 const results=[];for(const [name,width,height,touch]of [['phone',390,844,true],['fold',840,700,true],['landscape',1100,600,true],['desktop',1440,1000,false]]){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch}),p=await ctx.newPage(),faults=[];p.on('pageerror',e=>faults.push(e.message));await p.goto(base);await p.locator('#auth-form[data-setup=false]').waitFor();assert.equal(await p.getByText('Chưa kết nối được máy chủ',{exact:true}).count(),0);await p.screenshot({path:'test-results/login-recovery/'+name+'.png'});
  await p.locator('[name=email]').fill('login@example.test');await p.locator('[name=password]').fill('WrongPassword!');await p.locator('#auth-form button[type=submit]').click();await p.locator('#auth-form .form-error').filter({hasText:'Email hoặc mật khẩu'}).waitFor();await p.locator('[name=password]').fill('LoginQA2026Password!');await p.locator('#auth-form button[type=submit]').click();await p.locator('.overview-head').waitFor();
  await ctx.clearCookies();await p.reload();await p.locator('#auth-form').waitFor();assert.equal(await p.getByText('Chưa kết nối được máy chủ',{exact:true}).count(),0);assert.deepEqual(faults,[]);results.push({name,login:true,home:true,expiredSession:true});await ctx.close();
 }
 console.log(JSON.stringify({setup:true,results}));
}finally{await browser?.close();server.kill();}
