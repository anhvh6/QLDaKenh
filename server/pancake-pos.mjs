import {orderPOSFields} from './order-workspace.mjs';
import {refreshPosShipment} from './pos-shipment-data.mjs';
import {posStatusOptions} from '../public/order-status-policy.js';
import {updatePosOrderStatus} from './order-status-update.mjs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {db,all,get,put,remove,saveSecret,secret,transaction,audit,now,uid} from './store.mjs';
import {inbound,changeSequence,phoneExpression} from './pancake-storage.mjs';
import {pancakeRequest,pancakePages,pancakeReadBack} from './pancake-api.mjs';
import {hash,fields,normalizePhone,remoteId,fromProduct,fromCustomer,localStatus,orderBody,paidAmount,customerAddresses,orderCode,writableProduct,orderAddress} from './pancake-model.mjs';
import {permission} from './domain.mjs';
import {assertCustomer} from './taophacdo.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const refreshShip=(...args)=>inbound(()=>refreshPosShipment(...args));
const shippingOptionCache=new Map();
const statusUpdates=new Set();
const kinds=['products','customers','orders'];
const printChanged=(kind,row,link)=>kind==='orders'&&Object.hasOwn(row,'printNote')&&String(row.printNote||'')!==String(link?.remote?.note_print||'');
const acceptsOrder=(a,o)=>!o.awaitingProducts&&(!o.autoDraft||o.posDispatchRequested===true)&&(!o.fulfillmentTarget||o.fulfillmentTarget==='pos:'+a.id&&o.posDispatchRequested===true);
export function posCustomerEligible(customer){
 if(!customer||customer.deletedAt||customer.mergedInto)return false;
 if(fields('customers',customer).phone&&String(customer.address||'').trim())return true;
 return !!db.prepare("SELECT id FROM records WHERE kind='orders' AND json_extract(data,'$.customerId')=? AND json_extract(data,'$.deletedAt') IS NULL AND coalesce(json_extract(data,'$.status'),'draft') NOT IN ('cancelled','deleted') LIMIT 1").get(customer.id);
}
function skipCustomer(j){return put('pos_jobs',{...j,state:'skipped',error:'',retryAt:0,skipReason:'Chờ đủ số điện thoại và địa chỉ, hoặc có lệnh tạo đơn hàng.',diagnostics:null});}
const keyFor=id=>'pancake:'+id;
const root=a=>'/shops/'+encodeURIComponent(a.shopId);
const linkId=(a,kind,id)=>a.id+':'+kind+':'+id;
const links=a=>all('pos_links').filter(l=>l.accountId===a.id);
const linkFor=(a,kind,id)=>get('pos_links',linkId(a,kind,id));
const findRemote=(a,kind,id)=>{const found=db.prepare("SELECT id FROM records WHERE kind='pos_links' AND json_extract(data,'$.accountId')=? AND json_extract(data,'$.kind')=? AND json_extract(data,'$.remoteId')=?").get(a.id,kind,String(id));return found?get('pos_links',found.id):null;};
function matches(kind,value){if(!value)return [];return db.prepare("SELECT id FROM records WHERE kind='"+kind+"' AND "+(kind==='products'?"json_extract(data,'$.sku') COLLATE NOCASE":phoneExpression)+"=?").all(value).map(r=>get(kind,r.id)).filter(c=>!c.mergedInto);}
const reqFor=(a,request=pancakeRequest)=>(path,options)=>{if(!active(account(a.id)))fail('Kết nối POS đang dừng.',409);const key=secret(keyFor(a.id)).apiKey;if(!key)fail('Kết nối POS chưa có API key.',401);return request(key,path,options);};
function owner(user){if(user?.role!=='owner')fail('Chỉ chủ hệ thống được quản lý kết nối Pancake POS.',403);}
function account(id){const a=get('pos_accounts',id);if(!a)fail('Không tìm thấy kết nối POS.',404);return a;}
function active(a){return a.active&&a.status==='connected';}
function setAccount(a,patch){return put('pos_accounts',{...account(a.id),...patch});}
function saveLink(a,kind,localId,row,patch={}){return put('pos_links',{...linkFor(a,kind,localId),id:linkId(a,kind,localId),accountId:a.id,kind,localId,remoteId:remoteId(kind,row),remote:row,...patch});}
function job(a,kind,id,patch={}){const current=get(kind,id);if(!current)return;const existing=get('pos_jobs',linkId(a,kind,id));const value={...existing,id:linkId(a,kind,id),accountId:a.id,kind,localId:id,state:'queued',attempts:0,error:'',skipReason:'',force:false,inventory:null,retryAt:0,target:fields(kind,current),...patch};return kind==='customers'&&!posCustomerEligible(current)&&!['unknown','conflict','sending'].includes(value.state)?skipCustomer(value):put('pos_jobs',value);}
function trackedStock(a,v){const w=(v.variations_warehouses||[]).find(w=>String(w.warehouse_id)===a.warehouseId);return Number(w?.remain_quantity??0);}
function snapshot(a,kind,row){const id=linkId(a,kind,remoteId(kind,row));if(hash(get('pos_remote',id)?.data)!==hash(row))put('pos_remote',{id,accountId:a.id,kind,data:row});}
function rowsIn(data){const row=data?.data??data;return Array.isArray(row)?row[0]:row;}
function equivalentOrderAddress(remote,local){const canonical=v=>String(v||'').normalize('NFC').toLocaleLowerCase('vi').replace(/\s*,\s*/g,',').replace(/\s+/g,' ').trim();return canonical(remote)===canonical(local)?local:remote;}
function comparable(a,kind,row,current){
 if(kind==='products')return fields(kind,fromProduct({...row,weight:row.weight??row.product?.weight??current?.weight}));
 if(kind==='customers'){const c=fromCustomer(row);c.address=equivalentOrderAddress(c.address,current?.address);return fields(kind,c);}
 return fields(kind,{...current,receiverName:row.shipping_address?.full_name||row.bill_full_name||'',phone:row.shipping_address?.phone_number||row.bill_phone_number||'',email:row.bill_email||'',address:equivalentOrderAddress(orderAddress(row),current.address),items:(row.items||[]).map(i=>({productId:findRemote(a,'products',i.variation_id)?.localId||'unmapped:'+i.variation_id,quantity:i.quantity,price:i.variation_info?.retail_price||0})),surcharge:Number(row.surcharge||0),discount:row.total_discount||0,shippingFee:row.shipping_fee||0,paid:paidAmount(row),status:localStatus(row.status),note:row.note||'',printNote:row.note_print||'',posTracking:row.partner?.order_number_vtp||row.partner?.extend_code||'',posCarrier:row.partner?.partner_name||''});
}

