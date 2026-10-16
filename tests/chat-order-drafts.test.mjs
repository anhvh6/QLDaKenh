import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'chat-order-drafts-'));
const {put,all,get}=await import('../server/store.mjs');const {observeChatOrder,chatOrderSource}=await import('../server/chat-order-drafts.mjs');const {createOrder}=await import('../server/domain.mjs');const {orderEditorRoute}=await import('../server/order-editor.mjs');const {refreshPosShipment}=await import('../server/pos-shipment-data.mjs');
const owner={id:'owner',role:'owner'};put('customers',{id:'c',name:'Khách QA',phone:''});put('connections',{id:'ch',mode:'demo',provider:'zalo_personal',status:'connected'});const conv=put('conversations',{id:'conv',customerId:'c',connectionId:'ch',threadType:0});let index=0;
function incoming(text,extra={}){const m=put('messages',{id:'msg-'+(++index),conversationId:conv.id,direction:'incoming',text,...extra});return {m,order:observeChatOrder(conv,m)};}
test('separate phone and address messages create one empty New order, duplicate events reuse it',()=>{
 assert.equal(incoming('SĐT 0901234567').order,null);const {m,order}=incoming('Địa chỉ: 01 ngõ 191 Khương Thượng, Hà Nội');assert.equal(order.status,'draft');assert.equal(order.awaitingProducts,true);assert.equal(order.items.length,0);assert.equal(order.phone,'0901234567');assert.equal(order.sourceMessageId,m.id);assert.equal(order.sourceMessageIds.length,2);assert.equal(observeChatOrder(conv,m).id,order.id);assert.equal(all('orders').length,1);
 const corrected=incoming('Địa chỉ: 12 ngõ 4 phố Huế, Hà Nội').order;assert.equal(corrected.id,order.id);assert.ok(corrected.address.startsWith('12'));assert.equal(incoming('SĐT 0909998888').order.id,order.id);assert.equal(all('orders').length,1);
});
test('ambiguous phones, group, outbound and old contact history cannot auto-create orders',()=>{
 assert.equal(incoming('0901112222 hoặc 0903334444, 12 phố Huế, Hà Nội').order,null);
 assert.equal(observeChatOrder({...conv,threadType:1},{id:'g',direction:'incoming',text:'0901112222, 12 phố Huế, Hà Nội'}),null);
 assert.equal(observeChatOrder(conv,{id:'s',direction:'outgoing',text:'0901112222, 12 phố Huế, Hà Nội'}),null);
 const old=put('conversations',{id:'old',customerId:'c',connectionId:'ch'});put('messages',{conversationId:'old',direction:'incoming',text:'0901112222',createdAt:'2020-01-01T00:00:00Z'});const m=put('messages',{conversationId:'old',direction:'incoming',text:'12 phố Huế, Hà Nội'});assert.equal(observeChatOrder(old,m),null);
});
test('manual order from chat reuses the auto draft and keeps source identifiers',()=>{
 put('products',{id:'p',name:'Kem QA',sku:'SKU-QA',price:100000,stock:10,reserved:0,productType:'physical',active:true});const before=all('orders')[0];const o=createOrder(owner,{conversationId:conv.id,customerId:'c',phone:before.phone,address:before.address,items:[{productId:'p',quantity:1}]});assert.equal(o.id,before.id);assert.equal(o.code,before.code);assert.equal(o.items.length,1);assert.equal(o.awaitingProducts,false);assert.ok(o.sourceMessageId);assert.equal(all('orders').length,1);
});
test('editor preserves ID, validates revisions, totals, scope and locks after confirmation',()=>{
 let o=all('orders')[0],path='/api/orders/'+o.id+'/editor';const data=orderEditorRoute(path,'GET',{},owner);assert.equal(data.order.id,o.id);
 o=orderEditorRoute(path,'PATCH',{version:o.version,receiverName:'QA Người nhận',phone:'0909998888',address:'12 phố Huế, Hà Nội',items:[{productId:'p',quantity:2,price:110000}],printNote:'In QA'},owner);assert.equal(o.total,220000);assert.equal(o.printNote,'In QA');assert.equal(o.paid,0);
 assert.throws(()=>orderEditorRoute(path,'PATCH',{version:0},owner),/đã thay đổi/);assert.throws(()=>orderEditorRoute(path,'GET',{}, {id:'unassigned',role:'support'}),/chưa được phân công/);put('orders',{...o,status:'confirmed'});assert.throws(()=>orderEditorRoute(path,'PATCH',{version:get('orders',o.id).version},owner),/Chỉ sửa/);
});
test('POS shipping changes update fees/history without duplicates and preserve native carrier authority',()=>{
 const row={id:'pos-order',status:9,partner_fee:23519,updated_at:'2026-10-16T03:30:00Z',partner:{extend_code:'PKE001',partner_name:'VTP',partner_status:'received',extend_update:[{update_at:'2026-10-16T03:30:00Z',status:'received',note:'Hãng đã nhận lệnh'}]}};
 const a=refreshPosShipment('pos','o',row);assert.equal(a.fee,23519);assert.equal(a.status,'pickup_pending');assert.equal(a.history.length,1);assert.equal(refreshPosShipment('pos','o',row).version,a.version);
 const b=refreshPosShipment('pos','o',{...row,partner:{...row.partner,total_fee:24000,partner_status:'out_for_delivery'}});assert.equal(b.id,a.id);assert.equal(b.fee,24000);assert.equal(b.status,'in_transit');
 const native=put('shipments',{id:'native',orderId:'native-order',tracking:'NATIVE',carrier:'viettelpost',fee:50000,history:[{note:'Native event'}]});assert.equal(refreshPosShipment('pos','native-order',{...row,partner:{extend_code:'NATIVE'}}).version,native.version);
});
