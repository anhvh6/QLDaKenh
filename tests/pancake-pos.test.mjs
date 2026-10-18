import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'hub-pos-test-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,all,secret,db}=await import('../server/store.mjs');
const {posRoute,posState,posTick,applyPosRow,receivePosWebhook,recoverPosJobs,posCustomerEligible}=await import('../server/pancake-pos.mjs');
const {pancakeRequest,pancakePages,pancakeReadBack}=await import('../server/pancake-api.mjs');
const {fields,hash,fromCustomer,writableProduct,orderAddress,orderBody}=await import('../server/pancake-model.mjs');
const owner={id:'owner',role:'owner'},apiKey='QA-PRIVATE-PANCAKE-KEY-NEVER-EXPOSE';
const remote={products:[],customers:[],orders:[]},calls=[];
const copy=v=>structuredClone(v);
async function request(key,path,options={}){
 assert.equal(key,apiKey);const {method='GET',body,query={}}=options;calls.push({path,method,body:copy(body),query:copy(query)});
 if(path.endsWith('/partners'))return {success:true,data:[]};
 if(path==='/shops')return {success:true,shops:[{id:10,name:'Shop QA'}]};
 if(path==='/shops/10/warehouses')return {success:true,data:[{id:'warehouse-1',name:'Kho QA'}]};
 if(path==='/shops/10'&&method==='PUT')return {success:true};
 if(path.endsWith('/products/variations'))return {success:true,data:copy(remote.products.filter(p=>!query.search||p.display_id===query.search).filter(p=>!query['variation_ids[]']||p.id===query['variation_ids[]'])),total_pages:1};
 if(path.includes('/products/')&&method==='GET'){const p=remote.products.find(p=>p.product_id===path.split('/').at(-1)||p.product.display_id===path.split('/').at(-1));return {data:{...p?.product,id:p?.product_id,variations:copy(remote.products.filter(v=>v.product_id===p?.product_id).map(({product,...v})=>v))}};}
 if(path.endsWith('/products')&&method==='POST'){const p=body.product;const id='p-'+remote.products.length;remote.products.push({...p.variations[0],id:'v-'+remote.products.length,display_id:p.variations[0].custom_id,product_id:id,product:{...p,id,display_id:p.custom_id},updated_at:new Date().toISOString()});return {success:true};}
 if(path.includes('/products/')&&method==='PUT'){for(const v of body.product.variations){const p=remote.products.find(p=>p.id===v.id);Object.assign(p,v,{product:{...p.product,name:body.product.name},updated_at:new Date().toISOString()});}return {success:true};}
 if(path.endsWith('/update_quantity')){const p=remote.products.find(p=>p.id===path.split('/').at(-2));p.variations_warehouses=copy(body.variations_warehouses);return {success:true};}
 for(const kind of ['customers','orders']){
  if(path.endsWith('/'+kind)&&method==='GET')return {success:true,total_pages:1,data:copy(remote[kind].filter(p=>!query.search||(kind==='customers'?(p.phone_numbers||[]).includes(query.search):p.custom_id===query.search)))};
  if(path.endsWith('/'+kind)&&method==='POST'){if(kind==='customers')assert.equal(body.createType,'force');const row=kind==='customers'?{id:'sc-'+remote.customers.length,customer_id:'c-'+remote.customers.length,name:body.name,phone_numbers:[body.phoneNumber],emails:[],shop_customer_address:body.shop_customer_address}:copy(body);if(kind==='orders'){assert.equal(body.shipping_address.address,body.shipping_address.full_address);row.shipping_address={...row.shipping_address,full_address:'',address:row.shipping_address.address};}row.id??=remote[kind].length+1;row.updated_at=new Date().toISOString();remote[kind].push(row);return kind==='customers'?{success:true,data:copy(row)}:{success:true};}
  if(path.includes('/'+kind+'/')){const id=path.split('/').at(-1),row=remote[kind].find(r=>String(kind==='customers'?r.customer_id:r.id)===id);if(method==='GET')return {data:copy(row)};if(method==='PUT'){Object.assign(row,kind==='customers'?body.customer:body,{updated_at:new Date().toISOString()});return {success:true,data:copy(row)};}}
 }
 throw Error('Unexpected POS request '+method+' '+path);
}
const route=(path,method='GET',body={})=>posRoute(path,method,body,owner,new URL('http://localhost'+path),request);
test('live POS customer address aliases and empty generated address are normalized',()=>{
 assert.equal(fromCustomer({shop_customer_addresses:[{full_address:'123 Duong A, Quan B'}]}).address,'123 Duong A, Quan B');
 assert.equal(fromCustomer({shop_customer_addresses:[{full_address:', '}]}).address,'');
 assert.equal(fromCustomer({shop_customer_address:[{address:'123 Duong A'}]}).address,'123 Duong A');
});
test('product writes omit server fields, nulls and inventory while retaining sibling metadata',()=>{
 const result=writableProduct({id:'server',name:'QA',type:'service',brand_id:null,inserted_at:'server',variations:[{id:'v',barcode:'KEEP',retail_price:2000,keyword:null,is_locked:false,variations_warehouses:[{remain_quantity:5}]}]});
 assert.deepEqual(result,{name:'QA',type:'service',variations:[{id:'v',barcode:'KEEP',retail_price:2000}]});
});
test('API credentials are restricted to official host and are redacted from failures',async()=>{
 await assert.rejects(pancakeRequest(apiKey,'https://evil.test'),/không hợp lệ/);
 const result=await pancakeRequest(apiKey,'/shops',{fetcher:async(url,options)=>{assert.equal(url.origin,'https://pos.pages.fm');assert.equal(url.searchParams.get('api_key'),apiKey);assert.equal(options.redirect,'error');return {ok:true,json:async()=>({success:true,shops:[]})};}});assert.equal(result.success,true);
 await assert.rejects(pancakeRequest(apiKey,'/shops',{fetcher:async()=>({ok:false,status:401,json:async()=>({message:'Bad '+apiKey})})}),e=>!e.message.includes(apiKey)&&e.status===401);
 await assert.rejects(pancakeRequest(apiKey,'/shops/10/orders',{method:'POST',fetcher:async()=>{throw Error('timeout');}}),e=>e.unknown===true);
});
test('pagination uses provider total pages and never silently truncates short pages',async()=>{const seen=[];const n=await pancakePages(async(path,{query})=>({data:[{id:query.page_number}],total_pages:3}),'/shops/10/customers',{},rows=>seen.push(...rows));assert.equal(n,3);assert.equal(seen.length,3);await assert.rejects(pancakePages(async()=>({success:true}),'/shops/10/orders'),/chưa trả danh sách/);});
test('delayed POS indexing retries only reads and surfaces stable provider error codes',async()=>{let reads=0;const delays=[];const found=await pancakeReadBack(async()=>++reads<3?null:{id:'created'}, {wait:async n=>delays.push(n)});assert.equal(found.id,'created');assert.equal(reads,3);assert.deepEqual(delays,[750,1500]);await assert.rejects(pancakeRequest(apiKey,'/shops/10/customers',{method:'POST',fetcher:async()=>({ok:true,status:200,json:async()=>({success:false,error:'missing_create_type',message_code:123})})}),e=>e.message.includes('missing_create_type')&&e.message.includes('123')&&e.diagnostics.httpStatus===200);});
test('Pancake connect, import, outgoing updates, conflict handling and restart recovery',async t=>{
 let account;
 await t.test('owner connects a shop and warehouse; state never exposes API credentials',async()=>{await assert.rejects(posRoute('/api/pos/discover','POST',{apiKey},{role:'support'},new URL('http://localhost'),request),{status:403});const d=await route('/api/pos/discover','POST',{apiKey});assert.equal(d.shops[0].id,'10');assert.ok(!JSON.stringify(d).includes(apiKey));});
 // Pass the pathname separately from the URL query, as the HTTP dispatcher does.
 const d=await route('/api/pos/discover','POST',{apiKey});const w=await posRoute('/api/pos/drafts/'+d.draftId+'/warehouses','GET',{},owner,new URL('http://localhost?shopId=10'),request);assert.equal(w.warehouses[0].id,'warehouse-1');
 await route('/api/pos/connect','POST',{draftId:d.draftId,shopId:'10',warehouseId:'warehouse-1',pushExisting:false});account=posState(owner).accounts[0];assert.equal(secret('pancake:'+account.id).apiKey,apiKey);assert.ok(!JSON.stringify(posState(owner)).includes(apiKey));assert.equal(posState({role:'support'}),null);
 await t.test('imports variants, customers and orders without an outgoing echo',async()=>{
  remote.products.push({id:'remote-v',product_id:'remote-p',display_id:'SKU-POS',retail_price:100000,last_imported_price:40000,weight:200,remain_quantity:20,variations_warehouses:[{warehouse_id:'warehouse-1',remain_quantity:20}],product:{name:'Hàng từ POS',display_id:'P-POS',weight:200,is_published:true},updated_at:'2026-10-16T00:00:00Z'});
  remote.customers.push({id:'shop-c',customer_id:'remote-c',name:'Khách POS',phone_numbers:['0901112222'],emails:['qa@example.test'],shop_customer_address:[{full_address:'Địa chỉ QA'}]});
  remote.orders.push({id:100,shop_id:10,customer:{id:'remote-c'},custom_id:'POS-QA-100',bill_full_name:'Khách POS',bill_phone_number:'0901112222',shipping_address:{full_address:'Địa chỉ QA'},items:[{variation_id:'remote-v',quantity:1,variation_info:{retail_price:100000}}],status:2,cash:0,partner:{extend_code:'TRACK-QA',partner_name:'Hãng QA'}});
  await posTick(request);assert.equal(all('products').length,1);assert.equal(all('customers').length,1);assert.equal(all('orders')[0].status,'shipping');assert.equal(all('shipments')[0].tracking,'TRACK-QA');assert.equal(db.prepare('SELECT count(*) AS n FROM pos_change_log').get().n,0);assert.equal(calls.filter(c=>c.method!=='GET').length,0);
 });
 let product,customer,order;
 await t.test('new local data is sent once, dependencies linked and shipping synchronized',async()=>{
  product=put('products',{id:'local-product',name:'Sản phẩm hệ thống',sku:'SKU-HUB',price:120000,cost:30000,weight:300,stock:10,reserved:0,active:true,productType:'physical'});customer=put('customers',{id:'local-customer',name:'Khách hệ thống',phone:'0903334444',email:'',address:'Địa chỉ hệ thống',tags:[]});order=put('orders',{id:'local-order',code:'HUB-ORDER-QA',customerId:customer.id,receiverName:customer.name,phone:customer.phone,address:customer.address,items:[{productId:product.id,name:product.name,quantity:1,price:product.price,productType:'physical'}],status:'confirmed',paid:0,total:120000});await posTick(request);await posTick(request);assert.equal(remote.products.filter(p=>p.display_id==='SKU-HUB').length,1);assert.equal(remote.customers.filter(c=>c.phone_numbers.includes(customer.phone)).length,1);assert.equal(remote.orders.filter(o=>o.custom_id===order.code).length,1);assert.equal(remote.orders.find(o=>o.custom_id===order.code).items[0].quantity,1);assert.equal(all('pos_jobs').filter(j=>j.state==='unknown').length,0);
  put('orders',{...get('orders',order.id),status:'shipping'});put('shipments',{orderId:order.id,tracking:'HUB-TRACK',carrier:'manual',status:'shipping'});await posTick(request);assert.equal(remote.orders.find(o=>o.custom_id===order.code).partner.extend_code,'HUB-TRACK');assert.equal(remote.orders.find(o=>o.custom_id===order.code).status,2);
 });
 await t.test('remote inventory updates the selected warehouse without pushing a stock echo',async()=>{const p=all('products').find(p=>p.sku==='SKU-POS'),before=calls.length;await applyPosRow(account,'products',{...remote.products[0],variations_warehouses:[{warehouse_id:'warehouse-1',remain_quantity:7}]});assert.equal(get('products',p.id).stock,7);assert.equal(calls.length,before);});
 await t.test('remote edits and repeated events preserve a pending local change',async()=>{const p=get('products',product.id);put('products',{...p,price:130000});const row=remote.products.find(v=>v.display_id==='SKU-HUB');await applyPosRow(account,'products',row);assert.equal(get('products',p.id).price,130000);await applyPosRow(account,'products',{...row,retail_price:140000});assert.equal(all('pos_jobs').find(j=>j.localId===p.id).state,'conflict');assert.equal(get('products',p.id).price,130000);});
 await t.test('explicit conflict resolution updates only the selected variant and preserves its sibling',async()=>{const parent=remote.products.find(v=>v.display_id==='SKU-HUB');parent.retail_price=140000;const sibling={...copy(parent),id:'sibling-v',display_id:'SIBLING-SKU',custom_id:'SIBLING-SKU',retail_price:99000,barcode:'KEEP-BARCODE'};remote.products.push(sibling);await applyPosRow(account,'products',sibling);const j=all('pos_jobs').find(j=>j.localId===product.id);await route('/api/pos/jobs/'+encodeURIComponent(j.id)+'/local','POST');await posTick(request);assert.equal(parent.retail_price,130000);assert.equal(sibling.retail_price,99000);assert.equal(sibling.barcode,'KEEP-BARCODE');assert.equal(get('pos_jobs',j.id).state,'done');});
 await t.test('manual inventory adjustment sends an absolute value for the chosen warehouse',async()=>{const p=all('products').find(p=>p.sku==='SKU-POS');put('products',{...p,stock:8,reserved:0});put('stock',{productId:p.id,type:'adjustment',delta:1});await posTick(request);const call=calls.findLast(c=>c.path.endsWith('/update_quantity'));assert.deepEqual(call.body.variations_warehouses,[{warehouse_id:'warehouse-1',remain_quantity:8}]);});
 await t.test('remote confirmation and dispatch reconcile local reservations without a second stock deduction',async()=>{const source=remote.orders[0],order=all('orders').find(o=>o.code==='POS-QA-100'),p=all('products').find(p=>p.sku==='SKU-POS'),available=get('products',p.id).stock-get('products',p.id).reserved;await applyPosRow(account,'orders',{...source,status:1});assert.equal(get('products',p.id).reserved,1);assert.equal(get('products',p.id).stock-get('products',p.id).reserved,available);await applyPosRow(account,'orders',{...source,status:3});assert.equal(get('products',p.id).reserved,0);assert.equal(get('products',p.id).stock,available);assert.equal(get('orders',order.id).status,'delivered');});
 await t.test('incomplete customers are skipped without provider calls or error alerts',async()=>{put('customers',{id:'missing-phone',name:'Chưa có SĐT',phone:''});const before=remote.customers.length;await posTick(request);const j=all('pos_jobs').find(j=>j.localId==='missing-phone');assert.equal(j.state,'skipped');assert.equal(j.error,'');assert.equal(remote.customers.length,before);});
 await t.test('lost create response is reconciled by SKU without issuing a duplicate create',async()=>{put('products',{id:'lost-product',name:'Lost response QA',sku:'LOST-SKU',price:10000,cost:0,weight:100,stock:2,reserved:0,active:true,productType:'physical'});let lost=false;await posTick(async(key,path,options={})=>{const result=await request(key,path,options);if(!lost&&options.method==='POST'&&path.endsWith('/products')&&options.body.product.custom_id==='LOST-SKU'){lost=true;throw Object.assign(Error('Lost response'),{unknown:true});}return result;});const j=all('pos_jobs').find(j=>j.localId==='lost-product');assert.equal(j.state,'unknown');await posTick(request);assert.equal(remote.products.filter(p=>p.display_id==='LOST-SKU').length,1);await route('/api/pos/jobs/'+encodeURIComponent(j.id)+'/reconcile','POST');assert.equal(get('pos_jobs',j.id).state,'done');assert.equal(remote.products.filter(p=>p.display_id==='LOST-SKU').length,1);});
 await t.test('webhook authentication and replay prevention; no API secret appears in state',async()=>{const token=secret('pancake:'+account.id).webhookToken;assert.throws(()=>receivePosWebhook(account.id,{},{}),{status:403});assert.throws(()=>receivePosWebhook(account.id,{'x-api-key':token},{shop_id:99},()=>{}),{status:403});const a=receivePosWebhook(account.id,{'x-api-key':token},{shop_id:10,id:'event'},()=>{});assert.equal(a.ok,true);assert.equal(receivePosWebhook(account.id,{'x-api-key':token},{shop_id:10,id:'event'},()=>{}).duplicate,true);assert.ok(!JSON.stringify(posState(owner)).includes(token));});
 await t.test('uncertain sends survive restart and cannot be retried blindly',async()=>{const j=all('pos_jobs')[0];put('pos_jobs',{...j,state:'sending'});recoverPosJobs();assert.equal(get('pos_jobs',j.id).state,'unknown');await assert.rejects(route('/api/pos/jobs/'+encodeURIComponent(j.id)+'/retry','POST'),{status:409});});
 await t.test('live order ID fallback links the existing local order without creating a second row',async()=>{const o=get('orders',order.id),source=remote.orders.find(r=>r.custom_id===o.code);const before=all('orders').length;db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('pos_links',account.id+':orders:'+o.id);await applyPosRow(account,'orders',{...source,id:o.code,custom_id:undefined});assert.equal(all('orders').length,before);assert.equal(all('pos_links').find(l=>l.kind==='orders'&&l.remoteId===o.code).localId,o.id);});
 await t.test('only complete contacts sync; adding an address resumes the skipped customer and a draft order grants eligibility',async()=>{
  let c=put('customers',{id:'policy-qa',name:'Policy QA',phone:'0907773333',address:'   '});const before=remote.customers.length;
  await posTick(request);assert.equal(remote.customers.length,before);let j=all('pos_jobs').find(j=>j.localId===c.id);assert.equal(j.state,'skipped');assert.equal(posCustomerEligible(c),false);
  put('pos_jobs',{...j,state:'failed',error:'Old error'});await posTick(request);assert.equal(get('pos_jobs',j.id).state,'skipped');assert.ok(!posState(owner).issues.some(i=>i.localId===c.id));
  c=put('customers',{...c,address:'123 QA street'});await posTick(request);assert.equal(remote.customers.length,before+1);assert.equal(get('pos_jobs',j.id).state,'done');
  const writes=calls.filter(x=>x.method==='PUT'||x.method==='POST').length;c=put('customers',{...get('customers',c.id),address:'',name:'Do not send incomplete edit'});await posTick(request);assert.equal(calls.filter(x=>x.method==='PUT'||x.method==='POST').length,writes);
  const draft=put('orders',{id:'policy-draft',customerId:c.id,status:'draft'});assert.equal(posCustomerEligible(c),true);put('orders',{...draft,status:'cancelled'});assert.equal(posCustomerEligible(c),false);db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('orders',draft.id);
 });
 await t.test('creating an order syncs its phone-only customer through the dependency path',async()=>{
  const c=put('customers',{id:'order-only-qa',name:'Order-only QA',phone:'0901238899',address:''});await posTick(request);assert.equal(all('pos_jobs').find(j=>j.localId===c.id).state,'skipped');
  put('orders',{id:'order-only-draft',code:'ORDER-ONLY-QA',customerId:c.id,receiverName:c.name,phone:c.phone,address:'',status:'draft',items:[],paid:0});await posTick(request);
  assert.equal(all('pos_jobs').find(j=>j.localId===c.id).state,'done');assert.equal(remote.customers.filter(x=>x.phone_numbers.includes(c.phone)).length,1);assert.equal(remote.orders.filter(x=>x.custom_id==='ORDER-ONLY-QA').length,1);
 });
 await t.test('explicit POS dispatch is gated, idempotent, returns receipt, and never pushes other destinations',async()=>{
  const selected=put('orders',{...get('orders',order.id),id:'selected-order',code:'SELECTED-POS-QA',status:'draft',posTracking:'',fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});
  await posTick(request);assert.equal(remote.orders.some(o=>o.custom_id===selected.code),false);
  let result=await route('/api/pos/orders/'+selected.id+'/dispatch','POST',{accountId:account.id});assert.equal(result.state,'queued');await posTick(request);
  result=await route('/api/pos/orders/'+selected.id+'/dispatch');assert.equal(result.state,'done');assert.ok(result.remote.id);assert.equal(result.remote.address,selected.address);assert.equal(result.remote.warehouseId,'warehouse-1');assert.ok(!JSON.stringify(result).includes(apiKey));
  await route('/api/pos/orders/'+selected.id+'/dispatch','POST',{accountId:account.id});await posTick(request);assert.equal(remote.orders.filter(o=>o.custom_id===selected.code).length,1);
  put('orders',{...selected,id:'vtp-only-order',code:'VTP-ONLY-QA',fulfillmentTarget:'vtp:example'});await posTick(request);assert.equal(remote.orders.some(o=>o.custom_id==='VTP-ONLY-QA'),false);
  const job=all('pos_jobs').find(j=>j.localId===selected.id&&j.kind==='orders');put('pos_jobs',{...job,state:'unknown',error:'Lost acknowledgement'});await route('/api/pos/orders/'+selected.id+'/dispatch','POST');assert.equal(get('pos_jobs',job.id).state,'unknown');
  await assert.rejects(posRoute('/api/pos/orders/'+selected.id+'/dispatch','GET',{}, {id:'viewer',role:'viewer'},new URL('http://localhost'),request),{status:403});
 });
 await t.test('automatic empty chat drafts stay local until products are reviewed',async()=>{
  const draft=put('orders',{...order,id:'chat-empty',code:'CHAT-EMPTY',status:'draft',items:[],awaitingProducts:true,fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});await posTick(request);assert.equal(remote.orders.some(r=>r.custom_id===draft.code),false);await assert.rejects(route('/api/pos/orders/'+draft.id+'/dispatch','POST'),/Thêm sản phẩm/);
 });
 await t.test('print-note-only edits queue and read back without changing the established business hash schema',async()=>{
  let draft=put('orders',{...order,id:'print-only',code:'PRINT-ONLY',status:'draft',posTracking:'',printNote:'',fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});await route('/api/pos/orders/'+draft.id+'/dispatch','POST');await posTick(request);assert.equal(all('pos_jobs').find(j=>j.localId===draft.id).state,'done');
  draft=put('orders',{...get('orders',draft.id),printNote:'QA ghi chú in mới'});await route('/api/pos/orders/'+draft.id+'/dispatch','POST');await posTick(request);assert.equal(all('pos_jobs').find(j=>j.localId===draft.id).state,'done');assert.equal(remote.orders.find(r=>r.custom_id===draft.code).note_print,draft.printNote);
  const raw=remote.orders.find(r=>r.custom_id===draft.code),link=all('pos_links').find(l=>l.kind==='orders'&&l.localId===draft.id);raw.note_print='POS note to preserve';put('pos_links',{...link,remote:copy(raw)});const legacy={...get('orders',draft.id),note:'Edit other field'};delete legacy.printNote;put('orders',legacy);await posTick(request);assert.equal(remote.orders.find(r=>r.custom_id===draft.code).note_print,'POS note to preserve');
 });
 await t.test('POS auto-carrier acknowledgement is adopted without a false conflict; fee-only updates still sync',async()=>{
  const draft=put('orders',{...order,id:'auto-carrier',code:'AUTO-CARRIER',status:'confirmed',posTracking:'',fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});await route('/api/pos/orders/'+draft.id+'/dispatch','POST');
  await posTick(async(key,path,options={})=>{const r=await request(key,path,options);if(options.method==='POST'&&path.endsWith('/orders')&&options.body.custom_id===draft.code){const row=remote.orders.find(r=>r.custom_id===draft.code);row.status=9;row.partner={extend_code:'PKE-AUTO-QA',partner_name:'VTP',partner_status:'received',total_fee:23519};}return r;});
  assert.equal(all('pos_jobs').find(j=>j.localId===draft.id).state,'done');assert.equal(get('orders',draft.id).posTracking,'PKE-AUTO-QA');const ship=all('shipments').find(s=>s.orderId===draft.id);assert.equal(ship.fee,23519);assert.equal(ship.status,'pickup_pending');
  const r=remote.orders.find(r=>r.custom_id===draft.code);r.partner.total_fee=25000;r.partner.partner_status='out_for_delivery';await applyPosRow(account,'orders',copy(r));assert.equal(get('shipments',ship.id).fee,25000);assert.equal(get('shipments',ship.id).status,'in_transit');const version=get('shipments',ship.id).version;await applyPosRow(account,'orders',copy(r));assert.equal(get('shipments',ship.id).version,version);
 });
 await t.test('provider address segmentation and casing preserve a complete matching address without false conflict',async()=>{
  const draft=put('orders',{...order,id:'address-segments',code:'ADDRESS-SEGMENTS',status:'confirmed',address:'50 ngõ 192 Kim Mã, phường ngọc hà, hà nội',fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});
  await route('/api/pos/orders/'+draft.id+'/dispatch','POST');
  await posTick(async(key,path,options={})=>{const result=await request(key,path,options);if(options.method==='POST'&&path.endsWith('/orders')&&options.body.custom_id===draft.code){const r=remote.orders.find(r=>r.custom_id===draft.code);r.shipping_address.address='50 ngõ 192 Kim Mã';r.shipping_address.full_address='50 ngõ 192 Kim Mã, Phường Ngọc Hà, Hà Nội';}return result;});
  assert.equal(all('pos_jobs').find(j=>j.localId===draft.id).state,'done');
 });
 await t.test('POS recipient customer does not replace the chat customer identity on an originating order',async()=>{
  const draft=put('orders',{...order,id:'chat-recipient-qa',code:'CHAT-RECIPIENT-QA',conversationId:'conversation-origin',status:'confirmed',fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});
  await route('/api/pos/orders/'+draft.id+'/dispatch','POST');await posTick(request);
  const other=put('customers',{id:'recipient-other',name:'Recipient',phone:'0999999999'});
  const row=copy(remote.orders.find(r=>r.custom_id===draft.code));row.customer={id:'other-pos-customer'};
  put('pos_links',{id:account.id+':customers:'+other.id,accountId:account.id,kind:'customers',localId:other.id,remoteId:'other-pos-customer',remote:{id:'other-pos-customer'}});
  await applyPosRow(account,'orders',row);assert.equal(get('orders',draft.id).customerId,draft.customerId);
  assert.notEqual(all('pos_jobs').find(j=>j.localId===draft.id).state,'conflict');
 });
 await t.test('chat order IDs are decoded for dispatch and readback without creating duplicate jobs',async()=>{
  const draft=put('orders',{...order,id:'chat-order:encoded-qa',code:'CHAT-ENCODED-QA',status:'confirmed',fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});
  const path='/api/pos/orders/'+encodeURIComponent(draft.id)+'/dispatch';
  const first=await route(path,'POST');assert.equal(first.orderId,draft.id);assert.equal(get('orders',draft.id).posDispatchRequested,true);
  await route(path,'POST');assert.equal(all('pos_jobs').filter(j=>j.localId===draft.id).length,1);
  assert.equal((await route(path,'GET')).orderId,draft.id);
  await assert.rejects(route('/api/pos/orders/%ZZ/dispatch','POST'),{status:400});
 });
 await t.test('soft deletion sends POS deleted status and can be restored without removing history',async()=>{
  const draft=put('orders',{...order,id:'delete-qa',code:'DELETE-QA',status:'confirmed',paid:0,fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});
  await route('/api/pos/orders/'+draft.id+'/dispatch','POST');await posTick(request);
  const {orderAction}=await import('../server/domain.mjs');orderAction(owner,draft.id,{action:'delete'});await posTick(request);
  assert.equal(remote.orders.find(r=>r.custom_id===draft.code).status,7);assert.ok(get('orders',draft.id).deletedAt);assert.equal(all('pos_jobs').find(j=>j.localId===draft.id).state,'done');
  orderAction(owner,draft.id,{action:'restore'});assert.equal(get('orders',draft.id).deletedAt,undefined);
 });
 await t.test('delete paid POS order waits for carrier cancellation and preserves confirmed receipt',async()=>{
  const o=put('orders',{...order,id:'paid-delete',code:'PAID-DELETE',status:'confirmed',paid:260000,total:260000,fulfillmentTarget:'pos:'+account.id,posDispatchRequested:false});
  await route('/api/pos/orders/'+o.id+'/dispatch','POST');await posTick(request);
  let r=remote.orders.find(r=>r.custom_id===o.code);r.partner={partner_id:3,extend_code:'MGP-test',order_number_vtp:'PKE-test',partner_status:'request_received'};
  assert.equal((await route('/api/pos/orders/'+o.id+'/delete','POST',{version:get('orders',o.id).version})).pending,true);
  assert.equal(get('orders',o.id).deletedAt,undefined);assert.equal(r.status,6);
  r.partner.partner_status='canceled';const result=await route('/api/pos/orders/'+o.id+'/delete','POST',{version:get('orders',o.id).version});
  assert.equal(result.deleted,true);assert.equal(get('orders',o.id).paid,260000);assert.equal(r.status,7);
 });
 await t.test('disconnect erases stored API credentials and preserves business data',async()=>{const before=all('orders').length;await route('/api/pos/accounts/'+account.id+'/disconnect','POST');assert.equal(secret('pancake:'+account.id).apiKey,undefined);assert.equal(all('orders').length,before);});
});

