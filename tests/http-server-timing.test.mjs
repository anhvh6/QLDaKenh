import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {sendJSON} from '../server/http-json.mjs';
test('JSON responses expose app processing time for proxy comparisons, including gzip',async()=>{
 const server=http.createServer((req,res)=>{req.appStartedAt=performance.now();sendJSON(res,{value:'x'.repeat(10000)});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const encoding of ['gzip','identity']){const result=await new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port:server.address().port,headers:{'Accept-Encoding':encoding}},r=>{r.resume();r.on('end',()=>resolve(r));}).on('error',reject));assert.match(result.headers['server-timing'],/^app;dur=\d+(\.\d+)?$/);assert.equal(result.statusCode,200);}}
 finally{await new Promise(r=>server.close(r));}
});