// Inbound values only touch mapped fields. Learner plans, chat identity and permissions stay local.
export async function applyPosRow(a,kind,row,{force=false}={}){
 if(row.shop_id!==undefined&&String(row.shop_id)!==String(a.shopId))fail('Dữ liệu không thuộc shop đã kết nối.',422);
 const rid=remoteId(kind,row);if(!rid)fail('Dữ liệu POS thiếu mã định danh.',422);
 snapshot(a,kind,row);
 let link=findRemote(a,kind,rid),current=link?get(kind,link.localId):null,mapped;
 if(kind==='products')mapped=fromProduct(row);
 if(kind==='customers')mapped=fromCustomer(row);
 if(!link&&kind!=='orders'){
  const candidates=matches(kind,kind==='products'?mapped.sku:mapped.phone).filter(c=>!linkFor(a,kind,c.id));
  if(candidates.length>1)fail('Có nhiều hồ sơ trùng '+(kind==='products'?'SKU':'số điện thoại')+'. Cần gộp trước khi đồng bộ.',409);
  current=candidates[0]||null;
 }
 if(kind==='products'&&current&&row.weight===undefined&&row.product?.weight===undefined)mapped.weight=current.weight;
 if(kind==='orders'){
  const items=[];for(const i of row.items||[]){const p=findRemote(a,'products',i.variation_id);if(!p)fail('Chưa đồng bộ sản phẩm của đơn '+rid+'. Chờ lượt đồng bộ sản phẩm.',409);const product=get('products',p.localId);items.push({productId:product.id,name:i.variation_info?.name||product.name,sku:product.sku,quantity:Number(i.quantity||0),price:Number(i.variation_info?.retail_price||0),productType:product.productType||'physical'});}
  let customer=findRemote(a,'customers',row.customer?.customer_id||row.customer?.id),c=customer?get('customers',customer.localId):null;
  if(!c){const matched=matches('customers',normalizePhone(row.bill_phone_number||row.shipping_address?.phone_number));if(matched.length===1)c=matched[0];}
  if(!c)c=get('customers','pos-customer:'+a.id+':'+rid);
  if(!c){c=inbound(()=>put('customers',{id:'pos-customer:'+a.id+':'+rid,name:row.bill_full_name||'Khách đơn POS '+rid,phone:normalizePhone(row.bill_phone_number),email:row.bill_email||'',address:orderAddress(row),tags:[],createdBy:a.ownerId,posSourceAccountId:a.id}));}
  const status=localStatus(row.status);if(!status)fail('Chưa hỗ trợ trạng thái POS '+row.status+'.',422);
  const subtotal=items.reduce((sum,i)=>sum+i.price*i.quantity,0),total=Math.max(0,subtotal-Number(row.total_discount||0)+Number(row.shipping_fee||0)+Number(row.surcharge||0)),paid=Math.max(0,Number(row.cash||0)+Number(row.transfer_money||0)+['charged_by_card','charged_by_momo','charged_by_vnpay','charged_by_qrpay','charged_by_fundiin','charged_by_kredivo'].reduce((n,k)=>n+Number(row[k]||0),0));
  mapped={...(Number(row.status)===7?{deletedAt:current?.deletedAt||now()}:{}),customerId:c.id,receiverName:row.shipping_address?.full_name||row.bill_full_name||c.name,phone:normalizePhone(row.shipping_address?.phone_number||row.bill_phone_number),email:row.bill_email||'',address:orderAddress(row),items,subtotal,surcharge:Number(row.surcharge||0),discount:Number(row.total_discount||0),shippingFee:Number(row.shipping_fee||0),total,paid,status,paymentStatus:paid>=total?'paid':paid?'partial':'unpaid',requiresShipping:!row.received_at_shop,note:row.note||'',printNote:row.note_print||'',posTracking:row.partner?.order_number_vtp||row.partner?.extend_code||'',posCarrier:row.partner?.partner_name||''};
  if(!link){const matches=all('orders').filter(o=>orderCode(row)&&o.code===orderCode(row)&&!linkFor(a,kind,o.id));if(matches.length>1)fail('Mã đơn trùng; cần đối soát.',409);current=matches[0]||null;}
 }
 snapshot(a,kind,row);
 if(kind==='products'&&link&&current&&current.posAvailableStock!==trackedStock(a,row)&&!get('pos_jobs',linkId(a,kind,current.id))?.inventory){current=inbound(()=>put('products',{...current,stock:Math.max(0,trackedStock(a,row))+Number(current.reserved||0),posAvailableStock:trackedStock(a,row),posStockUpdatedAt:now()}));}
 if(kind==='orders'&&current&&link&&!force&&printChanged(kind,current,link)){if(String(row.note_print||'')!==String(link.remote?.note_print||'')&&String(row.note_print||'')!==String(current.printNote||'')){job(a,kind,current.id,{state:'conflict',error:'Ghi chú in đã thay đổi ở cả hai bên. Chọn bên cần giữ.'});return {conflict:true};}mapped.printNote=current.printNote||'';}
 if(kind==='orders'&&current){if(current.conversationId)mapped.customerId=current.customerId;mapped.address=equivalentOrderAddress(mapped.address,current.address);}
 if(kind==='customers'&&current)mapped.address=equivalentOrderAddress(mapped.address,current.address);
 const incoming=fields(kind,mapped),local=current?fields(kind,current):null;
 if(current&&!force&&hash(incoming)!==hash(local)&&(!link||link.localHash!==hash(local)&&link.remoteHash!==hash(incoming))){
  saveLink(a,kind,current.id,row,{localHash:link?.localHash,remoteHash:link?.remoteHash});job(a,kind,current.id,{state:'conflict',error:'Dữ liệu hai bên khác nhau. Chọn bên cần giữ trước khi ghi đè.',remoteTarget:incoming});return {conflict:true};
 }
 // A repeated webhook/poll must never erase a new local edit waiting in the outbox.
 if(current&&!force&&link&&hash(local)!==link.localHash&&hash(incoming)===link.remoteHash){if(kind==='orders'){refreshShip(a.id,current.id,row);if(!printChanged(kind,current,link)&&String(current.printNote||'')!==String(row.note_print||''))inbound(()=>put('orders',{...current,printNote:row.note_print||''}));if(hash(link.remote)!==hash(row))saveLink(a,kind,current.id,row);}return {pending:true};}
 if(current&&link&&!force&&link.remoteHash===hash(incoming)){if(kind==='orders'){refreshShip(a.id,current.id,row);if(!printChanged(kind,current,link)&&String(current.printNote||'')!==String(row.note_print||''))inbound(()=>put('orders',{...current,printNote:row.note_print||''}));if(hash(link.remote)!==hash(row))saveLink(a,kind,current.id,row);}return {unchanged:true};}
 const id=current?.id||'pos:'+a.id+':'+kind+':'+rid;
 inbound(()=>{
  if(kind==='orders'){
   const before=current?.status==='confirmed'?current.items||[]:[],after=mapped.status==='confirmed'?mapped.items:[],delta=new Map();
   for(const i of before)if(!i.productType||i.productType==='physical')delta.set(i.productId,(delta.get(i.productId)||0)-i.quantity);
   for(const i of after)if(!i.productType||i.productType==='physical')delta.set(i.productId,(delta.get(i.productId)||0)+i.quantity);
   for(const [productId,diff] of delta)if(diff){const p=get('products',productId);if(p){const reserved=Math.max(0,Number(p.reserved||0)+diff);put('products',{...p,reserved,stock:Math.max(0,Number(p.stock||0)-Number(p.reserved||0))+reserved});}}
  }
  const saved=put(kind,{...current,...mapped,id,...(!current?{posSourceAccountId:a.id,createdBy:a.ownerId,tags:[],...(kind==='orders'?{code:orderCode(row)||'POS-'+a.shopId+'-'+rid,source:'Pancake POS',createdAt:row.inserted_at}:{}),...(kind==='products'?{stock:Math.max(0,trackedStock(a,row)),reserved:0}:{} )}:{}),...(kind==='products'?{posAvailableStock:trackedStock(a,row),posStockUpdatedAt:now()}:{}),posSyncedAt:now()});
  saveLink(a,kind,id,row,{localHash:hash(fields(kind,saved)),remoteHash:hash(incoming),syncedAt:now()});
  if(kind==='orders')refreshShip(a.id,id,row);
 });return {imported:true};
}

