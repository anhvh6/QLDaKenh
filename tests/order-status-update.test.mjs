import test from 'node:test';import assert from 'node:assert/strict';
import {posTransitions,posStatusOptions} from '../public/order-status-policy.js';
import {updatePosOrderStatus} from '../server/order-status-update.mjs';
for(const [from,targets] of Object.entries(posTransitions))for(const target of targets)test(`POS ${from} → ${target} respects policy and commits only after read back`,async()=>{
 let remote={status:Number(from)},op,commits=0,writes=0;
 const option=posStatusOptions(remote).find(o=>o.status===target);
 const call=()=>updatePosOrderStatus({input:{status:target,expectedStatus:Number(from)},read:async()=>({...remote}),write:async status=>{assert.equal(commits,0);remote.status=status;writes++;},commit:async row=>{assert.equal(row.status,target);commits++;},journal:{get:()=>op,set:v=>op=v}});
 if(option.reason){await assert.rejects(call);assert.equal(writes,0);assert.equal(commits,0);}else{await call();assert.equal(commits,1);assert.equal(writes,1);assert.equal(op.state,'done');await call();assert.equal(writes,1);}
});
test('carrier-controlled delivery, stale requests and direct carrier orders never write',async()=>{
 for(const [remote,input,directCarrier] of [[{status:9,partner:{extend_code:'TRACK'}},{status:2,expectedStatus:9},false],[{status:2,partner:{extend_code:'TRACK'}},{status:3,expectedStatus:2},false],[{status:9,partner:{extend_code:'TRACK',partner_status:'on_the_way'}},{status:6,expectedStatus:9},false],[{status:1},{status:8,expectedStatus:0},false],[{status:1},{status:8,expectedStatus:1},true]]){
  let writes=0;await assert.rejects(()=>updatePosOrderStatus({input,read:async()=>remote,write:async()=>writes++,commit:async()=>assert.fail('must not commit'),directCarrier,journal:{get:()=>null,set:()=>{}}}));assert.equal(writes,0);
 }
});
test('uncertain writes are reconciled by read only, never blindly retried',async()=>{
 let remote={status:1},op,writes=0,commits=0;
 const call=()=>updatePosOrderStatus({input:{status:8,expectedStatus:1},read:async()=>({...remote}),write:async()=>{writes++;throw Object.assign(Error('timeout'),{unknown:true});},commit:async()=>commits++,journal:{get:()=>op,set:v=>op=v}});
 await assert.rejects(call,/timeout/);assert.equal(op.state,'unknown');await assert.rejects(call,/Chưa xác minh/);assert.equal(writes,1);assert.equal(commits,0);
 remote.status=8;await call();assert.equal(writes,1);assert.equal(op.state,'done');assert.ok(commits>0);
});
test('read-back mismatch and post-acknowledgement failure do not commit local state',async()=>{
 for(const readFailure of [false,true]){let reads=0,op,commits=0;await assert.rejects(()=>updatePosOrderStatus({input:{status:8,expectedStatus:1},read:async()=>{if(++reads>1&&readFailure)throw Error('read failed');return {status:1};},write:async()=>{},commit:async()=>commits++,journal:{get:()=>op,set:v=>op=v}}));assert.equal(commits,0);assert.equal(op.state,'unknown');}
});
test('POS cancellation remains pending until carrier acknowledgement',async()=>{
 let status=9;const result=await updatePosOrderStatus({input:{status:6,expectedStatus:9},read:async()=>({status,partner:{extend_code:'TRACK',partner_status:'waiting'}}),write:async value=>status=value,commit:async()=>{},journal:{get:()=>null,set:()=>{}}});assert.equal(result.carrierPending,true);
});
