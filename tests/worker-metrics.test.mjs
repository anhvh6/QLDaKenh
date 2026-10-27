import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkerMetrics} from '../server/worker-metrics.mjs';
test('worker metrics distinguish synchronous blocking from elapsed network waits',async()=>{
 let clock=0;const metrics=createWorkerMetrics(()=>clock);
 assert.equal(metrics.run('sync',()=>{clock+=50;return 123;}),123);
 let release;const job=metrics.run('async',()=>{clock+=2;return new Promise(r=>{release=r;});});clock+=1000;release('ok');assert.equal(await job,'ok');
 const rows=metrics.snapshot();assert.equal(rows[0].name,'sync');assert.equal(rows[1].maxStartBlockMs,2);assert.equal(rows[1].lastMs,1002);
 assert.throws(()=>metrics.run('sync',()=>{throw Error('failed');}));assert.equal(metrics.snapshot().find(x=>x.name==='sync').failures,1);
});