test('order address writes the provider input field and reads address aliases without hiding a real difference',()=>{
 const body=orderBody({status:'draft',code:'QA',address:'01 ngõ 191 Khương Thượng'}, {name:'QA',phone:'0901234567'},[],{shopId:'10',warehouseId:'w'});assert.equal(body.shipping_address.address,'01 ngõ 191 Khương Thượng');assert.equal(orderAddress({shipping_address:{address:body.shipping_address.address,full_address:''}}),body.shipping_address.address);assert.equal(orderAddress({shipping_address:{full_address:'Legacy'}}),'Legacy');assert.equal(orderAddress({shipping_address:{new_full_address:'New'}}),'New');assert.notEqual(orderAddress({shipping_address:{address:'Different address'}}),body.shipping_address.address);
});

test('order addresses prefer complete provider address over street segment',()=>{assert.equal(orderAddress({shipping_address:{address:'50 Kim Mã',full_address:'50 Kim Mã, Ngọc Hà, Hà Nội'}}),'50 Kim Mã, Ngọc Hà, Hà Nội');});

test('confirmed bank receipts map to transfer money; planned transfers never count as received',()=>{
 const base={status:'confirmed',bankTransfer:true,transferAmount:260000};
 const body=paid=>orderBody({...base,paid},{name:'QA'},[],{shopId:10});
 assert.equal(body(260000).cash,0);assert.equal(body(260000).transfer_money,260000);
 assert.equal(body(0).cash,0);assert.equal(body(0).transfer_money,0);
 assert.equal(body(100000).transfer_money,100000);assert.equal(body(300000).cash,40000);
});
