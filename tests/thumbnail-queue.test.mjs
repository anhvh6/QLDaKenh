import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'thumbnail-queue-'));
const {put,dataDir}=await import('../server/store.mjs');const {mediaThumbnail}=await import('../server/media-thumbnail.mjs');const user={id:'owner',role:'owner'};
mkdirSync(join(dataDir,'uploads'),{recursive:true});
function asset(id){writeFileSync(join(dataDir,'uploads',id+'.mp4'),'test-video');return put('assets',{id,type:'video',url:'/uploads/'+id+'.mp4'});}
test('cold thumbnails respond quickly then become real files, sharing generation and limiting workers',async()=>{
 const ids=['cold-a','cold-b','cold-c'];ids.forEach(asset);const releases=[];let active=0,max=0,calls=0;
 const generate=async(source,temp)=>{active++;calls++;max=Math.max(max,active);await new Promise(resolve=>releases.push(resolve));writeFileSync(temp,'JPEG');active--;};
 const results=await Promise.all(ids.map(id=>mediaThumbnail(user,id,{generate,waitMs:1})));assert.ok(results.every(r=>r.status==='pending'&&r.fallback.toString().includes('width="2"')));for(let i=0;i<100&&calls<2;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls,2);
 await mediaThumbnail(user,ids[0],{generate,waitMs:1});assert.equal(calls,2);releases.splice(0).forEach(r=>r());for(let i=0;i<20&&calls<3;i++)await new Promise(r=>setTimeout(r,2));releases.splice(0).forEach(r=>r());for(let i=0;i<20&&active;i++)await new Promise(r=>setTimeout(r,2));
 for(const id of ids){const result=await mediaThumbnail(user,id,{generate});assert.ok(result.path&&existsSync(result.path));}assert.equal(calls,3);assert.equal(max,2);
});
test('decode failures return a distinct retryable placeholder and back off instead of respawning',async()=>{
 asset('bad-video');let calls=0;const generate=async()=>{calls++;throw Error('decode');};const first=await mediaThumbnail(user,'bad-video',{generate});assert.equal(first.status,'failed');assert.ok(first.fallback.toString().includes('width="1"'));await mediaThumbnail(user,'bad-video',{generate});assert.equal(calls,1);
});
