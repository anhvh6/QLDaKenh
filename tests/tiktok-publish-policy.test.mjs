import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'tiktok-policy-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,all,saveSecret}=await import('../server/store.mjs');
const {publicationPreflight}=await import('../server/publish-preflight.mjs');
const {publish,remote}=await import('../server/connectors.mjs');
const {publicationAction}=await import('../server/domain.mjs');
const {tiktokPublishBlock,tiktokProviderMessage}=await import('../server/tiktok-publish-policy.mjs');
const owner={id:'qa',role:'owner'},channel=put('connections',{id:'tk',provider:'tiktok',name:'TikTok QA',mode:'api',status:'connected'}),video=put('assets',{type:'video',active:true});
saveSecret(channel.id,{token:'qa-token'});
test('Sandbox blocks public/unlisted without silently changing user visibility or affecting other platforms',()=>{
 for(const visibility of ['public','unlisted',undefined])assert.match(tiktokPublishBlock(channel,visibility,{TIKTOK_CLIENT_KEY:'sb-test'}),/Sandbox.*riêng tư/);
 assert.equal(tiktokPublishBlock(channel,'private',{TIKTOK_CLIENT_KEY:'sb-test'}),'');assert.equal(tiktokPublishBlock({...channel,mode:'demo'},'public',{TIKTOK_CLIENT_KEY:'sb-test'}),'');assert.equal(tiktokPublishBlock({...channel,provider:'youtube'},'public',{TIKTOK_CLIENT_KEY:'sb-test'}),'');assert.equal(tiktokPublishBlock(channel,'public',{TIKTOK_CLIENT_KEY:'production'}),'');
});
test('preflight rejects Sandbox public before preparation or enqueue; private stays an explicit choice',()=>{
 const old=process.env.TIKTOK_CLIENT_KEY;process.env.TIKTOK_CLIENT_KEY='sb-test';try{const c={id:'c',type:'video',caption:'Original video',channels:['tk'],assets:[video.id],visibility:'public'},before=all('publications').length;const r=publicationPreflight(owner,c,{immediate:true});assert.ok(r.issues.some(i=>i.code==='tiktok_public_access'));assert.equal(c.visibility,'public');assert.equal(all('publications').length,before);assert.equal(publicationPreflight(owner,{...c,visibility:'private'},{immediate:true}).ok,true);}finally{if(old===undefined)delete process.env.TIKTOK_CLIENT_KEY;else process.env.TIKTOK_CLIENT_KEY=old;}
});
test('dispatch also blocks old scheduled Sandbox public jobs before API/upload',async()=>{
 const old=process.env.TIKTOK_CLIENT_KEY,fetch=global.fetch;process.env.TIKTOK_CLIENT_KEY='sb-test';global.fetch=()=>assert.fail('No API request for known invalid privacy');try{await assert.rejects(publish(channel,{type:'video',visibility:'public',assets:[]}),/chưa được duyệt đăng công khai/);}finally{global.fetch=fetch;if(old===undefined)delete process.env.TIKTOK_CLIENT_KEY;else process.env.TIKTOK_CLIENT_KEY=old;}
});
test('provider refusal is localized while retaining the original TikTok code',async()=>{
 const fetch=global.fetch;global.fetch=async()=>Response.json({error:{code:'unaudited_client_can_only_post_to_private_accounts',message:'Please review integration guidelines'}},{status:403});try{await assert.rejects(remote('https://open.tiktokapis.com/v2/post/publish/video/init/',{method:'POST'}),e=>{assert.equal(e.providerCode,'unaudited_client_can_only_post_to_private_accounts');assert.match(e.message,/tài khoản TikTok ở chế độ riêng tư/);return true;});assert.equal(tiktokProviderMessage('other'),'');}finally{global.fetch=fetch;}
});
test('retry does not requeue a public Sandbox failure',async()=>{
 const old=process.env.TIKTOK_CLIENT_KEY;process.env.TIKTOK_CLIENT_KEY='sb-test';try{const p=put('publications',{connectionId:channel.id,status:'failed',visibility:'public'});await assert.rejects(publicationAction(owner,p.id,{action:'retry'}),/chưa được duyệt đăng công khai/);assert.equal(all('publications').find(x=>x.id===p.id).status,'failed');}finally{if(old===undefined)delete process.env.TIKTOK_CLIENT_KEY;else process.env.TIKTOK_CLIENT_KEY=old;}
});
