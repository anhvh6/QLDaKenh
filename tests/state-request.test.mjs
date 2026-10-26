import test from 'node:test';import assert from 'node:assert/strict';import {stateRequests} from '../public/state-request.js';
test('plan shell uses a workspace-compatible URL and preserves the revision',async()=>{
 let calls=0;const request=stateRequests(async url=>{calls++;const p=new URL(url,'http://qa').searchParams;assert.equal(p.get('view'),'workspace');assert.equal(p.get('shell'),'phacdo');assert.equal(p.get('since'),'revision');return {snapshotView:'phacdo'};});
 const p=new URLSearchParams({view:'phacdo',since:'revision'});await Promise.all([request(p,'owner'),request(p,'owner')]);assert.equal(calls,1);assert.equal(p.get('view'),'phacdo');
});
