import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'meta-read-'));
const {metaChatRead}=await import('../server/meta-chat-read.mjs');
const url='https://graph.facebook.com/v25.0/test/conversations?limit=1';
test('coalesces simultaneous reads, releases completed jobs, and isolates tokens',async()=>{
 let calls=0,release;const gate=new Promise(resolve=>release=resolve);
 const request=async()=>{calls++;await gate;return {data:[]};};
 const a=metaChatRead(url,{request,headers:{Authorization:'Bearer one'}}),b=metaChatRead(url,{request,headers:{Authorization:'Bearer one'}}),c=metaChatRead(url,{request,headers:{Authorization:'Bearer two'}});
 assert.equal(a,b);assert.notEqual(a,c);assert.equal(calls,2);release();await Promise.all([a,b,c]);await metaChatRead(url,{request,headers:{Authorization:'Bearer one'}});assert.equal(calls,3);
});
test('transient network failure retries one GET and can recover without duplicate import',async()=>{
 let calls=0;const result=await metaChatRead(url,{stage:'messages',request:async(_url,options)=>{assert.ok(options.signal);calls++;if(calls===1)throw Object.assign(new Error('secret transport text'),{networkCode:'ECONNRESET'});return {data:[{id:'received'}]};}});
 assert.equal(calls,2);assert.equal(result.data[0].id,'received');
});
test('persistent network failures retain safe diagnostic codes and stage',async()=>{
 let calls=0;await assert.rejects(metaChatRead(url,{stage:'conversations',request:async()=>{calls++;throw Object.assign(new Error('Bearer do-not-print'),{networkCode:'UND_ERR_CONNECT_TIMEOUT'});}}),error=>{assert.equal(error.metaReadStage,'conversations');assert.equal(error.metaReadAttempts,2);assert.match(error.message,/UND_ERR_CONNECT_TIMEOUT/);assert.ok(!error.message.includes('do-not-print'));return true;});assert.equal(calls,2);
});
test('permission errors are not retried or disguised as network failure',async()=>{
 let calls=0;const error=Object.assign(new Error('Permission denied code 190'),{providerCode:190});await assert.rejects(metaChatRead(url,{request:async()=>{calls++;throw error;}}),e=>e===error&&e.providerCode===190);assert.equal(calls,1);
 assert.throws(()=>metaChatRead('http://example.test/',{}),/không hợp lệ/);
});
