import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptiveDelay} from '../server/adaptive-delay.mjs';

test('light runs keep the 5 second cadence and heavy runs are spaced by a multiple of their duration',()=>{
 assert.equal(adaptiveDelay(0),5000);
 assert.equal(adaptiveDelay(200),5000);
 assert.equal(adaptiveDelay(1666),5000);
 assert.equal(adaptiveDelay(4000),12000);
 assert.equal(adaptiveDelay(10000),30000);
});

test('the delay is capped, and bad measurements fall back to the base cadence',()=>{
 assert.equal(adaptiveDelay(120000),60000);
 for(const bad of [NaN,-5,undefined,null,Infinity*0])assert.equal(adaptiveDelay(bad),5000);
 assert.equal(adaptiveDelay(4000,{floor:1000,factor:2,cap:6000}),6000);
 assert.equal(adaptiveDelay(1000,{floor:1000,factor:2,cap:6000}),2000);
});
