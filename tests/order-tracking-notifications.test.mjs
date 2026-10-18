import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'tracking-qa-'));
const {put,get,db}=await import('../server/store.mjs');const {trackingNotificationTick:tick,recoverTrackingNotifications,trackingMessage}=await import('../server/order-tracking-notifications.mjs');
db.prepare("INSERT INTO users VALUES(?,?,?,?,?,1)").run('u','qa@test','QA','owner','none');put('connections',{id:'ch',status:'connected',mode:'api'});put('conversations',{id:'c',connectionId:'ch'});
const order={id:'o',code:'QA',conversationId:'c',status:'confirmed',total:260000,paid:260000,phone:'PRIVATE-PHONE',address:'PRIVATE-ADDRESS',freeShipping:false,trackingNotification:{enabled:true,actor:'u'}};
test('notification waits for tracking, sends once only for opted-in orders, and excludes private contact data',async()=>{put('orders',order);let sent=[];const send=async(u,id,input)=>{sent.push(input.text);return {id:'m'};};await tick(send);assert.equal(sent.length,0);put('shipments',{id:'s',orderId:'o',tracking:'PKE-QA',fee:23519,status:'pickup_pending'});await tick(send);await tick(send);assert.equal(sent.length,1);assert.match(sent[0],/Không thu hộ tiền hàng/);assert.match(sent[0],/23.519/);assert.ok(!sent[0].includes('PRIVATE'));assert.equal(get('tracking_notifications','tracking:o:PKE-QA').state,'sent');put('orders',{...order,id:'off',trackingNotification:undefined});put('shipments',{id:'off',orderId:'off',tracking:'OTHER'});await tick(send);assert.equal(sent.length,1);});
test('uncertain delivery and restart never resend automatically',async()=>{put('orders',{...order,id:'unknown'});put('shipments',{id:'us',orderId:'unknown',tracking:'PKE-U'});let n=0;const send=async()=>{n++;throw Object.assign(Error('timeout'),{unknown:true});};await tick(send);await tick(send);assert.equal(n,1);put('tracking_notifications',{id:'restart',state:'sending'});recoverTrackingNotifications();assert.equal(get('tracking_notifications','restart').state,'unknown');});

test('POS Viettel reference waits for carrier tracking and uses actual fee fallback',async()=>{
 const {posShipmentProjection}=await import('../server/pos-shipment-data.mjs');
 const row={id:'p',partner_fee:24639,partner:{partner_id:3,extend_code:'MGP-ref',total_fee:0}};
 assert.equal(posShipmentProjection(row).trackingReady,false);
 put('orders',{...order,id:'pending-pos'});put('shipments',{id:'p',orderId:'pending-pos',...posShipmentProjection(row)});let sent=[];const send=async(u,c,i)=>{sent.push(i.text);return {id:'actual'};};await tick(send);assert.equal(sent.length,0);
 row.partner.order_number_vtp='PKE-real';const data=posShipmentProjection(row);assert.equal(data.tracking,'PKE-real');assert.equal(data.fee,24639);
 put('shipments',{id:'p',orderId:'pending-pos',...data});await tick(send);assert.equal(sent.length,1);assert.match(sent[0],/PKE-real/);assert.match(sent[0],/24.639/);assert.ok(!sent[0].includes('MGP-ref'));
 assert.ok(!trackingMessage(order,{tracking:'PKE',fee:0}).includes(' 0 đ'));
});

test('private template requires consent on the specific order, correct recipient and complete provider data',async()=>{
 const {renderTrackingTemplate}=await import('../server/order-tracking-notifications.mjs');const t='#{PRODUCT_NO_ATTRIBUTE} #{TRACKING_ID} #{PARTNER_FEE} #{FULL_NAME} #{PHONE_NUMBER} #{FULL_ADDRESS} #{TRACKING_URL}';
 const o={...order,receiverName:'Receiver',items:[{quantity:1,name:'Product'}]},s={tracking:'PKE-test',fee:24639,carrierName:'VTP',trackingUrl:'https://pke.gg/provider-issued'};
 assert.throws(()=>renderTrackingTemplate(t,o,s),/bật riêng/);
 o.trackingNotification={...o.trackingNotification,recipientDetailsConsent:true};const text=renderTrackingTemplate(t,o,s);assert.match(text,/PKE-test/);assert.match(text,/24.639/);assert.match(text,/Receiver/);assert.match(text,/PRIVATE-PHONE/);assert.ok(!text.includes('#{'));
 assert.throws(()=>renderTrackingTemplate(t,o,{...s,trackingUrl:''}),/TRACKING_URL/);assert.throws(()=>renderTrackingTemplate(t,o,{...s,fee:0}),/PARTNER_FEE/);
});