async function pull(a,request){
 const r=reqFor(a,request),since=a.lastPullAt?Math.max(0,Math.floor(Date.parse(a.lastPullAt)/1000)-120):0,until=Math.floor(Date.now()/1000),counts={};
 for(const kind of kinds){const query=kind==='products'?{start_time_update:since,end_time_update:until}:kind==='customers'?{start_time_updated_at:since,end_time_updated_at:until}:{updateStatus:'updated_at',startDateTime:since,endDateTime:until,option_sort:'last_updated_order_asc'};
  let count=0;await pancakePages(r,root(a)+'/'+(kind==='products'?'products/variations':kind),query,async rows=>{for(const row of rows){try{await applyPosRow(a,kind,row);const old=get('pos_errors',linkId(a,kind,remoteId(kind,row)));if(old)put('pos_errors',{...old,state:'resolved'});}catch(e){put('pos_errors',{id:linkId(a,kind,remoteId(kind,row)),accountId:a.id,kind,remoteId:remoteId(kind,row),error:e.message,state:'open'});}count++;}setAccount(a,{syncPhase:'Đang nhận '+({products:'sản phẩm',customers:'khách hàng',orders:'đơn hàng'}[kind]),syncCount:count});});counts[kind]=count;
 }
 setAccount(a,{lastPullAt:new Date(until*1000).toISOString(),forcePull:false,nextPullAt:0,pullFailures:0,syncPhase:'Đã đồng bộ',lastError:'',lastCounts:counts});
}

async function locate(a,kind,current,r){
 const matches=[];const query={search:kind==='products'?current.sku:kind==='customers'?normalizePhone(current.phone):current.code};
 if(!query.search)return null;
 await pancakePages(r,root(a)+'/'+(kind==='products'?'products/variations':kind),query,rows=>{for(const row of rows){const exact=kind==='products'?fromProduct(row).sku===current.sku:kind==='customers'?(row.phone_numbers||[]).some(p=>normalizePhone(p)===normalizePhone(current.phone)):orderCode(row)===current.code;if(exact)matches.push(row);}});
 if(matches.length>1)fail('Nhiều bản ghi POS trùng khóa đối chiếu. Cần đối soát thủ công.',409);return matches[0]||null;
}
async function remoteCurrent(a,kind,link,r){
 if(kind==='products'){const out=await r(root(a)+'/products/variations',{query:{'variation_ids[]':link.remoteId,page_size:100,page_number:1}});return (out.data||[]).find(v=>String(v.id)===link.remoteId)||null;}
 return rowsIn(await r(root(a)+'/'+kind+'/'+encodeURIComponent(link.remoteId)));
}

