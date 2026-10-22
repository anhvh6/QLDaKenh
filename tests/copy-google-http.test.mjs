import test from 'node:test';
import assert from 'node:assert/strict';
import {copyGoogleFetch} from '../server/copy-google-http.mjs';
const network=()=>Object.assign(new TypeError('fetch failed'),{cause:{code:'ECONNRESET'}});
test('token refresh and Drive reads recover from temporary connection failures',async()=>{
 for(const [url,options] of [['https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({refresh_token:'not-real'})}],['https://www.googleapis.com/drive/v3/files/saved?fields=id',{}]]){
  let calls=0;const r=await copyGoogleFetch(url,options,'Drive',{pause:async()=>{},fetch:async()=>{if(++calls<3)throw network();return Response.json({id:'existing'});}});assert.equal(calls,3);assert.equal((await r.json()).id,'existing');
 }
});
test('transient read HTTP errors retry but permissions errors do not',async()=>{
 let calls=0;await copyGoogleFetch('https://www.googleapis.com/drive/v3/files/saved',{},'Drive',{pause:async()=>{},fetch:async()=>new Response('',{status:++calls<3?503:200})});assert.equal(calls,3);
 calls=0;const r=await copyGoogleFetch('https://www.googleapis.com/drive/v3/files/saved',{},'Drive',{fetch:async()=>{calls++;return new Response('',{status:403});}});assert.equal(calls,1);assert.equal(r.status,403);
});
test('uncertain folder creation and upload are never replayed',async()=>{
 for(const method of ['POST','PUT']){let calls=0;await assert.rejects(copyGoogleFetch('https://www.googleapis.com/drive/v3/files',{method},'Lưu Google Drive',{fetch:async()=>{calls++;throw network();}}),/Lưu Google Drive.*ECONNRESET/);assert.equal(calls,1);}
});
test('exhausted reads report a useful stage without exposing credentials or URLs',async()=>{
 let calls=0;await assert.rejects(copyGoogleFetch('https://oauth2.googleapis.com/token',{method:'POST',body:'refresh_token=private-token'},'Làm mới phiên Google Drive',{pause:async()=>{},fetch:async()=>{calls++;throw network();}}),error=>{assert.match(error.message,/Làm mới phiên Google Drive.*gián đoạn/);assert.doesNotMatch(error.message,/private-token|https:/);return true;});assert.equal(calls,3);
});
