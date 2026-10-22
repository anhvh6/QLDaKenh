import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'publish-read-'));
const {all,put,get,saveSecret}=await import('../server/store.mjs');
const {tick}=await import('../server/domain.mjs');
const {publish}=await import('../server/connectors.mjs');
const ch=put('connections',{id:'read-retry-threads',provider:'threads',accountId:'qa',status:'connected',mode:'api'});saveSecret(ch.id,{token:'qa'});
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function fixture(){for(const p of all('publications'))put('publications',{...p,status:'cancelled'});return put('publications',{connectionId:ch.id,status:'processing',type:'video',caption:'QA',containerId:'container',processingStartedAt:new Date().toISOString(),attempts:1});}
test('status GET timeout keeps processing, backs off, then publishes exactly once without recreating media',async()=>{
 const p=fixture(),fetch=global.fetch,clock=Date.now;let reads=0,posts=0;
 try{global.fetch=async(url,options)=>{if(options.method==='POST'){posts++;assert.match(url,/threads_publish$/);return response({id:'live'});}if(url.includes('permalink'))return response({permalink:'https://www.threads.com/@qa/post/one'});if(++reads===1)throw Error('Read timeout');return response({status:'FINISHED'});};
 await tick();let saved=get('publications',p.id);assert.equal(saved.status,'processing');assert.equal(saved.statusReadFailures,1);assert.equal(posts,0);const start=saved.processingStartedAt;await tick();assert.equal(reads,1);
 Date.now=()=>Date.parse(saved.nextCheckAt)+1;await tick();saved=get('publications',p.id);assert.equal(saved.status,'published');assert.equal(saved.externalId,'live');assert.equal(saved.processingStartedAt,start);assert.equal(saved.error,'');await tick();assert.equal(posts,1);
 }finally{global.fetch=fetch;Date.now=clock;}
});
test('response body interruptions and HTTP 503 while reading status remain retryable',async()=>{
 const fetch=global.fetch;
 try{for(const fail of [()=>({text:async()=>{throw Error('Broken response');}}),()=>new Response('Unavailable',{status:503})]){const p=fixture();global.fetch=async()=>fail();await tick();assert.equal(get('publications',p.id).status,'processing');assert.equal(get('publications',p.id).statusReadFailures,1);}}finally{global.fetch=fetch;}
});
test('ambiguous publish POST stays unknown and is never automatically sent twice',async()=>{
 const p=fixture(),fetch=global.fetch;let posts=0;
 try{global.fetch=async(url,options)=>{if(options.method==='POST'){posts++;throw Error('Lost publish receipt');}return response({status:'FINISHED'});};await tick();assert.equal(get('publications',p.id).status,'unknown');await tick();assert.equal(posts,1);}finally{global.fetch=fetch;}
});
test('definitive media error fails while prolonged read failures respect original processing deadline',async()=>{
 const fetch=global.fetch;
 try{const p=fixture();global.fetch=async()=>response({status:'ERROR',error_message:'Invalid video'});await tick();assert.equal(get('publications',p.id).status,'failed');assert.match(get('publications',p.id).error,/Invalid video/);
 const q=fixture();put('publications',{...q,processingStartedAt:new Date(Date.now()-31*60000).toISOString()});global.fetch=async()=>{throw Error('Must not request expired task');};await tick();assert.equal(get('publications',q.id).status,'unknown');}finally{global.fetch=fetch;}
});
test('creating an unpublished container retries a transient failure but publishing is a separate persisted step',async()=>{
 const fetch=global.fetch;let count=0;
 try{global.fetch=async(url)=>{assert.match(url,/\/threads$/);if(++count===1)throw Error('Connection reset');return response({id:'new-container'});};const result=await publish(ch,{type:'text',caption:'QA'});assert.equal(count,2);assert.equal(result.containerId,'new-container');assert.equal(result.processing,true);}finally{global.fetch=fetch;}
});

test('Facebook ambiguous video write is reconciled by a read without another publish POST',async()=>{
 fixture();const fb=put('connections',{provider:'facebook',accountId:'page',mode:'api',status:'connected'});saveSecret(fb.id,{token:'qa'});
 const at=new Date().toISOString(),p=put('publications',{connectionId:fb.id,type:'video',status:'unknown',caption:'Exact FB video',scheduleAt:at,dispatchedAt:at,attempts:1}),old=global.fetch;
 let reads=0;global.fetch=async(url,options)=>{assert.equal(options.method,undefined);assert.match(url,/\/page\/videos/);reads++;return Response.json({data:[{id:'video-result',description:p.caption,created_time:at,permalink_url:'/reel/video-result/',status:{video_status:'ready',publishing_phase:{publish_status:'published'}}}]});};
 try{await tick();assert.equal(get('publications',p.id).status,'published');assert.equal(get('publications',p.id).attempts,1);await tick();assert.equal(reads,1);}finally{global.fetch=old;}
});