async function push(a,j,request){
 const r=reqFor(a,request),current=get(j.kind,j.localId);if(!current)return put('pos_jobs',{...j,state:'skipped',error:'Dữ liệu nội bộ không còn.'});
 if(j.kind==='orders'&&!acceptsOrder(a,current))return put('pos_jobs',{...j,state:'skipped',error:'',skipReason:'Đơn chọn nơi xử lý khác hoặc chưa yêu cầu gửi POS.'});
 if(j.kind==='customers'&&!posCustomerEligible(current))return skipCustomer(j);
 let link=linkFor(a,j.kind,j.localId),remote=link?await remoteCurrent(a,j.kind,link,r):await locate(a,j.kind,current,r);
 if(remote&&!link){await applyPosRow(a,j.kind,remote);link=linkFor(a,j.kind,current.id);if(!link)fail('Bản ghi POS đã liên kết với hồ sơ khác. Cần đối soát.',409);if(get('pos_jobs',j.id)?.state==='conflict'&&!j.force)fail('Bản ghi đã tồn tại ở POS với thông tin khác. Chọn bên cần giữ.',409);}
 if(link&&!remote)fail('Không tìm thấy bản ghi đã liên kết trên POS. Không tự tạo lại để tránh trùng.',409);
 if(remote&&link&&!j.force){
  const before=link.remote;const remoteChanged=hash(remote)!==hash(before);
  if(remoteChanged){await applyPosRow(a,j.kind,remote);if(get('pos_jobs',j.id)?.state==='conflict')fail('Cả hai bên đã thay đổi. Chọn bên cần giữ.',409);if(link.localHash===hash(fields(j.kind,current))&&!printChanged(j.kind,current,link)&&!j.inventory)return put('pos_jobs',{...j,state:'done',error:''});}
 }
 const local=fields(j.kind,current);if(link?.localHash===hash(local)&&!printChanged(j.kind,current,link)&&!j.force&&!j.inventory)return put('pos_jobs',{...j,state:'done',error:'',syncedAt:now()});
 let body,path,method=link?'PUT':'POST';
 if(j.kind==='customers'){
  if(!local.phone)fail('Khách hàng chưa có số điện thoại. Bổ sung SĐT để tạo trên POS.',422);
  body=link?{customer:{name:local.name,phone_numbers:[local.phone,...(remote.phone_numbers||[]).slice(1)],emails:[...(local.email?[local.email]:[]),...(remote.emails||[]).slice(1)],shop_customer_address:[{...(customerAddresses(remote)[0]||{}),full_name:local.name,phone_number:local.phone,full_address:local.address},...customerAddresses(remote).slice(1)]}}:{name:local.name,phoneNumber:local.phone,createType:'force',shop_customer_address:[{full_name:local.name,phone_number:local.phone,full_address:local.address}]};
  path=root(a)+'/customers'+(link?'/'+encodeURIComponent(link.remoteId):'');
 }else if(j.kind==='products'){
  if(!local.sku)fail('Sản phẩm chưa có SKU.',422);
  const variation={...(link?remote:{}),...(link?{id:link.remoteId}:{}),custom_id:local.sku,retail_price:local.price,last_imported_price:local.cost,weight:local.weight,is_hidden:!local.active};delete variation.product;
  if(!link)variation.variations_warehouses=[{warehouse_id:a.warehouseId,remain_quantity:Number(current.stock||0)}];
  let product={name:local.name,weight:local.weight,custom_id:local.sku,is_published:local.active,type:current.productType==='physical'?'product':'service',variations:[variation]};
  if(link){const full=rowsIn(await r(root(a)+'/products/'+encodeURIComponent(remote.product?.custom_id||remote.product?.display_id||remote.product_id)));if(!full?.variations)fail('POS chưa trả đủ biến thể. Không cập nhật để tránh mất biến thể khác.',409);if(full.variations.length>1&&local.name!==fromProduct(remote).name)fail('Sản phẩm có nhiều biến thể. Đổi tên chung tại POS để tránh đổi tên các biến thể khác.',409);product={...full,name:full.variations.length>1?full.name:local.name,variations:full.variations.map(v=>String(v.id)===link.remoteId?{...v,...variation}:v)};}
  if(link){delete product.variations_warehouses;product.variations=product.variations.map(({variations_warehouses,...v})=>v);}
  body={product:link?writableProduct(product):product};path=root(a)+'/products'+(link?'/'+encodeURIComponent(remote.product_id):'');
 }else{
  if(!a.warehouseId)fail('Chọn kho POS trước khi đồng bộ đơn.',422);
  const c=get('customers',current.customerId);if(!c)fail('Đơn thiếu khách hàng.',422);
  const customerLink=linkFor(a,'customers',c.id),customerJob=get('pos_jobs',linkId(a,'customers',c.id));
  if(!customerLink||customerLink.localHash!==hash(fields('customers',c))){if(['unknown','conflict','sending'].includes(customerJob?.state))fail('Khách hàng của đơn đang chờ đối soát POS.',409);await push(a,{id:linkId(a,'customers',c.id),accountId:a.id,kind:'customers',localId:c.id,state:'queued'},request);}
  const items=[];for(const i of current.items||[]){let p=linkFor(a,'products',i.productId);if(!p){await push(a,{id:linkId(a,'products',i.productId),accountId:a.id,kind:'products',localId:i.productId,state:'queued'},request);p=linkFor(a,'products',i.productId);}if(!p)fail('Chưa liên kết được sản phẩm của đơn.',422);items.push({product_id:p.remote.product_id,variation_id:p.remoteId,quantity:i.quantity,variation_info:{name:i.name,retail_price:i.price},discount_each_product:0});}
  const shipment=all('shipments').find(s=>s.orderId===current.id&&s.status!=='cancelled');body=orderBody(current,c,items,a,shipment);if(link&&!current.deletedAt&&localStatus(remote.status)===current.status)body.status=Number(remote.status);if(current.posDispatchRequested&&!current.deletedAt&&current.status==='confirmed'&&current.requiresShipping!==false&&!shipment?.tracking&&!remote?.partner?.extend_code){const result=await r(root(a)+'/partners'),partners=(result.data||result.partners||[]).filter(p=>p.accounts?.length===1);if(partners.length===1){body.partner={partner_id:partners[0].id};body.shop_partner_id=partners[0].accounts[0].id;body.is_linked_partner=true;body.customer_pay_fee=current.freeShipping!==true;}}if(link){body.transfer_money=Math.max(Number(remote.transfer_money||0),body.transfer_money);const other=body.transfer_money+['charged_by_card','charged_by_momo','charged_by_vnpay','charged_by_qrpay','charged_by_fundiin','charged_by_kredivo'].reduce((n,k)=>n+Number(remote[k]||0),0);if(current.paid<other)fail('Khoản hoàn tiền liên quan thanh toán POS. Đối soát thanh toán trên POS trước.',409);body.cash=current.paid-other;if(!Object.hasOwn(current,'printNote'))body.note_print=remote.note_print||'';if(body.partner)body.partner={...remote.partner,...body.partner};}path=root(a)+'/orders'+(link?'/'+encodeURIComponent(link.remoteId):'');
 }
 const version=current.version;j={...j,target:local};put('pos_jobs',{...j,state:'sending',attempts:(j.attempts||0)+1,startedAt:now()});let acknowledged=false;
 try{
  if(j.kind==='orders'&&current.deletedAt&&link&&![6,7].includes(Number(remote?.status))){await r(path,{method:'PUT',body:{status:6}});const cancelled=await remoteCurrent(a,j.kind,link,r);if(Number(cancelled?.status)!==6)throw Object.assign(Error('Chưa xác nhận hủy đơn POS; không tiếp tục xóa.'),{unknown:true});}
  const result=await r(path,{method,body});
  acknowledged=true;
  // Some POS create endpoints acknowledge success without returning an ID. Always read back.
  let saved=await pancakeReadBack(()=>link?remoteCurrent(a,j.kind,link,r):locate(a,j.kind,current,r));
  if(!saved)throw Object.assign(Error('POS đã nhận yêu cầu nhưng chưa đối chiếu được bản ghi. Không tự gửi tạo lại.'),{unknown:true});
  if(!link&&j.kind==='customers'&&local.email){await r(root(a)+'/customers/'+encodeURIComponent(remoteId('customers',saved)),{method:'PUT',body:{customer:{...saved,emails:[local.email]}}});saved=rowsIn(await r(root(a)+'/customers/'+encodeURIComponent(remoteId('customers',saved))));}
  if(j.inventory&&j.kind==='products'){const sid=remoteId('products',saved);await r(root(a)+'/variations/'+encodeURIComponent(sid)+'/update_quantity',{method:'POST',body:{variations_warehouses:[{warehouse_id:a.warehouseId,remain_quantity:j.inventory.quantity}]}});saved=await remoteCurrent(a,'products',{remoteId:sid},r);if(!saved||trackedStock(a,saved)!==j.inventory.quantity)throw Object.assign(Error('Tồn kho đọc lại từ POS chưa khớp số lượng đã gửi. Cần đối soát.'),{unknown:true});}
  if(j.kind==='orders')refreshShip(a.id,current.id,saved);
  const remoteFields=comparable(a,j.kind,saved,current);
  if(j.kind==='orders'&&current.status==='confirmed'&&!current.posTracking&&[1,8,9,2,3].includes(Number(saved.status))&&String(saved.note_print||'')===String(current.printNote||'')){
   const business=v=>{const {status,tracking,...rest}=v;return rest;};
   if(hash(business(remoteFields))===hash(business(local))&&(remoteFields.tracking||remoteFields.status!==local.status)){
    await applyPosRow(a,'orders',saved,{force:true});const adopted=get('orders',current.id);put('pos_jobs',{...j,target:fields('orders',adopted),state:'done',force:false,inventory:null,error:'',syncedAt:now(),localVersion:adopted.version});return;
   }
  }
  saveLink(a,j.kind,current.id,saved,{localHash:hash(local),remoteHash:hash(remoteFields),syncedAt:now()});
  if(hash(remoteFields)!==hash(local)||j.kind==='orders'&&Object.hasOwn(current,'printNote')&&String(saved.note_print||'')!==String(current.printNote||'')){put('pos_jobs',{...j,state:'conflict',error:'POS đã nhận nhưng dữ liệu đọc lại chưa khớp. Kiểm tra và chọn bên cần giữ.',remoteTarget:remoteFields});return;}
  put('pos_jobs',{...j,state:'done',force:false,inventory:null,error:'',syncedAt:now(),localVersion:version});
 }catch(error){if(acknowledged)error.unknown=true;const attempts=get('pos_jobs',j.id)?.attempts||1;put('pos_jobs',{...get('pos_jobs',j.id),state:error.unknown?'unknown':error.status===409?'conflict':error.retryable&&attempts<5?'queued':'failed',retryAt:Date.now()+Math.min(300000,5000*2**attempts),error:error.message,diagnostics:error.diagnostics});throw error;}
}

