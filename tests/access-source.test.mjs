import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'access-source-'));delete process.env.PLAN_REMOTE_CATALOG;
const {readLegacyAccessSource}=await import('../server/access-source.mjs');
test('legacy metadata import uses explicit projections and authenticated read-only requests',async()=>{
 const calls=[],headers={Authorization:'Bearer test-only'},source=await readLegacyAccessSource(headers,async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>[]};});
 assert.deepEqual(Object.keys(source),['roles','permissions','mappings','users']);assert.equal(calls.length,4);assert.ok(calls.every(c=>!c.url.includes('select=*')&&c.options.headers===headers&&!c.options.method&&!c.options.body));
});
test('any failed legacy table read rejects the import rather than silently seeding or granting rights',async()=>{
 await assert.rejects(readLegacyAccessSource({},async()=>({ok:false})),e=>e.status===503);
 await assert.rejects(readLegacyAccessSource({},async()=>({ok:true,json:async()=>({error:'not a list'})})),e=>e.status===503);
});
