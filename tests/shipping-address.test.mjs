import test from 'node:test';import assert from 'node:assert/strict';
import {addressSuggestion} from '../public/shipping-address.js';
import {resolveCarrierAddress} from '../server/shipping-address.mjs';
test('carrier IDs resolve against new address categories, falling back to old district and ward',async()=>{
 const request=async(env,path)=>path.includes('Province')?[{PROVINCE_ID:99,PROVINCE_NAME:'Hà Nội'}]:path.includes('WardsNew')?[{WARDS_ID:100,WARDS_NAME:'Phường Hà Đông'}]:path.includes('District')?[{DISTRICT_ID:200,DISTRICT_NAME:'Quận Hà Đông'}]:[{WARDS_ID:101,WARDS_NAME:'Phường Phú La'}];
 const newer=await resolveCarrierAddress('test',{PROVINCE_ID:99,WARD_ID:100},request);assert.equal(newer.addressType,'new');assert.equal(newer.ADDRESS,'Phường Hà Đông, Hà Nội');
 const older=await resolveCarrierAddress('test',{PROVINCE_ID:99,DISTRICT_ID:200,WARD_ID:101},request);assert.equal(older.addressType,'old');assert.equal(older.ADDRESS,'Phường Phú La, Quận Hà Đông, Hà Nội');
});
test('carrier address suggestions preserve house/street and accept new or old administrative parts',()=>{
 assert.equal(addressSuggestion('Ct12 văn phú',{ADDRESS:'Phường Hà Đông - Hà Nội'}),'Ct12 văn phú, Phường Hà Đông, Hà Nội');
 assert.equal(addressSuggestion('Số 12 Nguyễn Trãi',{ADDRESS:'P. Bến Thành - Q. 1 - TP. Hồ Chí Minh'}),'Số 12 Nguyễn Trãi, P. Bến Thành, Q. 1, TP. Hồ Chí Minh');
 assert.equal(addressSuggestion('Ct12 văn phú, Phường Hà Đông, Hà Nội',{ADDRESS:'Phường Hà Đông - Hà Nội'}),'Ct12 văn phú, Phường Hà Đông, Hà Nội');
});
