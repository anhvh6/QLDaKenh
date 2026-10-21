import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'social-extra-'));
process.env.OAUTH_BASE_URL='https://hub.example.test';
process.env.REDDIT_CLIENT_ID='reddit-client';process.env.REDDIT_CLIENT_SECRET='reddit-secret';
process.env.TUMBLR_CLIENT_ID='tumblr-client';process.env.TUMBLR_CLIENT_SECRET='tumblr-secret';
const {extraProfile,publishExtra,extraToken,assertIdentity}=await import('../server/social-extra.mjs');
const {startOAuth,finishOAuth,oauthConfiguration}=await import('../server/oauth.mjs');
const {secret,saveSecret,get,put,db,all}=await import('../server/store.mjs');
const req={headers:{host:'127.0.0.1:4317'}};

test('new OAuth gateways use official hosts and scoped state',async()=>{
 const original=global.fetch;
 try{
  global.fetch=async(url,options)=>{assert.equal(String(url),'https://mastodon.social/api/v1/apps');assert.equal(options.body.get('scopes'),'read:accounts write:statuses');return Response.json({client_id:'mastodon-client',client_secret:'mastodon-secret'});};
  for(const [provider,host] of [['reddit','www.reddit.com'],['tumblr','www.tumblr.com'],['mastodon','mastodon.social']]){
   const result=await startOAuth({id:'owner'},{id:`pending-${provider}`,provider},req),url=new URL(result.url);
   assert.equal(url.hostname,host);assert.equal(get('oauth_states',url.searchParams.get('state')).connectionId,`pending-${provider}`);
   assert.equal(url.searchParams.get('redirect_uri'),`https://hub.example.test/api/oauth/${provider}/callback`);
   assert.ok(!result.url.includes('secret'));
  }
  delete process.env.TUMBLR_CLIENT_SECRET;assert.deepEqual(oauthConfiguration(req).tumblr.missing,['TUMBLR_CLIENT_SECRET']);process.env.TUMBLR_CLIENT_SECRET='tumblr-secret';
 }finally{global.fetch=original;}
});
test('Bluesky app password is exchanged and replaced by encrypted session credentials',async()=>{
 const c={id:'bsky',provider:'bluesky',expectedAccount:'demo.bsky.social'};saveSecret(c.id,{token:'app-password'});let calls=0;
 const profile=await extraProfile(c,async(url,options)=>{
  calls++;if(url.endsWith('createSession')){assert.equal(JSON.parse(options.body).password,'app-password');return {did:'did:plc:demo',handle:'demo.bsky.social',accessJwt:'access',refreshJwt:'refresh'};}
  assert.equal(options.headers.Authorization,'Bearer access');return {did:'did:plc:demo',handle:'demo.bsky.social'};
 });
 assert.equal(profile.accountId,'did:plc:demo');assert.equal(calls,2);assert.equal(secret(c.id).token,'access');assert.equal(secret(c.id).refreshToken,'refresh');assert.ok(!JSON.stringify(secret(c.id)).includes('app-password'));
});
test('wrong social account never passes verification',async()=>{
 assert.throws(()=>assertIdentity({expectedAccount:'right'},{accountId:'other',handle:'wrong'}),/sai tài khoản/);
 await assert.rejects(extraProfile({id:'reddit-wrong',provider:'reddit',expectedAccount:'right'},async()=>({id:'wrong-id',name:'wrong'}),'test-token'),/sai tài khoản/);
});
test('Reddit refresh keeps refresh token when provider does not rotate it',async()=>{
 saveSecret('reddit-refresh',{token:'expired',refreshToken:'refresh',expiresAt:1});
 const token=await extraToken({id:'reddit-refresh',provider:'reddit'},async(url,options)=>{assert.equal(url,'https://www.reddit.com/api/v1/access_token');assert.equal(options.body.get('grant_type'),'refresh_token');assert.ok(options.headers.Authorization.startsWith('Basic '));return {access_token:'new',expires_in:3600};});
 assert.equal(token,'new');assert.equal(secret('reddit-refresh').refreshToken,'refresh');
});
test('publishing rejects unsupported media and missing submission acknowledgement',async()=>{
 await assert.rejects(publishExtra({provider:'bluesky'},{type:'video'},()=>assert.fail('no remote request allowed')),/chỉ hỗ trợ bài văn bản/);
 saveSecret('reddit-post',{token:'token'});
 await assert.rejects(publishExtra({id:'reddit-post',provider:'reddit',expectedAccount:'demo'},{type:'text',title:'Title',caption:'Body'},async url=>url.endsWith('/me')?{id:'id',name:'demo'}:{json:{errors:[['SUBREDDIT_NOTALLOWED','Cannot post here']]}}),/Cannot post here/);
});
test('Mastodon publishing includes stable idempotency key and respects visibility',async()=>{
 saveSecret('mastodon-post',{token:'token'});
 const result=await publishExtra({id:'mastodon-post',provider:'mastodon'},{id:'publication-1',type:'text',caption:'Xin chào',visibility:'private'},async(url,options)=>{assert.equal(url,'https://mastodon.social/api/v1/statuses');assert.equal(options.headers['Idempotency-Key'],'publication-1');assert.equal(JSON.parse(options.body).visibility,'private');return {id:'123',url:'https://mastodon.social/@demo/123'};});
 assert.equal(result.externalId,'123');
});
test('OAuth callback rejects wrong identity, consumes state, and preserves existing connections',async()=>{
 const original=global.fetch,c=put('connections',{id:'reddit-callback',name:'Expected',provider:'reddit',expectedAccount:'right',mode:'api',status:'configured'});
 const start=await startOAuth({id:'owner'},c,req),state=new URL(start.url).searchParams.get('state');let location='';
 const res={writeHead(status,headers){assert.equal(status,302);location=headers.Location;},end(){}};
 try{
  global.fetch=async url=>Response.json(String(url).endsWith('access_token')?{access_token:'wrong-token'}:{id:'wrong',name:'wrong'});
  await finishOAuth(req,res,new URL(`https://hub.example.test/api/oauth/reddit/callback?code=code&state=${state}`));
  assert.ok(location.includes('oauth=error'));assert.equal(get('oauth_states',state),null);assert.equal(get('connections',c.id).status,'configured');assert.ok(!secret(c.id).token);
 }finally{global.fetch=original;}
});
test('profile importer uses active owner, stays pending, and is idempotent',()=>{
 db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('owner','owner@example.test','Owner','owner','unused');
 const file=join(process.env.DATA_DIR,'profiles.json');writeFileSync(file,JSON.stringify([{provider:'mastodon',name:'Demo',profileUrl:'https://mastodon.social/@demo',expectedAccount:'demo@mastodon.social'}]));
 const run=apply=>{const r=spawnSync(process.execPath,['scripts/import-social-profiles.mjs','--file',file,...(apply?['--apply']:[])],{encoding:'utf8',env:process.env});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 assert.equal(run(false)[0].status,'would_add');assert.equal(run(true)[0].status,'added_pending');assert.equal(run(true)[0].status,'existing');
 const channels=all('connections').filter(c=>c.profileUrl==='https://mastodon.social/@demo');assert.equal(channels.length,1);assert.equal(channels[0].status,'configured');assert.equal(channels[0].expectedAccount,'demo@mastodon.social');
});
