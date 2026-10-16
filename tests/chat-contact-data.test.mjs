import test from 'node:test';import assert from 'node:assert/strict';import {contactAddress,contactPhones,latestContact} from '../public/chat-contact-data.js';
test('combined phone and address messages retain street numbers while removing phone metadata',()=>{
 for(const [text,address] of [['0988888609, 01 ngõ 191 khương thượng','01 ngõ 191 khương thượng'],['01 ngõ 191 Khương Thượng, SĐT: 0988888609','01 ngõ 191 Khương Thượng'],['SĐT: +84 988 888 609; Địa chỉ: 01 phố Khương Thượng','01 phố Khương Thượng'],['0988888609\n01 ngõ 191 Khương Thượng','01 ngõ 191 Khương Thượng']]){assert.equal(contactAddress(text),address);assert.deepEqual(contactPhones(text),['0988888609']);}
 assert.equal(contactAddress('0988888609'),'');assert.equal(contactAddress('Gọi 0988888609 lúc 15h'),'');assert.equal(contactAddress('01 ngõ 191 Khương Thượng'),'01 ngõ 191 Khương Thượng');
 assert.deepEqual(latestContact([{direction:'incoming',createdAt:'2026-10-16',text:'0988888609, 01 ngõ 191 khương thượng'}]),{phone:'0988888609',address:'01 ngõ 191 khương thượng'});
});
