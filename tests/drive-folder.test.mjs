import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'drive-folder-'));process.env.PLAN_REMOTE_CATALOG='0';
const {saveSecret,secret}=await import('../server/store.mjs');
const {copyRoute,normalizeDriveFolder}=await import('../server/social-copy.mjs');
const owner={id:'folder-owner',role:'owner'},peer={id:'folder-peer',role:'owner'};
const route=(path,input={},user=owner)=>copyRoute(path,'POST',input,user,new URL('https://example.com'+path));
test('accepts pasted folder IDs and Drive folder links, rejects other URLs',()=>{
 assert.equal(normalizeDriveFolder(' 1TunE27nS0ThFTwSqr-syjo12p-ZciYvE '),'1TunE27nS0ThFTwSqr-syjo12p-ZciYvE');
 assert.equal(normalizeDriveFolder('https://drive.google.com/drive/u/1/folders/folder-123?usp=sharing'),'folder-123');
 for(const value of ['https://evil.test/drive/folders/a','https://drive.google.com/file/d/a','https://drive.google.com.evil.test/drive/folders/a','a/b'])assert.throws(()=>normalizeDriveFolder(value));
});
test('existing folder errors preserve configuration and distinguish authorization from outages',async()=>{
 saveSecret('drive-oauth',{clientId:'123456-client',clientSecret:'private'});saveSecret('drive-'+owner.id,{refreshToken:'owner-refresh',folderId:'old-folder'});
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).includes('/token')?Response.json({access_token:'short-lived'}):Response.json({error:{message:'File not found'}},{status:404});
  await assert.rejects(route('/api/drive/folder',{folderId:'missing'}),error=>error.status===404&&/Chọn thư mục/.test(error.message));
  assert.equal(secret('drive-'+owner.id).folderId,'old-folder');
  globalThis.fetch=async url=>String(url).includes('/token')?Response.json({access_token:'short-lived'}):Response.json({mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:false}});
  await assert.rejects(route('/api/drive/folder',{folderId:'readonly'}),/chưa có quyền ghi/);
  globalThis.fetch=async url=>{if(String(url).includes('/token'))return Response.json({access_token:'short-lived'});assert.match(String(url),/supportsAllDrives=true/);return Response.json({mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}});};
  await route('/api/drive/folder',{folderId:'https://drive.google.com/drive/folders/new-folder'});
  assert.equal(secret('drive-'+owner.id).folderId,'new-folder');
 }finally{globalThis.fetch=original;}
});
test('picker exposes only caller short-lived token, never stored refresh token or client secret',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(options.body.get('refresh_token'),'owner-refresh');return Response.json({access_token:'short-lived'});};
  assert.deepEqual(await route('/api/drive/picker'),{appId:'123456',developerKey:'',accessToken:'short-lived'});
  await assert.rejects(route('/api/drive/picker',{},peer),/Kết nối Google Drive/);
  await assert.rejects(route('/api/drive/picker',{}, {id:'viewer',role:'viewer'}),{status:403});
 }finally{globalThis.fetch=original;}
});
