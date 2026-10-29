import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results/connection-health',{recursive:true});
const dir=mkdtempSync(join(resolve('test-data'),'health-ui-')),base='http://127.0.0.1:4491';
const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'4491',DATA_DIR:dir,PLAN_REMOTE_CATALOG:'0'},stdio:'pipe',windowsHide:true});let browser,stderr='';server.stderr.on('data',b=>stderr+=b);
try{
 for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error(stderr);try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const context=await browser.newContext();
 const setup=await context.request.post(base+'/api/setup',{data:{name:'Health QA',email:'health@example.test',password:'HealthQAPassword123!',demo:false}});assert.equal(setup.status(),200);const {csrf}=await setup.json();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put}=await import('./server/store.mjs');for(const [id,status] of [['working','ok'],['expired','auth_required'],['network','temporary_error'],['permission','permission_required'],['quota','rate_limited']])put('connections',{id:'health-'+id,name:'QA '+id,provider:'blogger',mode:'api',status:'connected',connectionCheck:{status,checkedAt:new Date().toISOString(),message:status==='ok'?'':('Kết quả QA '+status)}});put('connections',{id:'health-unchecked',name:'QA unchecked',provider:'youtube',mode:'api',status:'connected'});`],{env:{...process.env,DATA_DIR:dir},stdio:'pipe'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [name,width,height]of [['phone',390,844],['fold',840,700],['landscape',1100,700],['desktop',1440,900]]){
  await page.setViewportSize({width,height});await page.goto(base+'/#settings');await page.locator('.channel-card').first().waitFor();
  assert.match(await page.locator('[data-id="health-working"]').first().innerText(),/API hoạt động/);
  assert.match(await page.locator('[data-id="health-expired"]').first().innerText(),/Cần kết nối lại/);
  assert.match(await page.locator('[data-id="health-network"]').first().innerText(),/Lỗi kết nối tạm thời/);
  assert.match(await page.locator('[data-id="health-unchecked"]').first().innerText(),/Chưa kiểm tra gần đây/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:'test-results/connection-health/'+name+'.png',fullPage:true});
  await page.locator('.channel-card[data-id="health-expired"]').press('Enter');await page.getByRole('dialog').waitFor();await page.getByRole('dialog').locator('summary').click();assert.match(await page.getByRole('dialog').innerText(),/Kiểm tra API từng chức năng/);await page.keyboard.press('Escape');
 }
 const result=await context.request.post(base+'/api/connections/health-unchecked/test',{headers:{'X-CSRF-Token':csrf},data:{}});assert.equal(result.status(),500);
 const state=await (await context.request.get(base+'/api/state?view=workspace&shell=settings')).json();assert.equal(state.connections.find(c=>c.id==='health-unchecked').connectionCheck.status,'error');
 assert.deepEqual(errors,[]);console.log('Connection health: four viewports, details, no overflow, persisted failed API check passed.');
}finally{await browser?.close();server.kill();}
