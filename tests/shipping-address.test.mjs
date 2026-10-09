import test from 'node:test';import assert from 'node:assert/strict';
import {addressSuggestion} from '../public/shipping-address.js';
test('carrier address suggestions preserve house/street and accept new or old administrative parts',()=>{
 assert.equal(addressSuggestion('Ct12 văn phú',{ADDRESS:'Phường Hà Đông - Hà Nội'}),'Ct12 văn phú, Phường Hà Đông, Hà Nội');
 assert.equal(addressSuggestion('Số 12 Nguyễn Trãi',{ADDRESS:'P. Bến Thành - Q. 1 - TP. Hồ Chí Minh'}),'Số 12 Nguyễn Trãi, P. Bến Thành, Q. 1, TP. Hồ Chí Minh');
 assert.equal(addressSuggestion('Ct12 văn phú, Phường Hà Đông, Hà Nội',{ADDRESS:'Phường Hà Đông - Hà Nội'}),'Ct12 văn phú, Phường Hà Đông, Hà Nội');
});
