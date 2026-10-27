import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {gunzipSync} from 'node:zlib';
import {sendJSON} from '../server/http-json.mjs';
import {mediaUsage} from '../server/media-usage.mjs';
import {nameStatuses} from '../public/chat-names.js';
test('large JSON uses negotiated gzip and preserves the payload',async()=>{
 const data={messages:Array.from({length:1000},(_,i)=>({id:i,text:'Nội dung kiểm thử chat '.repeat(8)}))};
 const server=http.createServer((req,res)=>sendJSON(res,data));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const encoding of ['gzip','gzip;q=0','identity']){const response=await new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port:server.address().port,headers:{'Accept-Encoding':encoding}},r=>{const parts=[];r.on('data',p=>parts.push(p));r.on('end',()=>resolve({headers:r.headers,bytes:Buffer.concat(parts)}));}).on('error',reject));const compressed=encoding==='gzip';assert.equal(response.headers['content-encoding'],compressed?'gzip':undefined);assert.equal(response.headers['cache-control'],'no-store');assert.deepEqual(JSON.parse((compressed?gunzipSync(response.bytes):response.bytes).toString()),data);if(compressed)assert.ok(response.bytes.length<JSON.stringify(data).length/5);}}
 finally{await new Promise(r=>server.close(r));}
});
test('media usage counts repeated and shared URLs once per event',()=>{
 const assets=[{id:'a',url:'/same'},{id:'b',url:'/same'},{id:'c',url:'/other'}],messages=[{direction:'outgoing',status:'sent',createdAt:'2026-01-01',attachments:[{assetId:'a',url:'/same'},{assetId:'a',url:'/same'}]},{direction:'incoming',status:'received',attachments:[{assetId:'c'}]},{direction:'outgoing',status:'failed',attachments:[{assetId:'c'}]}],publications=[{status:'published',publishedAt:'2026-02-01',assets:['a','a']}];
 assert.deepEqual([...mediaUsage(assets,messages,publications)], [['a',{count:2,lastAt:'2026-02-01',chatCount:1,chatLastAt:'2026-01-01'}],['b',{count:1,lastAt:'2026-01-01',chatCount:1,chatLastAt:'2026-01-01'}],['c',{count:0,lastAt:null,chatCount:0,chatLastAt:null}]]);
});
test('deleted learners do not show an active-plan nickname label',()=>{
 const S={customers:[{id:'p',learnerDeleted:true}],connections:[],chatPlanSummaries:[{customerId:'p',status:'ACTIVE',startDate:'2026-01-01',endDate:'2099-12-31'}]};
 assert.deepEqual(nameStatuses(S,{customerId:'p'}).map(r=>r.condition),['no_plan']);
});
