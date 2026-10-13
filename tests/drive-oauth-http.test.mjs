import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});
const env={...process.env,PORT:'4433',DATA_DIR:mkdtempSync(join(resolve('test-data'),'drive-oauth-http-')),PLAN_REMOTE_CATALOG:'0'},base='http://127.0.0.1:4433';
test('Google callback accepts only one-time state without cookie; redirects cleanly and keeps Strict login cookie',async()=>{
 const server=spawn(process.execPath,['--import','./tests/helpers/drive-oauth-http-loader.mjs','server/index.mjs'],{env,stdio:'pipe',windowsHide:true});
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const setup=await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({name:'QA Drive',email:'qa-drive@example.test',password:'QaDriveOAuth2026!'})});assert.equal(setup.status,200);const cookie=setup.headers.get('set-cookie');assert.match(cookie,/SameSite=Strict/);const user=await setup.json(),headers={Origin:base,'Content-Type':'application/json','X-CSRF-Token':user.csrf,Cookie:cookie.split(';')[0]};
  const configured=await fetch(base+'/api/drive/config',{method:'POST',headers,body:JSON.stringify({clientId:'qa-client',clientSecret:'qa-secret',publicOrigin:'https://example.test'})});assert.equal(configured.status,200);
  const start=await fetch(base+'/api/drive/connect',{method:'POST',headers,body:'{}'});assert.equal(start.status,200);const state=new URL((await start.json()).url).searchParams.get('state');
  const callback=await fetch(base+'/api/drive/callback?'+new URLSearchParams({state,code:'test-only-code'}),{redirect:'manual'});assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/?drive=connected#settings');assert.equal(callback.headers.get('referrer-policy'),'no-referrer');
  const connected=await fetch(base+'/api/drive/config',{headers});assert.equal((await connected.json()).connected,true);
  const replay=await fetch(base+'/api/drive/callback?'+new URLSearchParams({state,code:'test-only-code'}),{redirect:'manual'});assert.equal(replay.status,403);
  const missing=await fetch(base+'/api/drive/callback');assert.equal(missing.status,403);assert.match((await missing.json()).error,/Phiên kết nối Google/);
 }finally{server.kill();}
});
