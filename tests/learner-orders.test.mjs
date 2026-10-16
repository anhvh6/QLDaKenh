import test from 'node:test';
import assert from 'node:assert/strict';
import {learnerOrders} from '../server/learner-orders.mjs';
import {learnerOrdersHTML} from '../public/learner-orders-ui.js';
const c={id:'c',name:'Khách QA',phone:'0901234567'};
const order={id:'o',customerId:'c',code:'QA001',status:'draft',items:[{name:'Kem',quantity:2}],total:200000,createdAt:'2026-10-16T02:00:00Z',createdBy:'u'};
test('shows unpaid new orders and excludes unrelated, nonshipping and closed orders',()=>{
 const rows=learnerOrders(c,{orders:[order,...['delivered','returned','cancelled','completed'].map(status=>({...order,id:status,status})),{...order,id:'else',customerId:'else'},{...order,id:'course',requiresShipping:false}],users:[{id:'u',name:'Nhân viên'}]});
 assert.equal(rows.length,1);assert.equal(rows[0].creator,'Nhân viên');assert.equal(rows[0].total,200000);
});
test('projects POS and carrier fields without raw payloads and deduplicates tracking',()=>{
 const rows=learnerOrders(c,{customers:[c],orders:[order],links:[{kind:'orders',localId:'o',remote:{shipping_address:{address:'Địa chỉ QA'},note_print:'In QA',secret:'never expose'}}],shipments:[{orderId:'o',accountId:'a',tracking:'VTP001',status:'in_transit',expectedDelivery:'2026-10-18',parcel:{weight:200}}],carrierOrders:[{id:'carrier',accountId:'a',tracking:'VTP001',phone:c.phone,status:'in_transit',carrierStatusName:'Đang giao',carrierUpdatedAt:'2026-10-17',history:[{note:'Đang phân tuyến'}]}]},true);
 assert.equal(rows.length,1);assert.equal(rows[0].tracking,'VTP001');assert.equal(rows[0].statusName,'Đang giao');assert.equal(rows[0].address,'Địa chỉ QA');assert.equal(rows[0].printNote,'In QA');assert.equal(rows[0].weight,200);assert.equal(rows[0].deliveryNote,'Đang phân tuyến');assert.ok(!JSON.stringify(rows).includes('never expose'));
});
test('completed delivery disappears and returns remain visible even with stale delivered order status',()=>{
 assert.equal(learnerOrders(c,{orders:[order],shipments:[{orderId:'o',status:'delivered'}]}).length,0);
 assert.equal(learnerOrders(c,{orders:[{...order,status:'delivered'}],shipments:[{orderId:'o',status:'returning'}]})[0].status,'returning');
});
test('standalone carrier history requires unique exact phone and owner access',()=>{
 const data={customers:[c],carrierOrders:[{id:'v',tracking:'V1',phone:'+84901234567',status:'pickup_pending'},{id:'bad',phone:'090***4567',status:'in_transit'},{id:'done',phone:c.phone,status:'delivered'}]};
 assert.equal(learnerOrders(c,data,true).length,1);assert.equal(learnerOrders(c,data,false).length,0);
 assert.equal(learnerOrders(c,{...data,customers:[c,{...c,id:'duplicate'}]},true).length,0);
});
test('safe HTML, tracking copy action and empty state',()=>{
 const html=learnerOrdersHTML([{...order,receiverName:'<img onerror=alert(1)>',tracking:'QA" onclick="alert(1)',source:'Pancake POS',phone:c.phone}]);
 assert.ok(!html.includes('<img'));assert.ok(html.includes('data-learner="copy-tracking"'));assert.ok(html.includes('QA&quot;'));assert.ok(html.includes('Mới'));assert.ok(learnerOrdersHTML().includes('Không có đơn hàng đang chờ giao'));
});
test('POS source creator, status label and estimated delivery are preserved',()=>{
 const row=learnerOrders(c,{orders:[{...order,posSourceAccountId:'a'}],links:[{kind:'orders',localId:'o',remote:{creator:{name:'NV POS'},status_name:'Chờ chuyển hàng',estimate_delivery_date:'2026-10-20'}}]})[0];
 assert.equal(row.creator,'NV POS');assert.equal(row.statusName,'Chờ chuyển hàng');assert.equal(row.expectedDelivery,'2026-10-20');
});
