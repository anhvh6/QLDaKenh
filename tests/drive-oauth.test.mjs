import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'drive-oauth-'));process.env.PLAN_REMOTE_CATALOG='0';
const {db,secret,saveSecret}=await import('../server/store.mjs');
const {beginDriveOAuth,completeDriveOAuth,cancelDriveOAuth}=await import('../server/drive-oauth.mjs');
const owner={id:'oauth-owner',role:'owner'},peer={id:'oauth-peer',role:'editor'};
for(const u of [owner,peer])db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(u.id,u.id+'@example.test',u.id,u.role,'test-only');
const app={clientId:'qa-client',clientSecret:'qa-secret',redirectUri:'https://example.test/api/drive/callback'};saveSecret('drive-oauth',app);
const start=user=>new URL(beginDriveOAuth(user).url),finish=(state,extra={code:'qa-code'})=>new URL('https://example.test/api/drive/callback?'+new URLSearchParams({state,...extra}));
test('callback completes without a login cookie and saves token only for the initiating user',async()=>{
 const url=start(owner);assert.equal(url.searchParams.get('redirect_uri'),app.redirectUri);assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');assert.equal(url.searchParams.get('access_type'),'offline');
 const original=global.fetch;let requests=0;global.fetch=async(url,options)=>{if(String(url).startsWith('https://www.googleapis.com/drive/v3/about?')){assert.equal(options.headers.Authorization,'Bearer owner-access');return Response.json({user:{emailAddress:'anhvh6@gmail.com'}});}requests++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(options.body.get('redirect_uri'),app.redirectUri);assert.equal(options.body.get('client_id'),app.clientId);return Response.json({refresh_token:'owner-only-token',access_token:'owner-access'});};
 try{assert.equal((await completeDriveOAuth(finish(url.searchParams.get('state')))).ok,true);assert.equal(secret('drive-'+owner.id).refreshToken,'owner-only-token');assert.equal(secret('drive-'+owner.id).account,'anhvh6@gmail.com');assert.equal(secret('drive-'+owner.id).googleClientId,app.clientId);assert.equal(secret('drive-'+owner.id).googleClientSecret,app.clientSecret);assert.equal(secret('drive-'+peer.id).refreshToken,undefined);await assert.rejects(completeDriveOAuth(finish(url.searchParams.get('state'))),{status:403});assert.equal(requests,1);}finally{global.fetch=original;}
});
test('invalid, expired, superseded and denied states cannot exchange a token',async()=>{
 await assert.rejects(completeDriveOAuth(finish('bad-state')),{status:403});const expired=start(peer).searchParams.get('state'),key='drive-flow-'+createHash('sha256').update(expired).digest('hex');saveSecret(key,{...secret(key),expires:Date.now()-1});await assert.rejects(completeDriveOAuth(finish(expired)),{status:403});const old=start(peer).searchParams.get('state'),current=start(peer).searchParams.get('state');await assert.rejects(completeDriveOAuth(finish(old)),{status:403});await assert.rejects(completeDriveOAuth(finish(current,{error:'access_denied'})),/chưa cấp quyền/);await assert.rejects(completeDriveOAuth(finish(current)),{status:403});assert.equal(secret('drive-'+peer.id).refreshToken,undefined);
});
test('configuration changes and disabled initiating account prevent callback completion',async()=>{
 const state=start(peer).searchParams.get('state');saveSecret('drive-oauth',{...app,clientId:'changed-client'});await assert.rejects(completeDriveOAuth(finish(state)),{status:409});saveSecret('drive-oauth',app);const disabled=start(peer).searchParams.get('state');db.prepare('UPDATE users SET active=0 WHERE id=?').run(peer.id);await assert.rejects(completeDriveOAuth(finish(disabled)),{status:403});
});
test('disconnect cancels pending OAuth so a delayed callback cannot reconnect the account',async()=>{const state=start(owner).searchParams.get('state');cancelDriveOAuth(owner);await assert.rejects(completeDriveOAuth(finish(state)),{status:403});});

test('switching verified Google accounts clears previous folder',async()=>{
 saveSecret('drive-'+owner.id,{account:'other@example.test',folderId:'old-folder'});
 const state=start(owner).searchParams.get('state'),original=global.fetch;
 global.fetch=async url=>String(url).includes('/token')?Response.json({access_token:'new-access',refresh_token:'new-refresh'}):Response.json({user:{emailAddress:'anhvh6@gmail.com'}});
 try{await completeDriveOAuth(finish(state));assert.equal(secret('drive-'+owner.id).folderId,'');assert.equal(secret('drive-'+owner.id).account,'anhvh6@gmail.com');}finally{global.fetch=original;}
});
test('failed Drive identity verification preserves previous connection',async()=>{
 const before=secret('drive-'+owner.id),state=start(owner).searchParams.get('state'),original=global.fetch;
 global.fetch=async url=>String(url).includes('/token')?Response.json({access_token:'new-access',refresh_token:'new-refresh'}):Response.json({error:{message:'Drive API unavailable'}},{status:403});
 try{await assert.rejects(completeDriveOAuth(finish(state)),/Drive API unavailable/);assert.deepEqual(secret('drive-'+owner.id),before);}finally{global.fetch=original;}
});
