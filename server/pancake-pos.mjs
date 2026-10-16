import {randomBytes,timingSafeEqual} from 'node:crypto';
import {db,all,get,put,remove,saveSecret,secret,transaction,audit,now,uid} from './store.mjs';
import {inbound,changeSequence,phoneExpression} from './pancake-storage.mjs';
import {pancakeRequest,pancakePages} from './pancake-api.mjs';
import {hash,fields,normalizePhone,remoteId,fromProduct,fromCustomer,localStatus,orderBody,paidAmount} from './pancake-model.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const kinds=['products','customers','orders'];
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
function job(a,kind,id,patch={}){const current=get(kind,id);if(!current)return;const existing=get('pos_jobs',linkId(a,kind,id));return put('pos_jobs',{...existing,id:linkId(a,kind,id),accountId:a.id,kind,localId:id,state:'queued',attempts:0,error:'',force:false,inventory:null,retryAt:0,target:fields(kind,current),...patch});}
function trackedStock(a,v){const w=(v.variations_warehouses||[]).find(w=>String(w.warehouse_id)===a.warehouseId);return Number(w?.remain_quantity??0);}
function snapshot(a,kind,row){const id=linkId(a,kind,remoteId(kind,row));if(hash(get('pos_remote',id)?.data)!==hash(row))put('pos_remote',{id,accountId:a.id,kind,data:row});}
function rowsIn(data){const row=data?.data??data;return Array.isArray(row)?row[0]:row;}
function comparable(a,kind,row,current){
 if(kind==='products')return fields(kind,fromProduct({...row,weight:row.weight??row.product?.weight??current?.weight}));
 if(kind==='customers')return fields(kind,fromCustomer(row));
 return fields(kind,{...current,receiverName:row.shipping_address?.full_name||row.bill_full_name||'',phone:row.shipping_address?.phone_number||row.bill_phone_number||'',email:row.bill_email||'',address:row.shipping_address?.full_address||'',items:(row.items||[]).map(i=>({productId:findRemote(a,'products',i.variation_id)?.localId||'unmapped:'+i.variation_id,quantity:i.quantity,price:i.variation_info?.retail_price||0})),discount:row.total_discount||0,shippingFee:row.shipping_fee||0,paid:paidAmount(row),status:localStatus(row.status),note:row.note||'',posTracking:row.partner?.extend_code||row.partner?.order_number_vtp||'',posCarrier:row.partner?.partner_name||''});
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
  if(!c){c=inbound(()=>put('customers',{id:'pos-customer:'+a.id+':'+rid,name:row.bill_full_name||'Khách đơn POS '+rid,phone:normalizePhone(row.bill_phone_number),email:row.bill_email||'',address:row.shipping_address?.full_address||'',tags:[],createdBy:a.ownerId,posSourceAccountId:a.id}));}
  const status=localStatus(row.status);if(!status)fail('Chưa hỗ trợ trạng thái POS '+row.status+'.',422);
  const subtotal=items.reduce((sum,i)=>sum+i.price*i.quantity,0),total=Math.max(0,subtotal-Number(row.total_discount||0)+Number(row.shipping_fee||0)),paid=Math.max(0,Number(row.cash||0)+Number(row.transfer_money||0)+['charged_by_card','charged_by_momo','charged_by_vnpay','charged_by_qrpay','charged_by_fundiin','charged_by_kredivo'].reduce((n,k)=>n+Number(row[k]||0),0));
  mapped={customerId:c.id,receiverName:row.shipping_address?.full_name||row.bill_full_name||c.name,phone:normalizePhone(row.shipping_address?.phone_number||row.bill_phone_number),email:row.bill_email||'',address:row.shipping_address?.full_address||'',items,subtotal,discount:Number(row.total_discount||0),shippingFee:Number(row.shipping_fee||0),total,paid,status,paymentStatus:paid>=total?'paid':paid?'partial':'unpaid',requiresShipping:!row.received_at_shop,note:row.note||'',posTracking:row.partner?.extend_code||row.partner?.order_number_vtp||'',posCarrier:row.partner?.partner_name||''};
  if(!link){const matches=all('orders').filter(o=>row.custom_id&&o.code===row.custom_id&&!linkFor(a,kind,o.id));if(matches.length>1)fail('Mã đơn trùng; cần đối soát.',409);current=matches[0]||null;}
 }
 snapshot(a,kind,row);
 if(kind==='products'&&link&&current&&current.posAvailableStock!==trackedStock(a,row)&&!get('pos_jobs',linkId(a,kind,current.id))?.inventory){current=inbound(()=>put('products',{...current,stock:Math.max(0,trackedStock(a,row))+Number(current.reserved||0),posAvailableStock:trackedStock(a,row),posStockUpdatedAt:now()}));}
 const incoming=fields(kind,mapped),local=current?fields(kind,current):null;
 if(current&&!force&&hash(incoming)!==hash(local)&&(!link||link.localHash!==hash(local)&&link.remoteHash!==hash(incoming))){
  saveLink(a,kind,current.id,row,{localHash:link?.localHash,remoteHash:link?.remoteHash});job(a,kind,current.id,{state:'conflict',error:'Dữ liệu hai bên khác nhau. Chọn bên cần giữ trước khi ghi đè.',remoteTarget:incoming});return {conflict:true};
 }
 // A repeated webhook/poll must never erase a new local edit waiting in the outbox.
 if(current&&!force&&link&&hash(local)!==link.localHash&&hash(incoming)===link.remoteHash)return {pending:true};
 if(current&&link&&!force&&link.remoteHash===hash(incoming))return {unchanged:true};
 const id=current?.id||'pos:'+a.id+':'+kind+':'+rid;
 inbound(()=>{
  if(kind==='orders'){
   const before=current?.status==='confirmed'?current.items||[]:[],after=mapped.status==='confirmed'?mapped.items:[],delta=new Map();
   for(const i of before)if(!i.productType||i.productType==='physical')delta.set(i.productId,(delta.get(i.productId)||0)-i.quantity);
   for(const i of after)if(!i.productType||i.productType==='physical')delta.set(i.productId,(delta.get(i.productId)||0)+i.quantity);
   for(const [productId,diff] of delta)if(diff){const p=get('products',productId);if(p){const reserved=Math.max(0,Number(p.reserved||0)+diff);put('products',{...p,reserved,stock:Math.max(0,Number(p.stock||0)-Number(p.reserved||0))+reserved});}}
  }
  const saved=put(kind,{...current,...mapped,id,...(!current?{posSourceAccountId:a.id,createdBy:a.ownerId,tags:[],...(kind==='orders'?{code:row.custom_id||'POS-'+a.shopId+'-'+rid,source:'Pancake POS',createdAt:row.inserted_at}:{}),...(kind==='products'?{stock:Math.max(0,trackedStock(a,row)),reserved:0}:{} )}:{}),...(kind==='products'?{posAvailableStock:trackedStock(a,row),posStockUpdatedAt:now()}:{}),posSyncedAt:now()});
  saveLink(a,kind,id,row,{localHash:hash(fields(kind,saved)),remoteHash:hash(incoming),syncedAt:now()});
  if(kind==='orders'&&mapped.posTracking){const old=all('shipments').find(s=>s.orderId===id&&s.tracking===mapped.posTracking);put('shipments',{...old,id:old?.id||'pos-shipment:'+a.id+':'+rid,orderId:id,carrier:old?.carrier||'pancake_pos',tracking:mapped.posTracking,status:mapped.status==='shipping'?'shipping':mapped.status,cod:Number(row.partner?.cod||0),fee:Number(row.partner?.total_fee||0),posAccountId:a.id,requiresReconciliation:mapped.status==='return_pending_check'});}
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
 await pancakePages(r,root(a)+'/'+(kind==='products'?'products/variations':kind),query,rows=>{for(const row of rows){const exact=kind==='products'?fromProduct(row).sku===current.sku:kind==='customers'?(row.phone_numbers||[]).some(p=>normalizePhone(p)===normalizePhone(current.phone)):row.custom_id===current.code;if(exact)matches.push(row);}});
 if(matches.length>1)fail('Nhiều bản ghi POS trùng khóa đối chiếu. Cần đối soát thủ công.',409);return matches[0]||null;
}
async function remoteCurrent(a,kind,link,r){
 if(kind==='products'){const out=await r(root(a)+'/products/variations',{query:{'variation_ids[]':link.remoteId,page_size:100,page_number:1}});return (out.data||[]).find(v=>String(v.id)===link.remoteId)||null;}
 return rowsIn(await r(root(a)+'/'+kind+'/'+encodeURIComponent(link.remoteId)));
}

async function push(a,j,request){
 const r=reqFor(a,request),current=get(j.kind,j.localId);if(!current)return put('pos_jobs',{...j,state:'skipped',error:'Dữ liệu nội bộ không còn.'});
 let link=linkFor(a,j.kind,j.localId),remote=link?await remoteCurrent(a,j.kind,link,r):await locate(a,j.kind,current,r);
 if(remote&&!link){await applyPosRow(a,j.kind,remote);link=linkFor(a,j.kind,current.id);if(!link)fail('Bản ghi POS đã liên kết với hồ sơ khác. Cần đối soát.',409);if(get('pos_jobs',j.id)?.state==='conflict'&&!j.force)fail('Bản ghi đã tồn tại ở POS với thông tin khác. Chọn bên cần giữ.',409);}
 if(link&&!remote)fail('Không tìm thấy bản ghi đã liên kết trên POS. Không tự tạo lại để tránh trùng.',409);
 if(remote&&link&&!j.force){
  const before=link.remote;const remoteChanged=hash(remote)!==hash(before);
  if(remoteChanged){await applyPosRow(a,j.kind,remote);if(get('pos_jobs',j.id)?.state==='conflict')fail('Cả hai bên đã thay đổi. Chọn bên cần giữ.',409);if(link.localHash===hash(fields(j.kind,current))&&!j.inventory)return put('pos_jobs',{...j,state:'done',error:''});}
 }
 const local=fields(j.kind,current);if(link?.localHash===hash(local)&&!j.force&&!j.inventory)return put('pos_jobs',{...j,state:'done',error:'',syncedAt:now()});
 let body,path,method=link?'PUT':'POST';
 if(j.kind==='customers'){
  if(!local.phone)fail('Khách hàng chưa có số điện thoại. Bổ sung SĐT để tạo trên POS.',422);
  body=link?{customer:{name:local.name,phone_numbers:[local.phone,...(remote.phone_numbers||[]).slice(1)],emails:[...(local.email?[local.email]:[]),...(remote.emails||[]).slice(1)],shop_customer_address:[{...(remote.shop_customer_address?.[0]||{}),full_name:local.name,phone_number:local.phone,full_address:local.address},...(remote.shop_customer_address||[]).slice(1)]}}:{name:local.name,phoneNumber:local.phone,shop_customer_address:[{full_name:local.name,phone_number:local.phone,full_address:local.address}]};
  path=root(a)+'/customers'+(link?'/'+encodeURIComponent(link.remoteId):'');
 }else if(j.kind==='products'){
  if(!local.sku)fail('Sản phẩm chưa có SKU.',422);
  const variation={...(link?remote:{}),...(link?{id:link.remoteId}:{}),custom_id:local.sku,retail_price:local.price,last_imported_price:local.cost,weight:local.weight,is_hidden:!local.active};delete variation.product;
  if(!link)variation.variations_warehouses=[{warehouse_id:a.warehouseId,remain_quantity:Number(current.stock||0)}];
  let product={name:local.name,weight:local.weight,custom_id:local.sku,is_published:local.active,type:current.productType==='physical'?'product':'service',variations:[variation]};
  if(link){const full=rowsIn(await r(root(a)+'/products/'+encodeURIComponent(remote.product?.custom_id||remote.product?.display_id||remote.product_id)));if(!full?.variations)fail('POS chưa trả đủ biến thể. Không cập nhật để tránh mất biến thể khác.',409);if(full.variations.length>1&&local.name!==fromProduct(remote).name)fail('Sản phẩm có nhiều biến thể. Đổi tên chung tại POS để tránh đổi tên các biến thể khác.',409);product={...full,name:full.variations.length>1?full.name:local.name,variations:full.variations.map(v=>String(v.id)===link.remoteId?{...v,...variation}:v)};}
  if(link){delete product.variations_warehouses;product.variations=product.variations.map(({variations_warehouses,...v})=>v);}
  body={product};path=root(a)+'/products'+(link?'/'+encodeURIComponent(remote.product_id):'');
 }else{
  if(!a.warehouseId)fail('Chọn kho POS trước khi đồng bộ đơn.',422);
  const c=get('customers',current.customerId);if(!c)fail('Đơn thiếu khách hàng.',422);
  if(!linkFor(a,'customers',c.id)){await push(a,{id:linkId(a,'customers',c.id),accountId:a.id,kind:'customers',localId:c.id,state:'queued'},request);}
  const items=[];for(const i of current.items||[]){let p=linkFor(a,'products',i.productId);if(!p){await push(a,{id:linkId(a,'products',i.productId),accountId:a.id,kind:'products',localId:i.productId,state:'queued'},request);p=linkFor(a,'products',i.productId);}if(!p)fail('Chưa liên kết được sản phẩm của đơn.',422);items.push({product_id:p.remote.product_id,variation_id:p.remoteId,quantity:i.quantity,variation_info:{name:i.name,retail_price:i.price},discount_each_product:0});}
  const shipment=all('shipments').find(s=>s.orderId===current.id&&s.status!=='cancelled');body=orderBody(current,c,items,a,shipment);if(link){const other=Number(remote.transfer_money||0)+['charged_by_card','charged_by_momo','charged_by_vnpay','charged_by_qrpay','charged_by_fundiin','charged_by_kredivo'].reduce((n,k)=>n+Number(remote[k]||0),0);if(current.paid<other)fail('Khoản hoàn tiền liên quan thanh toán POS. Đối soát thanh toán trên POS trước.',409);body.cash=current.paid-other;if(body.partner)body.partner={...remote.partner,...body.partner};}path=root(a)+'/orders'+(link?'/'+encodeURIComponent(link.remoteId):'');
 }
 const version=current.version;j={...j,target:local};put('pos_jobs',{...j,state:'sending',attempts:(j.attempts||0)+1,startedAt:now()});let acknowledged=false;
 try{
  const result=await r(path,{method,body});
  acknowledged=true;
  // Some POS create endpoints acknowledge success without returning an ID. Always read back.
  let saved=link?await remoteCurrent(a,j.kind,link,r):await locate(a,j.kind,current,r);
  if(!saved)throw Object.assign(Error('POS đã nhận yêu cầu nhưng chưa đối chiếu được bản ghi. Không tự gửi tạo lại.'),{unknown:true});
  if(!link&&j.kind==='customers'&&local.email){await r(root(a)+'/customers/'+encodeURIComponent(remoteId('customers',saved)),{method:'PUT',body:{customer:{...saved,emails:[local.email]}}});saved=rowsIn(await r(root(a)+'/customers/'+encodeURIComponent(remoteId('customers',saved))));}
  if(j.inventory&&j.kind==='products'){const sid=remoteId('products',saved);await r(root(a)+'/variations/'+encodeURIComponent(sid)+'/update_quantity',{method:'POST',body:{variations_warehouses:[{warehouse_id:a.warehouseId,remain_quantity:j.inventory.quantity}]}});saved=await remoteCurrent(a,'products',{remoteId:sid},r);if(!saved||trackedStock(a,saved)!==j.inventory.quantity)throw Object.assign(Error('Tồn kho đọc lại từ POS chưa khớp số lượng đã gửi. Cần đối soát.'),{unknown:true});}
  const remoteFields=comparable(a,j.kind,saved,current);saveLink(a,j.kind,current.id,saved,{localHash:hash(local),remoteHash:hash(remoteFields),syncedAt:now()});
  if(hash(remoteFields)!==hash(local)){put('pos_jobs',{...j,state:'conflict',error:'POS đã nhận nhưng dữ liệu đọc lại chưa khớp. Kiểm tra và chọn bên cần giữ.',remoteTarget:remoteFields});return;}
  put('pos_jobs',{...j,state:'done',force:false,inventory:null,error:'',syncedAt:now(),localVersion:version});
 }catch(error){if(acknowledged)error.unknown=true;const attempts=get('pos_jobs',j.id)?.attempts||1;put('pos_jobs',{...get('pos_jobs',j.id),state:error.unknown?'unknown':error.status===409?'conflict':error.retryable&&attempts<5?'queued':'failed',retryAt:Date.now()+Math.min(300000,5000*2**attempts),error:error.message});throw error;}
}

function capture(a){
 const changes=db.prepare('SELECT seq,kind,record_id FROM pos_change_log WHERE seq>? ORDER BY seq LIMIT 1000').all(a.changeCursor||0);
 for(const change of changes){let kind=change.kind,id=change.record_id,inventory=null;if(kind==='stock'){const stock=get('stock',id);if(stock?.type!=='adjustment')continue;id=stock.productId;kind='products';const p=get('products',id);if(p)inventory={quantity:Math.max(0,Number(p.stock||0)-Number(p.reserved||0))};}if(kind==='shipments'){const s=get('shipments',id);id=s?.orderId;kind='orders';const o=id?get('orders',id):null;if(o&&s?.tracking&&(o.posTracking!==s.tracking||o.posCarrier!==s.carrier))inbound(()=>put('orders',{...o,posTracking:s.tracking,posCarrier:s.carrier}));}const row=id?get(kind,id):null;if(!row)continue;if(row.posSourceAccountId&&row.posSourceAccountId!==a.id)continue;if(!a.pushLocal&&row.posSourceAccountId!==a.id&&!linkFor(a,kind,id))continue;
  const existing=get('pos_jobs',linkId(a,kind,id)),link=linkFor(a,kind,id);if(['sending','unknown','conflict'].includes(existing?.state))continue;if(link?.localHash!==hash(fields(kind,row))||inventory)job(a,kind,id,{...(inventory?{inventory}:{})});
 }
 if(changes.length)setAccount(a,{changeCursor:changes.at(-1).seq});
}
let running=false;
export function recoverPosJobs(){for(const j of all('pos_jobs').filter(j=>j.state==='sending'))put('pos_jobs',{...j,state:'unknown',error:'Máy chủ khởi động lại trong lúc gửi. Đối soát POS trước khi thử lại.'});}
export async function posTick(request){
 if(running)return;running=true;
 try{for(const draft of all('pos_setup_drafts').filter(d=>d.expiresAt<Date.now()))transaction(()=>{db.prepare('DELETE FROM secrets WHERE id=?').run(draft.id);remove('pos_setup_drafts',draft.id);});for(const original of all('pos_accounts').filter(active)){
  let a=account(original.id);capture(a);a=account(a.id);
  try{
   // Outgoing changes have priority; a webhook also marks forcePull to refresh promptly.
   const queued=all('pos_jobs').filter(j=>j.accountId===a.id&&j.state==='queued'&&(!j.retryAt||j.retryAt<=Date.now())).reverse().slice(0,20);
   for(const j of queued){if(!active(account(a.id)))break;try{await push(a,j,request);}catch(e){const saved=get('pos_jobs',j.id);if(saved?.state==='queued'&&!(saved.retryAt>Date.now())){const attempts=(saved.attempts||0)+1;put('pos_jobs',{...saved,attempts,state:e.status===409?'conflict':e.retryable&&attempts<5?'queued':'failed',retryAt:Date.now()+Math.min(300000,5000*2**attempts),error:e.message});}if(e.status===401)setAccount(a,{status:'authentication_error',lastError:e.message});}}
   if(!active(account(a.id)))continue;
   if((!a.nextPullAt||Date.now()>=a.nextPullAt)&&(a.forcePull||!a.lastPullAt||Date.now()-Date.parse(a.lastPullAt)>=30000))await pull(account(a.id),request);
   for(const error of all('pos_errors').filter(e=>e.accountId===a.id&&e.state==='open').slice(0,20)){const row=get('pos_remote',error.id)?.data;if(row)try{await applyPosRow(a,error.kind,row);put('pos_errors',{...error,state:'resolved'});}catch{}}
   a=account(a.id);if(a.pushExisting){for(const kind of kinds)for(const row of all(kind)){if(row.posSourceAccountId&&row.posSourceAccountId!==a.id)continue;const l=linkFor(a,kind,row.id),pending=get('pos_jobs',linkId(a,kind,row.id));if(!a.pushLocal&&!l&&row.posSourceAccountId!==a.id)continue;if(l?.localHash!==hash(fields(kind,row))&&!['conflict','unknown','sending'].includes(pending?.state))job(a,kind,row.id);}setAccount(a,{pushExisting:false});}
  }catch(e){const failures=(account(a.id).pullFailures||0)+1;setAccount(a,{lastError:e.message,pullFailures:failures,nextPullAt:Date.now()+Math.min(300000,5000*2**failures),syncPhase:'Cần kiểm tra',...(e.status===401?{status:'authentication_error'}:{})});}
 }}finally{running=false;}
}

export function posState(user){if(user?.role!=='owner')return null;return {accounts:all('pos_accounts').map(a=>({...a,counts:{linked:links(a).length,queued:all('pos_jobs').filter(j=>j.accountId===a.id&&['queued','sending'].includes(j.state)).length,issues:all('pos_jobs').filter(j=>j.accountId===a.id&&['failed','conflict','unknown'].includes(j.state)).length}})),issues:all('pos_jobs').filter(j=>['failed','conflict','unknown'].includes(j.state)).slice(0,100).map(({target,remoteTarget,...j})=>({...j,name:get(j.kind,j.localId)?.name||get(j.kind,j.localId)?.code||j.localId})),inboundErrors:all('pos_errors').filter(e=>e.state==='open').slice(0,30)};}
export function receivePosWebhook(id,headers,payload,schedule=()=>void posTick().catch(e=>console.error('POS webhook worker:',e.message))){const a=account(id),expected=secret(keyFor(id)).webhookToken,supplied=String(headers['x-api-key']||'');if(!active(a)||!expected||supplied.length>512||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))fail('Webhook POS không hợp lệ.',403);const shop=payload?.shop_id??payload?.data?.record?.shop_id;if(shop!==undefined&&String(shop)!==String(a.shopId))fail('Webhook không thuộc shop.',403);if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('Nội dung webhook không hợp lệ.');const eventId=id+':'+hash(payload);if(get('pos_hook_events',eventId))return {ok:true,duplicate:true};transaction(()=>{put('pos_hook_events',{id:eventId,accountId:id,receivedAt:now()});setAccount(a,{forcePull:true,lastWebhookAt:now()});});schedule();return {ok:true};}
export async function posRoute(path,method,input,user,url,request=pancakeRequest){
 if(!path.startsWith('/api/pos/'))return undefined;owner(user);
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
