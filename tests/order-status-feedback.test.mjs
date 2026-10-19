import test from 'node:test';
import assert from 'node:assert/strict';
import {orderStatusFeedback} from '../public/order-status-feedback.js';
test('requested status appears immediately and clears on rejection without mutating an order',async()=>{
 const feedback=orderStatusFeedback(),order={id:'o',status:'confirmed'};
 let reject;const request=new Promise((_,r)=>reject=r),pending=feedback.start(order.id,8);
 assert.equal(feedback.get(order.id).status,'packing');assert.equal(order.status,'confirmed');
 assert.throws(()=>feedback.start(order.id,9),/đang đồng bộ/);
 const run=request.catch(()=>feedback.finish(order.id,pending));reject(Error('POS rejected'));await run;
 assert.equal(feedback.get(order.id),undefined);assert.equal(order.status,'confirmed');
 const next=feedback.start(order.id,9);feedback.finish(order.id,pending);assert.equal(feedback.get(order.id),next);
 feedback.finish(order.id,next);assert.equal(feedback.get(order.id),undefined);
});
