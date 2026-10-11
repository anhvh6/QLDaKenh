import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'quick-downloads-'));
const {resolveExternalAssets}=await import('../server/quick-reply-assets.mjs');
const {get}=await import('../server/store.mjs');
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPZsAAAAASUVORK5CYII=','base64');
test('cold photos download concurrently with a limit, deduplicate and keep input order; warmed photos skip downloads',async()=>{
 let active=0,peak=0,calls=0;
 const fetchAsset=async url=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,url.endsWith('1.png')?60:20));active--;return {bytes,mime:'image/png'};};
 const photos=[1,2,3,4,1].map(n=>'https://example.com/'+n+'.png');
 const ids=await resolveExternalAssets({photos},fetchAsset);assert.equal(peak,3);assert.equal(calls,4);assert.equal(ids.length,4);assert.deepEqual(ids.map(id=>get('assets',id).sourceUrl),photos.slice(0,4));
 assert.deepEqual(await resolveExternalAssets({photos},()=>{throw Error('Cache missed');}),ids);
});
test('download failure waits for in-flight work, remains retryable and rejects non-image photos',async()=>{
 let active=0;await assert.rejects(resolveExternalAssets({photos:['https://example.com/fail.png','https://example.com/slow.png']},async url=>{active++;try{await new Promise(r=>setTimeout(r,20));if(url.includes('fail'))throw Error('Offline');return {bytes,mime:'image/png'};}finally{active--;}}),/Offline/);assert.equal(active,0);
 assert.equal((await resolveExternalAssets({photos:['https://example.com/fail.png']},async()=>({bytes,mime:'image/png'}))).length,1);
 await assert.rejects(resolveExternalAssets({photos:['https://example.com/file.pdf']},async()=>({bytes:Buffer.from('%PDF-'),mime:'application/pdf'})),/photos/);
});
