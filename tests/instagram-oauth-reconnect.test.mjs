import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'instagram-reconnect-'));
process.env.META_APP_ID='app';process.env.META_APP_SECRET='secret';process.env.OAUTH_BASE_URL='https://hub.example.test';
const {put,saveSecret,secret,get}=await import('../server/store.mjs');
const {finishOAuth}=await import('../server/oauth.mjs');
test('reconnect resolves only the verified Page when business asset is missing from me/accounts',async()=>{
 put('connections',{id:'ig',provider:'instagram',mode:'api',accountId:'ig-id',expectedAccount:'brand'});saveSecret('ig',{token:'old-page',pageId:'page-id'});
 put('oauth_states',{id:'state',provider:'instagram',connectionId:'ig',userId:'owner',expiresAt:Date.now()+60000});
 const previousFetch=global.fetch;let directPageRead=false,location='';
 global.fetch=async(url,options)=>{
  const u=new URL(url);let result;
  if(u.pathname.endsWith('/oauth/access_token'))result={access_token:u.searchParams.has('fb_exchange_token')?'long-user':'short-user'};
  else if(u.pathname.endsWith('/me/accounts'))result={data:[]};
  else if(u.pathname.endsWith('/page-id')){directPageRead=true;assert.equal(options.headers.Authorization,'Bearer long-user');result={id:'page-id',access_token:'new-page',instagram_business_account:{id:'ig-id',username:'brand'}};}
  else if(u.pathname.endsWith('/ig-id/subscribed_apps'))result={success:true};
  else throw Error('Unexpected request: '+u.pathname);
  return new Response(JSON.stringify(result),{status:200});
 };
 try{
  await finishOAuth({headers:{host:'hub.example.test'}},{writeHead:(status,headers)=>{location=headers.Location;},end(){}},new URL('https://hub.example.test/api/oauth/instagram/callback?state=state&code=code'));
  assert.equal(directPageRead,true);assert.match(location,/oauth=success/);assert.equal(secret('ig').token,'new-page');assert.equal(secret('ig').userToken,'long-user');assert.equal(get('connections','ig').accountId,'ig-id');
 }finally{global.fetch=previousFetch;}
});
