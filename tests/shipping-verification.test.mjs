import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCarrierLink} from '../server/shipping-verification.mjs';
import {vtpRequest} from '../server/viettelpost.mjs';
const shipment={reference:'MOC-QA',sender:{inventoryId:'42'},receiver:{phone:'0901234567'},cod:0};
const detail={ORDER_NUMBER:'PKE-QA',ORDER_REFERENCE:'MOC-QA',GROUPADDRESS_ID:42,RECEIVER_FULLNAME:'QA',RECEIVER_PHONE:'+84901234567',MONEY_COLLECTION:0};
test('existing carrier shipment must match warehouse, reference, recipient and COD',()=>{
 assert.equal(verifyCarrierLink(shipment,detail,[{groupaddressId:42}],'PKE-QA'),detail);
 for(const change of [{ORDER_NUMBER:'OTHER'},{GROUPADDRESS_ID:43},{ORDER_REFERENCE:'OTHER'},{RECEIVER_PHONE:'0909999999'},{MONEY_COLLECTION:1000}])assert.throws(()=>verifyCarrierLink(shipment,{...detail,...change},[{groupaddressId:42},{groupaddressId:43}],'PKE-QA'));
});
test('API error diagnostics distinguish transport and carrier status without storing secrets',async()=>{
 await assert.rejects(vtpRequest('production','/v2/order/createOrder',{token:'private-token',body:{PASSWORD:'private-password'},fetcher:async()=>new Response(JSON.stringify({status:500,error:true,message:'System error private-token private-password'}),{status:200})}),error=>{
  assert.equal(error.unknown,true);assert.equal(error.diagnostics.httpStatus,200);assert.equal(error.diagnostics.carrierStatus,500);assert.equal(error.diagnostics.endpoint,'/v2/order/createOrder');assert.doesNotMatch(JSON.stringify({message:error.message,diagnostics:error.diagnostics}),/private-token|private-password/);return true;
 });
});