function capture(a){
 const changes=db.prepare('SELECT seq,kind,record_id FROM pos_change_log WHERE seq>? ORDER BY seq LIMIT 1000').all(a.changeCursor||0);
 for(const change of changes){let kind=change.kind,id=change.record_id,inventory=null;if(kind==='stock'){const stock=get('stock',id);if(stock?.type!=='adjustment')continue;id=stock.productId;kind='products';const p=get('products',id);if(p)inventory={quantity:Math.max(0,Number(p.stock||0)-Number(p.reserved||0))};}if(kind==='shipments'){const s=get('shipments',id);id=s?.orderId;kind='orders';const o=id?get('orders',id):null;if(o&&s?.tracking&&(o.posTracking!==s.tracking||o.posCarrier!==s.carrier))inbound(()=>put('orders',{...o,posTracking:s.tracking,posCarrier:s.carrier}));}const row=id?get(kind,id):null;if(!row)continue;if(kind==='orders'&&!acceptsOrder(a,row))continue;if(row.posSourceAccountId&&row.posSourceAccountId!==a.id)continue;if(!a.pushLocal&&row.posSourceAccountId!==a.id&&!linkFor(a,kind,id))continue;
  const existing=get('pos_jobs',linkId(a,kind,id)),link=linkFor(a,kind,id);if(['sending','unknown','conflict'].includes(existing?.state))continue;if(link?.localHash!==hash(fields(kind,row))||printChanged(kind,row,link)||inventory)job(a,kind,id,{...(inventory?{inventory}:{})});
 }
 if(changes.length)setAccount(a,{changeCursor:changes.at(-1).seq});
}
let running=false;
export function recoverPosJobs(){for(const op of all('pos_status_requests').filter(op=>op.state==='sending'))put('pos_status_requests',{...op,state:'unknown',error:'Máy chủ khởi động lại. Đọc lại POS trước khi thử lại.'});for(const j of all('pos_jobs').filter(j=>j.state==='sending'))put('pos_jobs',{...j,state:'unknown',error:'Máy chủ khởi động lại trong lúc gửi. Đối soát POS trước khi thử lại.'});}
export async function posTick(request){
 if(running||statusUpdates.size)return;running=true;
 try{for(const draft of all('pos_setup_drafts').filter(d=>d.expiresAt<Date.now()))transaction(()=>{db.prepare('DELETE FROM secrets WHERE id=?').run(draft.id);remove('pos_setup_drafts',draft.id);});for(const original of all('pos_accounts').filter(active)){
  let a=account(original.id);
  for(const j of all('pos_jobs').filter(j=>j.accountId===a.id&&j.kind==='customers'&&['queued','failed'].includes(j.state)))if(!posCustomerEligible(get('customers',j.localId)))skipCustomer(j);
  capture(a);a=account(a.id);
  try{
   // Outgoing changes have priority; a webhook also marks forcePull to refresh promptly.
   const queued=all('pos_jobs').filter(j=>j.accountId===a.id&&j.state==='queued'&&(!j.retryAt||j.retryAt<=Date.now())).reverse().slice(0,20);
   for(const j of queued){if(!active(account(a.id)))break;try{await push(a,j,request);}catch(e){const saved=get('pos_jobs',j.id);if(saved?.state==='queued'&&!(saved.retryAt>Date.now())){const attempts=(saved.attempts||0)+1;put('pos_jobs',{...saved,attempts,state:e.status===409?'conflict':e.retryable&&attempts<5?'queued':'failed',retryAt:Date.now()+Math.min(300000,5000*2**attempts),error:e.message,diagnostics:e.diagnostics});}if(e.status===401)setAccount(a,{status:'authentication_error',lastError:e.message});}}
   if(!active(account(a.id)))continue;
   if((!a.nextPullAt||Date.now()>=a.nextPullAt)&&(a.forcePull||!a.lastPullAt||Date.now()-Date.parse(a.lastPullAt)>=30000))await pull(account(a.id),request);
   for(const error of all('pos_errors').filter(e=>e.accountId===a.id&&e.state==='open').slice(0,20)){const row=get('pos_remote',error.id)?.data;if(row)try{await applyPosRow(a,error.kind,row);put('pos_errors',{...error,state:'resolved'});}catch{}}
   a=account(a.id);if(a.pushExisting){for(const kind of kinds)for(const row of all(kind)){if(kind==='orders'&&!acceptsOrder(a,row))continue;if(row.posSourceAccountId&&row.posSourceAccountId!==a.id)continue;const l=linkFor(a,kind,row.id),pending=get('pos_jobs',linkId(a,kind,row.id));if(!a.pushLocal&&!l&&row.posSourceAccountId!==a.id)continue;if(l?.localHash!==hash(fields(kind,row))&&!['conflict','unknown','sending'].includes(pending?.state))job(a,kind,row.id);}setAccount(a,{pushExisting:false});}
  }catch(e){const failures=(account(a.id).pullFailures||0)+1;setAccount(a,{lastError:e.message,pullFailures:failures,nextPullAt:Date.now()+Math.min(300000,5000*2**failures),syncPhase:'Cần kiểm tra',...(e.status===401?{status:'authentication_error'}:{})});}
 }}finally{running=false;}
}

