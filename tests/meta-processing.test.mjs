import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMetaProcessing,resetPublicationProcessing} from '../server/meta-processing.mjs';
import {commentReadBatch} from '../server/comment-read-batch.mjs';
test('Instagram preserves status detail and redacts media URL',()=>{
 assert.throws(()=>checkMetaProcessing({status_code:'ERROR',status:'Invalid codec at https://host/video?token=private'},'instagram'),e=>e.processingFailure.status==='ERROR'&&e.message.includes('Invalid codec')&&!e.message.includes('private')&&e.unknown===false);
 assert.throws(()=>checkMetaProcessing({status:'ERROR',error_message:'UNKNOWN'},'threads'),/UNKNOWN/);
 for(const provider of ['instagram','threads'])assert.throws(()=>checkMetaProcessing({status: 'PUBLISHED'},provider),e=>e.unknown===true);
 assert.equal(checkMetaProcessing({status_code:'FINISHED',status:'Ready'},'instagram'),'FINISHED');
});
test('explicit retry removes every stale processing field without changing content or attempts',()=>{
 const p={caption:'Keep',attempts:2,assets:['asset'],containerId:'old',childContainerIds:['old'],carouselPending:true,socialVerification:true,processingStartedAt:'old',nextCheckAt:'old',statusReadFailures:3,processingFailure:{},externalId:'old',url:'old',publishedAt:'old',container:true};
 assert.deepEqual(resetPublicationProcessing(p),{caption:'Keep',attempts:2,assets:['asset']});assert.equal(p.containerId,'old');
});
test('comment reads run concurrently within a bound and drain active tasks before error',async()=>{
 let active=0,max=0,completed=0;
 await commentReadBatch([1,2,3,4,5,6],async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;completed++;});
 assert.equal(max,3);assert.equal(completed,6);
 await assert.rejects(commentReadBatch([1,2,3,4,5],async n=>{active++;try{await new Promise(r=>setTimeout(r,5));if(n===1)throw Error('rate limit');}finally{active--;}}),/rate limit/);assert.equal(active,0);
});
