import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
mkdirSync('test-data',{recursive:true});mkdirSync('test-results/notifications-quiet',{recursive:true});
const env={...process.env,HOST:'127.0.0.1',PORT:'4433',DATA_DIR:mkdtempSync(join(resolve('test-data'),'notifications-quiet-')),PLAN_REMOTE_CATALOG:'0'},base='http://127.0.0.1:4433';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser,stderr='';server.stderr.on('data',b=>stderr+=b);
const seed=code=>execFileSync(process.execPath,['--input-type=module','-e',`const {put,db}=await import('./server/store.mjs');${code}`],{env,stdio:'pipe'});
try{
 for(let n=0;n<200;n++){if(server.exitCode!==null)throw Error(stderr);try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const setup=await browser.newContext();
 assert.equal((await setup.request.post(base+'/api/setup',{data:{name:'QA Notifications',email:'quiet@example.test',password:'QuietNotificationsQA2026!',demo:false}})).status(),200);const storageState=await setup.storageState();await setup.close();const cases=[];
 for(const [name,width,height,touch] of [['phone',390,844,true],['desktop',1440,1000,false]]){
  seed(`db.prepare("DELETE FROM records WHERE kind='notifications'").run();for(let n=0;n<40;n++)put('notifications',{id:['copy:','copy-error:','care-message:','chat-reminder:','customer-purge:'][n%5]+n,title:'QA history '+n,body:'Historical detail '+n,route:'content',read:false});`);
  const ctx=await browser.newContext({storageState,viewport:{width,height},isMobile:touch,hasTouch:touch}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/#dashboard');const bell=p.locator('[data-action=notifications]');await bell.getAttribute('aria-label');await p.waitForFunction(()=>document.querySelector('[data-action=notifications]')?.getAttribute('aria-label')?.includes('40 chưa đọc'));
  assert.equal(await p.locator('#toast-root .toast').count(),0);assert.equal(await p.locator('.notification-list').count(),0);assert.equal(await bell.locator('.notification-dot').count(),1);
  await p.reload();await p.waitForFunction(()=>document.querySelector('[data-action=notifications]')?.getAttribute('aria-label')?.includes('40 chưa đọc'));assert.equal(await p.locator('#toast-root .toast').count(),0);
  seed("put('notifications',{id:'copy:arrived-now',title:'QA new alert',body:'New notification private detail',route:'content',read:false});");
  await p.waitForFunction(()=>document.querySelector('[data-action=notifications]')?.getAttribute('aria-label')?.includes('41 chưa đọc'));assert.equal(await p.locator('#toast-root .toast').count(),0);assert.equal(await p.getByText('New notification private detail',{exact:true}).count(),0);
  await bell.click();await p.locator('.notification-list').waitFor();assert.equal(await p.locator('.notification-item').count(),41);assert.equal(await p.getByText('New notification private detail',{exact:true}).count(),1);await p.locator('.notification-item').filter({hasText:'QA new alert'}).click();await p.waitForURL('**/#content');await p.getByRole('heading',{name:'Nội dung',exact:true}).waitFor();assert.equal(await p.locator('.notification-list').count(),0);
  await p.goto(base+'/#dashboard');await p.locator('[data-action=notifications]').click();await p.locator('[data-action=read-notifications]').click();await p.waitForFunction(()=>!document.querySelector('[data-action=notifications] .notification-dot'));const rows=await (await ctx.request.get(base+'/api/notifications')).json();assert.equal(rows.filter(n=>!n.read).length,0);
  await p.reload();await p.getByRole('heading',{name:'Tổng quan',exact:true}).waitFor();await p.waitForTimeout(2200);assert.equal(await p.locator('#toast-root .toast').count(),0);assert.equal(await p.locator('[data-action=notifications] .notification-dot').count(),0);assert.deepEqual(errors,[]);await p.screenshot({path:'test-results/notifications-quiet/'+name+'.png'});cases.push({name,oldAlerts:40,newAlert:true,reloadQuiet:true,detailsOnRequest:true,openTarget:true,markRead:true,passed:true});await ctx.close();
 }
 writeFileSync('test-results/notifications-quiet/report.json',JSON.stringify(cases,null,2));console.log(JSON.stringify(cases,null,2));
}finally{await browser?.close();server.kill();}
