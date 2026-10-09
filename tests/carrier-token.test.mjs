import test from 'node:test';import assert from 'node:assert/strict';
import {carrierTokenMetadata} from '../server/carrier-token.mjs';import {prepareCarrierCreation} from '../server/shipment-create.mjs';
const token=claims=>'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
test('Partner is not treated as a permission claim, but expired tokens are excluded',()=>{
 assert.equal(carrierTokenMetadata(token({UserId:14280733,Partner:-1,exp:Date.now()/1000+3600})).apiTokenReady,true);
 const api=carrierTokenMetadata(token({UserId:14280733,Partner:14280733,exp:Date.now()/1000+3600}));assert.equal(api.apiTokenReady,true);assert.equal(api.customerId,14280733);assert.equal(api.tokenKind,'shop-api');assert.equal(carrierTokenMetadata(token({Partner:10,exp:1})).apiTokenReady,false);
});
test('creation stops before carrier calls for expired tokens and supports API sessions with Partner -1',async()=>{
 await assert.rejects(prepareCarrierCreation({}, {},token({Partner:-1,exp:1}),()=>assert.fail('Must not call carrier')),/hết hạn/);
 const p={ORDER_SERVICE:'VMCH',PRODUCT_DETAIL:[]},quote={SENDER_ADDRESS:{PROVINCE_ID:1,WARD_ID:2},RECEIVER_ADDRESS:{PROVINCE_ID:3,WARD_ID:4},RESULT:[{MA_DV_CHINH:'VMCH'}]};
 const payload=await prepareCarrierCreation({environment:'production'},p,token({UserId:14280733,Partner:-1}),async()=>quote);assert.equal(payload.CUS_ID,14280733);
});
