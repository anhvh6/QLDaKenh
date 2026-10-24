import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'provider-recovery-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,saveSecret,dataDir}=await import('../server/store.mjs');
const {remote,publish}=await import('../server/connectors.mjs');
const {uploadSocialMedia}=await import('../server/social-media-upload.mjs');
const {mediaStageRequest}=await import('../server/media-stage-request.mjs');
mkdirSync(join(dataDir,'uploads'),{recursive:true});writeFileSync(join(dataDir,'uploads','asset_recovery.mp4'),'test-video');
const asset=put('assets',{id:'recovery',type:'video',mime:'video/mp4',url:'/uploads/asset_recovery.mp4'});
const blob={$type:'blob',ref:{$link:'processed-cid'},mimeType:'video/mp4',size:10};
test('Bluesky reuses processed blob from HTTP 409 instead of failing or posting twice',async()=>{
 const previous=global.fetch;let uploads=0;
 try{global.fetch=async(url)=>{if(url.startsWith('https://plc.directory'))return Response.json({service:[{id:'#atproto_pds',serviceEndpoint:'https://qa.bsky.network'}]});if(url.includes('getServiceAuth'))return Response.json({token:'qa'});uploads++;return Response.json({error:'already_exists',message:'Video already processed',jobStatus:{jobId:'job',state:'JOB_STATE_COMPLETED',blob}},{status:409});};
 const result=await uploadSocialMedia({provider:'bluesky',accountId:'did:plc:qa'},{type:'video',assets:[asset.id]},'test',remote);assert.equal(result.video.ref.$link,'processed-cid');assert.equal(uploads,1);
 }finally{global.fetch=previous;}
});
test('Bluesky error with a job ID resumes status reads and never reuploads',async()=>{
 let uploads=0,reads=0;const request=async(url)=>{if(url.startsWith('https://plc.directory'))return {service:[{id:'#atproto_pds',serviceEndpoint:'https://qa.bsky.network'}]};if(url.includes('getServiceAuth'))return {token:'qa'};if(url.includes('uploadVideo')){uploads++;throw Object.assign(Error('Video already processed'),{providerStatus:409,providerData:{error:'already_exists',jobStatus:{jobId:'job',error:'already_exists'}}});}reads++;return {jobStatus:{blob}};};
 const result=await uploadSocialMedia({provider:'bluesky',accountId:'did:plc:qa'},{type:'video',assets:[asset.id]},'test',request);assert.ok(result.video);assert.equal(uploads,1);assert.equal(reads,1);
});
test('transient media failures retry boundedly; permanent errors do not retry',async()=>{
 let calls=0;const result=await mediaStageRequest(async()=>{if(++calls<3)throw Object.assign(Error('HTML 500'),{providerStatus:500});return {id:'media'};},'https://mastodon.social/api/v2/media',{},async()=>{});assert.equal(result.id,'media');assert.equal(calls,3);
 calls=0;await assert.rejects(mediaStageRequest(async()=>{calls++;throw Object.assign(Error('Invalid video'),{providerStatus:422});},'https://mastodon.social/api/v2/media',{},async()=>{}),e=>e.mediaStage&&e.unknown===false);assert.equal(calls,1);
 calls=0;await assert.rejects(mediaStageRequest(async()=>{calls++;throw Object.assign(Error('fetch failed'),{unknown:true});},'https://mastodon.social/api/v2/media',{},async()=>{}),e=>e.unknown===false);assert.equal(calls,3);
});
test('Facebook publishes local video with short filename and bounded UTF-8 title; caption unchanged',async()=>{
 const previous=global.fetch,c={id:'fb-recovery',provider:'facebook',accountId:'page'};saveSecret(c.id,{token:'qa'});let writes=0;
 try{global.fetch=async(url,options)=>{if(options.method==='HEAD')return new Response('',{headers:{'Content-Type':'video/mp4','Content-Length':'10'}});writes++;assert.match(url,/\/page\/videos$/);assert.ok(options.body instanceof FormData);assert.equal(options.body.get('source').name,'video.mp4');assert.equal(await options.body.get('source').text(),'test-video');assert.ok(Buffer.byteLength(options.body.get('title'))<=240);assert.equal(options.body.get('description'),'Nguyên văn nội dung');return Response.json({id:'posted'});};
 const result=await publish(c,{type:'video',assets:[asset.id],title:'Lưỡi và khuôn mặt '.repeat(40),caption:'Nguyên văn nội dung',mediaUrl:'https://example.test/video.mp4'});assert.equal(result.externalId,'posted');assert.equal(writes,1);
 }finally{global.fetch=previous;}
});
test('ambiguous Facebook final publish is never automatically repeated',async()=>{
 const previous=global.fetch;let writes=0;try{global.fetch=async(url,options)=>{if(options.method==='HEAD')return new Response('',{headers:{'Content-Type':'video/mp4'}});writes++;throw Error('Lost receipt');};await assert.rejects(publish({id:'fb-recovery',provider:'facebook',accountId:'page'},{type:'video',assets:[asset.id],mediaUrl:'https://example.test/video.mp4'}),e=>e.unknown===true);assert.equal(writes,1);}finally{global.fetch=previous;}
});
test('Mastodon final HTTP 500 remains unknown and never retries the publication blindly',async()=>{
 const previous=global.fetch,c={id:'mastodon-recovery',provider:'mastodon'};saveSecret(c.id,{token:'qa'});let writes=0;
 try{global.fetch=async()=>{writes++;return new Response('<html>Server error</html>',{status:500});};await assert.rejects(publish(c,{id:'stable-job',type:'text',caption:'QA'}),e=>e.unknown===true&&e.providerStatus===500);assert.equal(writes,1);}finally{global.fetch=previous;}
});
