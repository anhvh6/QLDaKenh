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
  global.fetch=async(url,options)=>{assert.equal(String(url),'https://mastodon.social/api/v1/apps');assert.equal(options.body.get('scopes'),'read:accounts read:statuses write:statuses write:media write:favourites');return Response.json({client_id:'mastodon-client',client_secret:'mastodon-secret'});};
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
 await assert.rejects(publishExtra({provider:'reddit'},{type:'video'},()=>assert.fail('no remote request allowed')),/Định dạng/);
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

test('video publishing uploads actual bytes and attaches native media on all three providers',async()=>{
 const {mkdirSync}=await import('node:fs');const {dataDir}=await import('../server/store.mjs');mkdirSync(join(dataDir,'uploads'),{recursive:true});writeFileSync(join(dataDir,'uploads','asset_video-test.mp4'),Buffer.from('fake-video-test'));
 put('assets',{id:'video-test',url:'/uploads/asset_video-test.mp4',mime:'video/mp4',type:'video',active:true});
 for(const provider of ['mastodon','bluesky','tumblr']){
  const c={id:'video-'+provider,provider,accountId:provider==='bluesky'?'did:plc:test':'blog',expectedAccount:''};saveSecret(c.id,{token:'token',refreshToken:provider==='bluesky'?'refresh':undefined,expiresAt:Date.now()+999999});let uploaded=false;
  const r=await publishExtra(c,{id:'publication-'+provider,type:'video',caption:'Test',assets:['video-test']},async(url,opts)=>{
   if(url.startsWith('https://plc.directory/'))return {service:[{id:'#atproto_pds',serviceEndpoint:'https://test.bsky.network'}]};
   if(url.includes('getServiceAuth'))return {token:'service-token'};
   if(url.includes('app.bsky.video.uploadVideo')){uploaded=true;return {blob:{$type:'blob',ref:{$link:'cid'},mimeType:'video/mp4',size:15}};}
   if(url.endsWith('/api/v2/media')){assert.equal(await opts.body.get('file').text(),'fake-video-test');uploaded=true;return {id:'media',url:'https://media.test/video.mp4'};}
   if(url.endsWith('.uploadBlob')){assert.equal(await opts.body.text(),'fake-video-test');uploaded=true;return {blob:{$type:'blob',ref:{$link:'cid'},mimeType:'video/mp4',size:15}};}
   if(url.endsWith('.getSession'))return {did:'did:plc:test',handle:'test.bsky.social'};
   if(provider==='mastodon'){assert.deepEqual(JSON.parse(opts.body).media_ids,['media']);return {id:'post',url:'https://mastodon.social/post'};}
   if(provider==='bluesky'){assert.equal(JSON.parse(opts.body).record.embed.$type,'app.bsky.embed.video');return {uri:'at://did:plc:test/app.bsky.feed.post/post'};}
   assert.ok(opts.body instanceof FormData);assert.equal(JSON.parse(opts.body.get('json')).content[1].media.identifier,'upload');assert.equal(await opts.body.get('upload').text(),'fake-video-test');uploaded=true;return {response:{id:'post'}};
  });assert.ok(uploaded);assert.ok(r.externalId);
 }
});