export function posState(user){if(user?.role!=='owner')return null;return {accounts:all('pos_accounts').map(a=>({...a,counts:{linked:links(a).length,queued:all('pos_jobs').filter(j=>j.accountId===a.id&&['queued','sending'].includes(j.state)).length,issues:all('pos_jobs').filter(j=>j.accountId===a.id&&['failed','conflict','unknown'].includes(j.state)).length}})),issues:all('pos_jobs').filter(j=>['failed','conflict','unknown'].includes(j.state)).slice(0,100).map(({target,remoteTarget,...j})=>({...j,name:get(j.kind,j.localId)?.name||get(j.kind,j.localId)?.code||j.localId})),inboundErrors:all('pos_errors').filter(e=>e.state==='open').slice(0,30)};}
export function receivePosWebhook(id,headers,payload,schedule=()=>void posTick().catch(e=>console.error('POS webhook worker:',e.message))){const a=account(id),expected=secret(keyFor(id)).webhookToken,supplied=String(headers['x-api-key']||'');if(!active(a)||!expected||supplied.length>512||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))fail('Webhook POS không hợp lệ.',403);const shop=payload?.shop_id??payload?.data?.record?.shop_id;if(shop!==undefined&&String(shop)!==String(a.shopId))fail('Webhook không thuộc shop.',403);if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('Nội dung webhook không hợp lệ.');const eventId=id+':'+hash(payload);if(get('pos_hook_events',eventId))return {ok:true,duplicate:true};transaction(()=>{put('pos_hook_events',{id:eventId,accountId:id,receivedAt:now()});setAccount(a,{forcePull:true,lastWebhookAt:now()});});schedule();return {ok:true};}
export async function posRoute(path,method,input,user,url,request=pancakeRequest){
 if(!path.startsWith('/api/pos/'))return undefined;
 const statusRoute=path.match(/^\/api\/pos\/orders\/([^/]+)\/status$/);
 if(statusRoute&&['GET','POST'].includes(method)){
  permission(user,'orders');const id=decodeURIComponent(statusRoute[1]),o=get('orders',id);if(!o||o.deletedAt)fail('Không tìm thấy đơn hàng.',404);assertCustomer(user,o.customerId);
  const ls=all('pos_links').filter(l=>l.kind==='orders'&&l.localId===id);if(ls.length!==1)fail('Đơn chưa liên kết duy nhất với POS. Mở chi tiết để gửi / đối soát.',409);
  const l=ls[0],a=account(l.accountId),r=reqFor(a,request),read=()=>remoteCurrent(a,'orders',l,r),directCarrier=all('shipments').some(s=>s.orderId===id&&s.carrier==='viettelpost'&&s.tracking&&s.status!=='cancelled');
  if(method==='GET'&&l.remote?.status!=null&&Number.isInteger(Number(l.remote.status))){const remote=l.remote;return {status:Number(remote.status),options:posStatusOptions(remote,{directCarrier}),operation:get('pos_status_requests',id),carrierStatus:remote.partner?.partner_status||null,cached:true};}
  if(statusUpdates.has(id)||method==='POST'&&running)fail('Đang đồng bộ POS. Vui lòng thử lại sau vài giây.',409);
  statusUpdates.add(id);
  try{
   const pending=get('pos_jobs',linkId(a,'orders',id));if(method==='POST'&&pending&&!['done','skipped'].includes(pending.state))fail('Đơn có thay đổi đang chờ đồng bộ / đối soát POS. Xử lý trong chi tiết trước.',409);
   if(method==='GET'){const remote=await read();if(!remote)fail('Không tìm thấy đơn POS.',404);return {status:Number(remote.status),options:posStatusOptions(remote,{directCarrier}),operation:get('pos_status_requests',id),carrierStatus:remote.partner?.partner_status||null};}
   if(input.version!==o.version)fail('Đơn vừa thay đổi. Tải lại trước khi chuyển trạng thái.',409);
   const result=await updatePosOrderStatus({input,read,directCarrier,write:status=>r(root(a)+'/orders/'+encodeURIComponent(l.remoteId),{method:'PUT',body:{status}}),commit:async remote=>{if(get('orders',id).version!==o.version){await applyPosRow(a,'orders',remote);fail('Đơn đã được chỉnh sửa trong khi POS xử lý. Mở lại để đối soát.',409);}await applyPosRow(a,'orders',remote,{force:true});},journal:{get:()=>get('pos_status_requests',id),set:op=>put('pos_status_requests',{...op,id,actor:user.id,updatedAt:now()})}});
   audit(user.id,'pos_order_status_changed',id,result);return {...result,order:orderPOSFields([get('orders',id)])[0]};
  }finally{statusUpdates.delete(id);}
 }
 const shippingOptions=path.match(/^\/api\/pos\/accounts\/([^/]+)\/shipping-options$/);
 if(shippingOptions&&method==='GET'){permission(user,'orders');const a=account(shippingOptions[1]),cached=shippingOptionCache.get(a.id);if(cached&&Date.now()-cached.at<60000)return cached.data;const result=await reqFor(a,request)(root(a)+'/partners'),rows=result.data||result.partners||[];if(!Array.isArray(rows))fail('POS chưa trả danh sách vận chuyển hợp lệ.',502);const data={partners:rows.filter(p=>p.is_linked||Array.isArray(p.accounts)&&p.accounts.length).map(p=>({id:p.id,name:p.name||p.partner_name||'ĐVVC'}))};shippingOptionCache.set(a.id,{at:Date.now(),data});return data;}
 const deletion=path.match(/^\/api\/pos\/orders\/([^/]+)\/delete$/);
 if(deletion&&method==='POST'){
  owner(user);const id=decodeURIComponent(deletion[1]),o=get('orders',id);if(!o)fail('Không tìm thấy đơn.',404);assertCustomer(user,o.customerId);
  const deletionRequest=get('pos_delete_requests',id);if(o.deletedAt&&deletionRequest?.state==='done')return {orderId:id,deleted:true,paidPreserved:o.paid};if(input.version!==o.version&&!deletionRequest)fail('Đơn đã thay đổi. Mở lại đơn trước khi xóa.',409);
  const a=account(o.fulfillmentTarget?.slice(4)),l=linkFor(a,'orders',id);if(!l)fail('Chưa đối chiếu được đơn POS.',409);
  const r=reqFor(a,request);let remote=await remoteCurrent(a,'orders',l,r);
  if(![0,1,8,9,11,6,7].includes(Number(remote?.status)))fail('Đơn đã bàn giao; cần xử lý hoàn hàng.',409);
  const p=remote?.partner||{};if(p.extend_code&&!['request_received','waiting','processing_picked_up','picking_up','canceled',null,undefined].includes(p.partner_status))fail('Hãng đã lấy hàng; không thể xóa đơn.',409);
  const path=root(a)+'/orders/'+encodeURIComponent(l.remoteId);
  if(!deletionRequest)put('pos_delete_requests',{id,orderId:id,actor:user.id,state:'waiting',requestedAt:now()});
  if(![6,7].includes(Number(remote.status))){await r(path,{method:'PUT',body:{status:6}});remote=await remoteCurrent(a,'orders',l,r);}
  if(![6,7].includes(Number(remote?.status)))fail('POS chưa xác nhận hủy đơn. Không xóa tại hệ thống.',409);
  if(remote.partner?.extend_code&&remote.partner?.partner_status!=='canceled')return {orderId:id,pending:true,message:'Đang chờ hãng xác nhận hủy vận đơn trước khi xóa.'};
  if(Number(remote.status)!==7){await r(path,{method:'PUT',body:{status:7}});remote=await remoteCurrent(a,'orders',l,r);}
  if(Number(remote?.status)!==7)fail('POS chưa xác nhận xóa mềm. Không tự gửi lại.',409);
  await applyPosRow(a,'orders',remote);const saved=get('orders',id);if(!saved.deletedAt)fail('Đã xóa trên POS nhưng cần đối soát bản ghi nội bộ.',409);put('pos_delete_requests',{...get('pos_delete_requests',id),state:'done',completedAt:now()});audit(user.id,'pos_order_deleted',id,{tracking:p.order_number_vtp||p.extend_code,paidPreserved:saved.paid});return {orderId:id,deleted:true,paidPreserved:saved.paid};
 }
 const template=path.match(/^\/api\/pos\/accounts\/([^/]+)\/notification-template$/);
 if(template){owner(user);const a=account(template[1]);if(method==='GET')return a.trackingTemplate||{text:''};if(method==='POST'){const text=String(input.text||'').trim();if(text.length>8000)fail('Mẫu tối đa 8000 ký tự.');const allowed=['PRODUCT_NO_ATTRIBUTE','TRACKING_ID','TRACKING_URL','PARTNER_FEE','PARTNER_NAME','FULL_NAME','PHONE_NUMBER','FULL_ADDRESS','DELIVERY_TEL'];for(const token of text.matchAll(/#\{([^}]+)\}/g))if(!allowed.includes(token[1]))fail('Chưa hỗ trợ biến '+token[1]);setAccount(a,{trackingTemplate:{text,source:'pos-manual-copy',updatedAt:now()}});audit(user.id,'pos_tracking_template_updated',a.id);return {ok:true};}}
 const dispatch=path.match(/^\/api\/pos\/orders\/([^/]+)\/dispatch$/);
 if(dispatch&&['POST','GET'].includes(method)){
  permission(user,'orders');let orderId;try{orderId=decodeURIComponent(dispatch[1]);}catch{fail('Mã đơn hàng không hợp lệ.');}let o=get('orders',orderId);if(!o)fail('Không tìm thấy đơn hàng.',404);assertCustomer(user,o.customerId);
  const accountId=o.fulfillmentTarget?.startsWith('pos:')?o.fulfillmentTarget.slice(4):String(input.accountId||'');const a=account(accountId);
  if(o.fulfillmentTarget&&o.fulfillmentTarget!=='pos:'+a.id)fail('Đơn đã chọn nơi xử lý khác. Không gửi đồng thời hai bên.',409);
  if(method==='POST'){
   if(!active(a)||!a.warehouseId)fail('Kết nối POS hoặc kho đã ngắt. Kiểm tra Cài đặt → Pancake POS.',409);
   if(!o.items?.length||o.awaitingProducts)fail('Thêm sản phẩm và lưu đơn trước khi gửi POS.',422);
   if(!o.phone||!o.address||!o.receiverName)fail('Nhập đủ tên, số điện thoại và địa chỉ nhận hàng trước khi gửi POS.',422);
   const existing=get('pos_jobs',linkId(a,'orders',o.id));
   if(!o.posDispatchRequested)o=put('orders',{...o,fulfillmentTarget:'pos:'+a.id,posDispatchRequested:true,...(input.notifyCustomer===true&&o.conversationId?{trackingNotification:{enabled:true,recipientDetailsConsent:input.recipientDetailsConsent===true,actor:user.id,requestedAt:now()}}:{})});
   if(!existing||['failed','skipped'].includes(existing.state)||existing.state==='done'&&(linkFor(a,'orders',o.id)?.localHash!==hash(fields('orders',o))||printChanged('orders',o,linkFor(a,'orders',o.id))))job(a,'orders',o.id);
  }
  const j=get('pos_jobs',linkId(a,'orders',o.id)),link=linkFor(a,'orders',o.id),r=link?.remote;
  return {orderId:o.id,code:o.code,accountId:a.id,shopName:a.shopName||a.name,state:j?.state||'queued',error:j?.error||'',syncedAt:j?.syncedAt||link?.syncedAt||null,remote:r?{id:remoteId('orders',r),code:orderCode(r),status:r.status,warehouseId:r.warehouse_id,receiver:r.shipping_address?.full_name||r.bill_full_name,phone:r.shipping_address?.phone_number||r.bill_phone_number,address:orderAddress(r),email:r.bill_email,items:r.items,total:Number(r.total_price??o.total),paid:paidAmount(r),shippingFee:Number(r.shipping_fee||0),tracking:r.partner?.order_number_vtp||r.partner?.extend_code||'',carrier:r.partner?.partner_name||'',updatedAt:r.updated_at}:null};
 }
 owner(user);
 if(path==='/api/pos/state'&&method==='GET')return posState(user);
 if(path==='/api/pos/discover'&&method==='POST'){
  const apiKey=String(input.apiKey||'').trim();if(apiKey.length<12||apiKey.length>4096)fail('Nhập API key Pancake POS.');const result=await request(apiKey,'/shops');if(!Array.isArray(result.shops)||!result.shops.length)fail('API key chưa có shop nào được cấp quyền.',422);
  const draftId=uid('pos-draft');transaction(()=>{saveSecret(draftId,{apiKey,userId:user.id,at:Date.now(),shops:result.shops.map(s=>({id:String(s.id),name:s.name}))});put('pos_setup_drafts',{id:draftId,userId:user.id,expiresAt:Date.now()+600000});});return {draftId,shops:result.shops.map(s=>({id:String(s.id),name:s.name}))};
 }
 const draftMatch=path.match(/^\/api\/pos\/drafts\/([^/]+)\/warehouses$/);
 if(draftMatch&&method==='GET'){const draft=secret(draftMatch[1]);if(draft.userId!==user.id||Date.now()-draft.at>600000)fail('Phiên thiết lập đã hết hạn. Nhập lại API key.',409);const shopId=url.searchParams.get('shopId');if(!draft.shops.some(s=>s.id===shopId))fail('Shop không thuộc API key.',403);const result=await request(draft.apiKey,'/shops/'+shopId+'/warehouses');return {warehouses:result.data||result.warehouses||[]};}
 if(path==='/api/pos/connect'&&method==='POST'){
  const draft=secret(String(input.draftId||''));if(draft.userId!==user.id||Date.now()-draft.at>600000)fail('Phiên thiết lập đã hết hạn. Kiểm tra API key lại.',409);const shopId=String(input.shopId),shop=draft.shops.find(s=>s.id===shopId);if(!shop)fail('Shop không thuộc API key.',403);
  const response=await request(draft.apiKey,'/shops/'+shopId+'/warehouses'),warehouses=response.data||response.warehouses||[],warehouse=warehouses.find(w=>String(w.id)===String(input.warehouseId));if(!warehouse||warehouse.allow_create_order===false)fail('Chọn kho POS được phép tạo đơn.');
  const old=all('pos_accounts').find(a=>a.shopId===shopId),id=old?.id||uid('pos');if(all('pos_accounts').some(a=>a.id!==id&&a.active)&&input.defaultAccount!==false)for(const other of all('pos_accounts').filter(a=>a.id!==id))put('pos_accounts',{...other,pushLocal:false});
  transaction(()=>{saveSecret(keyFor(id),{apiKey:draft.apiKey,webhookToken:secret(keyFor(id)).webhookToken||randomBytes(32).toString('hex')});put('pos_accounts',{...old,id,ownerId:user.id,name:String(input.name||shop.name).slice(0,150),shopId,shopName:shop.name,warehouseId:String(warehouse.id),warehouseName:warehouse.name,active:true,status:'connected',pushLocal:input.defaultAccount!==false,changeCursor:old?.changeCursor??changeSequence(),pushExisting:input.pushExisting!==false,forcePull:true,nextPullAt:0,lastError:'',syncPhase:'Chờ đồng bộ',warehouses:warehouses.map(w=>({id:String(w.id),name:w.name}))});saveSecret(input.draftId,{});remove('pos_setup_drafts',input.draftId);audit(user.id,'pancake_connected',id,{shopId});});return posState(user);
 }
 const m=path.match(/^\/api\/pos\/accounts\/([^/]+)\/(sync|pause|resume|disconnect|webhook)$/);
 if(m&&method==='POST'){
  const a=account(m[1]),action=m[2];if(action==='sync'){setAccount(a,{forcePull:true,nextPullAt:0,...(input.full?{lastPullAt:null}:{}),...(input.pushExisting?{pushExisting:true}:{})});}
  if(action==='pause')setAccount(a,{active:false,status:'paused'});
  if(action==='resume'){if(!secret(keyFor(a.id)).apiKey)fail('Kết nối lại bằng API key.');setAccount(a,{active:true,status:'connected',forcePull:true,pushExisting:true});}
  if(action==='disconnect'){setAccount(a,{active:false,status:'disconnected'});saveSecret(keyFor(a.id),{});}
  if(action==='webhook'){
   const base=process.env.PUBLIC_BASE_URL||'https://quanlydakenh.vercel.app';const webhookUrl=new URL('/api/pos/webhooks/'+encodeURIComponent(a.id),base).href;if(!webhookUrl.startsWith('https://'))fail('Webhook cần địa chỉ HTTPS công khai.');
   await reqFor(a,request)(root(a),{method:'PUT',body:{shop:{webhook_enable:true,webhook_url:webhookUrl,webhook_types:['orders','customers','products','variations_warehouses'],webhook_headers:{'X-API-KEY':secret(keyFor(a.id)).webhookToken}}}});setAccount(a,{webhookConfigured:true,webhookUrl});
  }return posState(user);
 }
 const jm=path.match(/^\/api\/pos\/jobs\/([^/]+)\/(retry|local|remote|reconcile)$/);
 if(jm&&method==='POST'){
  const j=get('pos_jobs',decodeURIComponent(jm[1]));if(!j)fail('Không tìm thấy mục đồng bộ.',404);const a=account(j.accountId);if(!active(a))fail('Bật lại kết nối trước khi xử lý.');
  if(jm[2]==='remote'){const l=linkFor(a,j.kind,j.localId);if(!l)fail('Chưa có bản ghi POS để nhận lại.');const row=await remoteCurrent(a,j.kind,l,reqFor(a,request));if(!row)fail('POS không còn bản ghi.');await applyPosRow(a,j.kind,row,{force:true});put('pos_jobs',{...j,state:'done',error:''});}
  else if(jm[2]==='reconcile'){const l=linkFor(a,j.kind,j.localId),r=reqFor(a,request),current=get(j.kind,j.localId),found=l?await remoteCurrent(a,j.kind,l,r):await locate(a,j.kind,current,r);if(!found)fail('Chưa tìm thấy kết quả POS. Kiểm tra ở POS trước khi cho phép gửi lại.',409);const remoteFields=comparable(a,j.kind,found,current);saveLink(a,j.kind,j.localId,found,{localHash:hash(j.target),remoteHash:hash(remoteFields),syncedAt:now()});put('pos_jobs',{...j,state:hash(remoteFields)===hash(j.target)&&(!j.inventory||trackedStock(a,found)===j.inventory.quantity)?'done':'conflict',error:hash(remoteFields)===hash(j.target)&&(!j.inventory||trackedStock(a,found)===j.inventory.quantity)?'':'Dữ liệu POS khác yêu cầu đã gửi. Chọn bên cần giữ.',remoteTarget:remoteFields});}
  else {if(j.state==='unknown')fail('Đối soát kết quả chưa xác định trước khi gửi lại.',409);job(a,j.kind,j.localId,{force:jm[2]==='local',...(j.inventory?{inventory:{quantity:Math.max(0,Number(get(j.kind,j.localId)?.stock||0)-Number(get(j.kind,j.localId)?.reserved||0))}}:{})});}return posState(user);
 }
 fail('Không tìm thấy chức năng POS.',404);
}
