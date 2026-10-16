import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync} from 'node:fs';import {resolve,join} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'order-routing-'));
const {put}=await import('../server/store.mjs'),{orderRoutingState,saveOrderRouting,validateOrderTarget}=await import('../server/order-routing.mjs');
test('routing defaults list connected providers without credentials and enforce owner/version/account state',()=>{
 put('shipping_accounts',{id:'vtp',name:'Carrier',status:'connected',active:true,isDefault:true,sender:{name:'Kho gửi'}});put('pos_accounts',{id:'pos',name:'POS',shopName:'Shop QA',warehouseId:'w1',warehouseName:'Kho POS',active:true,status:'connected'});
 let state=orderRoutingState();assert.equal(state.defaultTarget,'vtp:vtp');assert.equal(state.targets.length,2);assert.ok(!JSON.stringify(state).includes('apiKey'));
 const first=saveOrderRouting({role:'owner'},{defaultTarget:'pos:pos',version:0});assert.equal(orderRoutingState().defaultTarget,'pos:pos');assert.equal(validateOrderTarget('pos:pos'),'pos:pos');
 assert.throws(()=>saveOrderRouting({role:'support'},{defaultTarget:'vtp:vtp'}),{status:403});assert.throws(()=>saveOrderRouting({role:'owner'},{defaultTarget:'vtp:vtp',version:0}),{status:409});
 saveOrderRouting({role:'owner'},{defaultTarget:'vtp:vtp',version:first.version});put('pos_accounts',{id:'pos',active:false,status:'paused'});assert.throws(()=>validateOrderTarget('pos:pos'),{status:409});
});
