import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'connection-health-'));
const {connectionFailure,recordConnectionCheck}=await import('../server/connection-health.mjs');
const {get,put,saveSecret}=await import('../server/store.mjs');
const {connectionState}=await import('../public/connection-health-model.js');
const {connectionHealthBadge,connectionHealthSummary}=await import('../public/social-health.js');
const {startOAuth,finishOAuth}=await import('../server/oauth.mjs');

test('auth, permissions, quota and transport failures are distinct',()=>{
 assert.equal(connectionFailure({providerCode:'invalid_grant',providerStatus:400}),'auth_required');
 assert.equal(connectionFailure({providerStatus:403}),'permission_required');
 assert.equal(connectionFailure({providerStatus:403,responseFormat:'html'}),'temporary_error');
 assert.equal(connectionFailure({providerStatus:429}),'rate_limited');
 assert.equal(connectionFailure({networkCode:'ETIMEDOUT'}),'temporary_error');
 assert.equal(connectionFailure({providerStatus:400}),'error');
});
test('failed checks persist even while configured status stays connected; sensitive values are redacted',()=>{
 const c=put('connections',{id:'health-google',provider:'youtube',status:'connected',mode:'api'});saveSecret(c.id,{token:'secret-qa-token'});
 recordConnectionCheck(c);recordConnectionCheck(c,{providerCode:'invalid_grant',message:'expired secret-qa-token',providerStatus:400});
 const saved=get('connections',c.id);assert.equal(saved.status,'connected');assert.equal(saved.connectionCheck.status,'auth_required');assert.ok(saved.connectionCheck.lastSuccessAt);assert.doesNotMatch(saved.connectionCheck.message,/secret-qa-token/);
 assert.match(connectionHealthBadge(saved),/Cần kết nối lại/);assert.match(connectionHealthSummary(saved),/Thành công gần nhất/);
});
test('a later successful check clears auth error but does not prove publishing permissions',()=>{
 const c=get('connections','health-google');put('connections',{...c,health:{checks:[{key:'profile',status:'error'},{key:'comments',status:'error'}]}});recordConnectionCheck(c);
 assert.equal(get('connections',c.id).health.checks.length,1);assert.equal(connectionState(get('connections',c.id)).label,'Một số chức năng bị lỗi');
 const fresh={...get('connections',c.id),health:null};assert.equal(connectionState(fresh).label,'API hoạt động');
 assert.equal(connectionState(fresh,Date.now()+86400001).label,'Chưa kiểm tra gần đây');
 assert.match(connectionHealthBadge({provider:'blogger',status:'connected',mode:'api'}),/Chưa kiểm tra gần đây/);
});
test('publishing errors remain visible independently of a successful profile check',()=>{
 const c=get('connections','health-google');recordConnectionCheck(c,{providerStatus:400,message:'bad video'},'publish');
 const saved={...get('connections',c.id),health:null,connectionCheck:{status:'ok',checkedAt:'2020-01-01'}};
 assert.equal(connectionState(saved).label,'Đăng bài cần xử lý');assert.match(connectionHealthSummary(saved),/bad video/);
});
test('Google authorization requests stay isolated from previously granted Drive scopes',()=>{
 process.env.GOOGLE_CLIENT_ID='qa-client';process.env.GOOGLE_CLIENT_SECRET='qa-secret';
 const url=new URL(startOAuth({id:'qa-owner'},{id:'health-google',provider:'youtube'},{headers:{host:'localhost:4317'}}).url);
 assert.equal(url.searchParams.get('include_granted_scopes'),'false');assert.doesNotMatch(url.searchParams.get('scope'),/drive/);assert.match(url.searchParams.get('scope'),/youtube.upload/);
});

test('consent remains valid after 15 minutes, expires after 30 and cannot be replayed',async()=>{
 const clock=Date.now,started=clock(),req={headers:{host:'localhost:4317'}},res=()=>{let location;return {writeHead:(status,headers)=>location=headers.Location,end(){},message:()=>decodeURIComponent(new URL(location,'https://qa.test').searchParams.get('message'))};};
 try{
  Date.now=()=>started;
  const make=()=>new URL(startOAuth({id:'qa-owner'},{id:'health-google',provider:'youtube'},req).url).searchParams.get('state');
  const first=make();assert.equal(get('oauth_states',first).expiresAt-started,30*60*1000);
  Date.now=()=>started+15*60*1000;const accepted=res();await finishOAuth(req,accepted,new URL('https://qa.test/api/oauth/youtube/callback?state='+first+'&error=access_denied'));assert.match(accepted.message(),/hủy cấp quyền/);
  const replay=res();await finishOAuth(req,replay,new URL('https://qa.test/api/oauth/youtube/callback?state='+first+'&error=access_denied'));assert.match(replay.message(),/đã được xử lý/);
  Date.now=()=>started;const second=make();Date.now=()=>started+30*60*1000;const expired=res();await finishOAuth(req,expired,new URL('https://qa.test/api/oauth/youtube/callback?state='+second+'&error=access_denied'));assert.match(expired.message(),/quá thời hạn/);assert.equal(get('oauth_states',second),null);
 }finally{Date.now=clock;}
});
