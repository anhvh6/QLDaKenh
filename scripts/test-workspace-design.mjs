// Local fixture only: verify real route rendering, responsive bounds and shared assets.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:4493';
if(!process.env.UI_TEST_EMAIL||!process.env.UI_TEST_PASSWORD)throw Error('Local fixture credentials required.');
const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.UI_TEST_EMAIL,password:process.env.UI_TEST_PASSWORD})});
if(!login.ok)throw Error('Local test login failed');
const token=login.headers.get('set-cookie')?.match(/hub_session=([^;]+)/)?.[1];
const require=createRequire(import.meta.url),{chromium}=require(resolve(process.env.UI_PLAYWRIGHT_DIR||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node','node_modules/playwright'));
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
await mkdir('outputs/evon-routes',{recursive:true});
try{for(const width of [390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:900}});
 await context.addCookies([{name:'hub_session',value:token,domain:'127.0.0.1',path:'/'}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of ['dashboard','content','calendar','media','handoffs','campaigns','comments','inbox','phacdo','products','orders','shipping','automation','reports','settings']){
  errors.length=0;await page.goto(origin+'/#'+route);await page.locator('#page').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(350);
  if(route==='phacdo')await page.frameLocator('iframe').locator('#root').waitFor();
  const result=await page.evaluate(()=>({bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth,style:!!document.querySelector('link[href*="workspace-design"]'),font:getComputedStyle(document.body).fontFamily,hasContent:document.querySelector('#page')?.textContent.trim().length>0||!!document.querySelector('#page iframe')}));
  const row={route,width,...result,errors:[...errors]};results.push(row);
  await page.screenshot({path:`outputs/evon-routes/${route}-${width}.png`});
  console.log(JSON.stringify(row));
 }
 if(width===390){await page.goto(origin+'/#orders');await page.locator('[data-order-row]').first().waitFor();if(await page.locator('[data-order-row]').first().evaluate(el=>getComputedStyle(el).display)!=='grid')throw Error('Mobile orders are not cards');}
 await context.close();
}}finally{await browser.close();await writeFile('outputs/evon-routes/results.json',JSON.stringify(results,null,2));}
const failed=results.filter(r=>r.bodyWidth>r.width+2||!r.style||!r.hasContent||r.errors.length);
if(failed.length){console.error(JSON.stringify(failed,null,2));process.exitCode=1;}
