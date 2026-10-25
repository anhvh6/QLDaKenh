import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('test-data',{recursive:true});mkdirSync('test-results/threads-images',{recursive:true});
const env={...process.env,HOST:'127.0.0.1',PORT:'4499',DATA_DIR:mkdtempSync(join(resolve('test-data'),'threads-ui-')),PLAN_REMOTE_CATALOG:'0'},base='http://127.0.0.1:4499';
const server=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const setup=await browser.newContext();
 assert.equal((await setup.request.post(base+'/api/setup',{data:{name:'Threads QA',email:'threads@example.test',password:'ThreadsImages2026!',demo:false}})).status(),200);const storageState=await setup.storageState();
 execFileSync(process.execPath,['--input-type=module','-e',`const {put}=await import('./server/store.mjs');put('connections',{id:'threads',provider:'threads',name:'Threads QA',accountId:'self',status:'connected',mode:'api'});put('customers',{id:'reader',name:'Reader QA'});put('conversations',{id:'comment',customerId:'reader',connectionId:'threads',kind:'comment',externalCommentId:'reply',postId:'post',postTitle:'Photo reply QA',status:'open',lastMessage:'Hello',lastAt:new Date().toISOString()});put('messages',{id:'incoming',conversationId:'comment',direction:'incoming',text:'Hello',createdAt:new Date().toISOString()});for(let i=1;i<=3;i++)put('assets',{id:'photo-'+i,name:'Photo '+i,type:i===3?'video':'image',url:'/uploads/asset_qa-'+i+'.png',scopes:['chat'],active:true,chatUsageCount:1,chatLastUsedAt:new Date().toISOString()});`],{env,stdio:'pipe'});
 const results=[];
 for(const [name,width,height,touch]of [['phone',390,844,true],['fold-open',840,700,true],['fold-landscape',1100,600,true],['desktop',1440,900,false]]){
  const context=await browser.newContext({storageState,viewport:{width,height},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#comments');await page.locator('[data-action=open-conversation][data-id=comment]').click();await page.locator('[data-action=comment-library]').click();
  await page.locator('[data-library-folder="all"]').click();
  assert.equal(await page.locator('[data-library-select="photo-3"]').count(),0);
  for(const id of ['photo-1','photo-2'])await page.locator('[data-library-select="'+id+'"]').click();
  await page.locator('[data-library-apply]').click();assert.equal(await page.locator('.comment-media-preview').count(),2);
  await page.screenshot({path:'test-results/threads-images/'+name+'.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  let posted;
  await page.route('**/conversations/comment/messages',async route=>{posted=route.request().postDataJSON();await route.fulfill({status:400,json:{error:'QA failure preserves album'}});});
  await page.locator('#reply-form [type=submit]').click();await page.getByText('QA failure preserves album',{exact:false}).first().waitFor();
  assert.deepEqual(posted.assetIds,['photo-1','photo-2']);assert.equal(await page.locator('.comment-media-preview').count(),2);assert.deepEqual(errors,[]);results.push({name,passed:true});await context.close();
 }
 console.log(JSON.stringify(results));
}finally{await browser?.close();server.kill();}
