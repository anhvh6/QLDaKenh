import {collectionPolicy} from '../public/shipping-policy.js';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {db,all,get,put,secret,saveSecret,transaction,audit,now,uid} from './store.mjs';
import {permission,fail,required,number,orderAction} from './domain.mjs';
import {assertCustomer} from './taophacdo.mjs';
import {vtpRequest,providerDate,mappedStatus} from './viettelpost.mjs';
db.exec(readFileSync(new URL('../docs/shipping-storage.sqlite.sql',import.meta.url),'utf8'));
db.prepare("UPDATE shipping_requests SET state='unknown',error='Máy chủ khởi động lại. Kiểm tra trên Viettel Post trước khi gửi lại.' WHERE state='sending'").run();
for(const s of all('shipments').filter(s=>s.carrier==='viettelpost'&&s.status==='creating'))put('shipments',{...s,status:'unknown',error:'Chưa rõ kết quả gửi. Kiểm tra trên Viettel Post.'});
const inFlight=new Set();
const accountSecret=id=>'carrier:'+id;
const importing=new Set();
export function carrierOrdersState(user){return user.role==='owner'?all('carrier_orders'):[];}
export async function importVtpOrder(accountId,tracking,request=vtpRequest){
 const a=account(accountId);if(!/^[-A-Za-z0-9]{1,100}$/.test(tracking))fail('Mã vận đơn không hợp lệ.');
 const p=await request(a.environment,'/v2/order/detail-v2',{token:secret(accountSecret(a.id)).token,method:'GET',query:{o:tracking}});
 if(!p||String(p.ORDER_NUMBER)!==tracking||!p.RECEIVER_FULLNAME)fail('Hãng chưa trả đúng chi tiết vận đơn '+tracking+'.');
 if(!a.inventories?.length||!a.inventories.some(i=>String(i.groupaddressId)===String(p.GROUPADDRESS_ID)))fail('Vận đơn không thuộc kho của tài khoản đang kết nối.');
 return transaction(()=>{
  const old=all('carrier_orders').find(o=>o.accountId===a.id&&o.tracking===tracking);
  const at=providerDate(p.ORDER_STATUSDATE),older=old?.carrierUpdatedAt&&at&&at<old.carrierUpdatedAt;
  const row=put('carrier_orders',{...old,id:old?.id||uid('carrier-order'),accountId:a.id,tracking,reference:p.ORDER_REFERENCE||'',source:'viettelpost',receiverName:p.RECEIVER_FULLNAME,phone:p.RECEIVER_PHONE||'',address:p.RECEIVER_ADDRESS||'',productName:p.PRODUCT_NAME||'',quantity:Number(p.PRODUCT_QUANTITY)||0,weight:Number(p.PRODUCT_WEIGHT)||0,declaredValue:Number(p.PRODUCT_PRICE)||0,cod:Number(p.MONEY_COLLECTION)||0,fee:Number(p.MONEY_TOTAL)||0,service:p.ORDER_SERVICE||'',note:p.ORDER_NOTE||'',createdAt:providerDate(p.ORDER_SYSTEMDATE)||old?.createdAt||now(),carrierStatus:older?old.carrierStatus:Number(p.ORDER_STATUS),status:older?old.status:mappedStatus(p.ORDER_STATUS)||'unknown',carrierUpdatedAt:older?old.carrierUpdatedAt:at,carrierData:older?old.carrierData:p,syncedAt:now()});
  replayEvents(a.id,tracking);return {row:get('carrier_orders',row.id),created:!old};
 });
}
export async function syncVtpHistory(user,accountId,input={},request=vtpRequest){
 admin(user);account(accountId);if(importing.has(accountId))fail('Tài khoản đang đồng bộ.',409);
 const text=String(input.tracking||'').trim();if(text.length>12000)fail('Tối đa 100 mã vận đơn mỗi lần.');
 const requested=text?text.split(/[\s,;]+/).filter(Boolean):[];if(requested.some(t=>!/^[-A-Za-z0-9]{1,100}$/.test(t)))fail('Chỉ nhập mã vận đơn, phân cách bằng dấu phẩy hoặc xuống dòng.');
 const events=db.prepare('SELECT DISTINCT tracking FROM shipping_events WHERE account_id=? AND applied=0').all(accountId).map(e=>e.tracking);
 const codes=[...new Set(requested.length?requested:[...events,...all('carrier_orders').filter(o=>o.accountId===accountId).map(o=>o.tracking)])];if(codes.length>100)fail('Quá 100 vận đơn. Nhập từng đợt tối đa 100 mã.');
 importing.add(accountId);const result={created:0,updated:0,failed:[],attempted:codes.length,scope:'known-tracking',at:now()};
 try{let cursor=0;await Promise.all(Array.from({length:Math.min(4,codes.length)},async()=>{while(cursor<codes.length){const code=codes[cursor++];try{const r=await importVtpOrder(accountId,code,request);result[r.created?'created':'updated']++;}catch(error){result.failed.push({tracking:code,message:error.message});}}}));
 put('shipping_accounts',{...get('shipping_accounts',accountId),historySync:result});audit(user.id,'viettelpost_history_sync',accountId,{created:result.created,updated:result.updated,failed:result.failed.length});return result;
 }finally{importing.delete(accountId);}
}
function admin(user){if(user.role!=='owner')fail('Chỉ chủ hệ thống được quản lý kết nối vận chuyển.',403);}
function shippingAccess(user,order){permission(user,user.role==='warehouse'?'shipping':'orders');if(!order)fail('Không tìm thấy đơn.',404);if(user.role!=='warehouse')assertCustomer(user,order.customerId);}
function account(id){const a=get('shipping_accounts',id);if(!a||!a.active||a.status!=='connected')fail('Chọn tài khoản Viettel Post đang kết nối.');return a;}
export function shippingState(user){return all('shipping_accounts').map(a=>({...a,...(user.role==='owner'?{}:{inventories:undefined})}));}
function phone(v,label){const s=required(v,label,25).replace(/[\s.()-]/g,'').replace(/^\+84/,'84');if(!/^(?:0\d{9}|84\d{9})$/.test(s))fail(label+' không hợp lệ.');return s;}
function sender(input){return {name:required(input.name,'Tên người gửi',150),phone:phone(input.phone,'Số điện thoại người gửi'),address:required(input.address,'Địa chỉ đầy đủ của kho gửi',500),inventoryId:String(input.inventoryId||'').slice(0,50)};}
export function shipmentPayload(order,customer,a,input){
 const items=order.items.filter(i=>!i.productType||i.productType==='physical');if(!items.length)fail('Đơn dịch vụ không cần vận chuyển.');
 const from=sender(a.sender||{}),receiverName=required(input.receiverName||order.receiverName||customer?.name,'Tên người nhận',150),receiverPhone=phone(input.receiverPhone||order.phone,'Số điện thoại người nhận'),receiverAddress=required(input.receiverAddress||order.address,'Địa chỉ đầy đủ của người nhận',500);
 const weight=number(input.weight,'Khối lượng kiện (gram)',1,1e6),length=number(input.length||0,'Chiều dài (cm)',0,300),width=number(input.width||0,'Chiều rộng (cm)',0,300),height=number(input.height||0,'Chiều cao (cm)',0,300),policy=collectionPolicy({bankTransfer:order.bankTransfer===true,freeShipping:order.freeShipping===true,total:order.total,paid:order.paid}),payment=number(order.bankTransfer===true||order.freeShipping===true?policy.payment:input.payment||3,'Loại thu hộ',1,4);
 const service=required(input.service,'Dịch vụ Viettel Post',50);if(!/^[A-Z0-9_, -]+$/.test(service))fail('Mã dịch vụ không hợp lệ.');
 const remaining=Math.max(0,order.total-order.paid),cod=number(order.bankTransfer===true?0:input.cod??remaining,'Tiền thu hộ',0,remaining),value=number(input.declaredValue??order.subtotal,'Giá trị hàng',0,1e9);
 if(cod>0&&[1,4].includes(payment))fail('Loại vận đơn không thu hộ tiền hàng: đặt COD bằng 0 hoặc chọn loại 2/3.');
 return {ORDER_NUMBER:order.code,SENDER_FULLNAME:from.name,SENDER_PHONE:from.phone,SENDER_ADDRESS:from.address,PICKUP_DATE:'',PICKUP_CODE:'',DELIVERY_CODE:'',ENABLE_SORT_CODE:false,RECEIVER_FULLNAME:receiverName,RECEIVER_PHONE:receiverPhone,RECEIVER_ADDRESS:receiverAddress,PRODUCT_NAME:items.map(i=>i.name).join(', ').slice(0,250),PRODUCT_QUANTITY:items.reduce((n,i)=>n+i.quantity,0),PRODUCT_PRICE:value,PRODUCT_WEIGHT:weight,PRODUCT_LENGTH:length,PRODUCT_WIDTH:width,PRODUCT_HEIGHT:height,ORDER_PAYMENT:payment,ORDER_SERVICE:service,ORDER_SERVICE_ADD:String(input.additionalServices||'').slice(0,100)||null,PRODUCT_TYPE:'HH',ORDER_NOTE:String(input.shippingNote||order.note||'').slice(0,500),MONEY_COLLECTION:cod,EXTRA_MONEY:0,CHECK_UNIQUE:true,PRODUCT_DETAIL:items.map(i=>({PRODUCT_NAME:i.name,PRODUCT_QUANTITY:i.quantity,PRODUCT_PRICE:i.price,PRODUCT_WEIGHT:get('products',i.productId)?.weight||0}))};
}
export async function dispatchShipment(user,id,input,request=vtpRequest){
 const o=get('orders',id);shippingAccess(user,o);if(!['draft','confirmed'].includes(o.status)||o.requiresShipping===false)fail('Đơn không thể tạo vận đơn.');
 const a=account(input.accountId),payload=shipmentPayload(o,get('customers',o.customerId),a,input);
 if(o.version!==Number(input.version))fail('Đơn đã thay đổi. Tải lại trước khi gửi.',409);
 if(inFlight.has(id))fail('Đang gửi đơn này.',409);
 if(all('shipments').some(s=>s.orderId===id&&s.status!=='cancelled'))fail('Đơn đã có vận đơn hoặc đang chờ xác minh. Kiểm tra trước khi gửi lại.',409);
 const prior=db.prepare('SELECT * FROM shipping_requests WHERE order_id=? AND state IN (\'sending\',\'unknown\',\'accepted\')').get(id);if(prior)fail('Đơn đã gửi hoặc chưa rõ kết quả. Không tự gửi lại.',409);
 const sameReference=db.prepare('SELECT order_id FROM shipping_requests WHERE account_id=? AND reference=?').get(a.id,o.code);if(sameReference&&sameReference.order_id!==id)fail('Mã tham chiếu bị trùng với đơn khác. Kiểm tra mã đơn trước khi gửi.',409);
 inFlight.add(id);let s,requestId;
 try{
  transaction(()=>{if(o.status==='draft'){put('orders',{...o,receiverName:payload.RECEIVER_FULLNAME,phone:payload.RECEIVER_PHONE,address:payload.RECEIVER_ADDRESS});orderAction(user,id,{action:'confirm'});}put('orders',{...get('orders',id),receiverName:payload.RECEIVER_FULLNAME,phone:payload.RECEIVER_PHONE,address:payload.RECEIVER_ADDRESS,shippingAccountId:a.id,shippingService:payload.ORDER_SERVICE,shippingState:'sending',parcel:{weight:payload.PRODUCT_WEIGHT,length:payload.PRODUCT_LENGTH,width:payload.PRODUCT_WIDTH,height:payload.PRODUCT_HEIGHT}});
   requestId=uid('shipping-request');const existing=db.prepare('SELECT id FROM shipping_requests WHERE account_id=? AND reference=?').get(a.id,o.code);if(existing)requestId=existing.id;
   db.prepare('INSERT OR REPLACE INTO shipping_requests(id,order_id,account_id,reference,state,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(requestId,id,a.id,o.code,'sending',JSON.stringify(payload),now(),now());
   s=put('shipments',{orderId:id,carrier:'viettelpost',accountId:a.id,environment:a.environment,reference:o.code,requestId,status:'creating',cod:payload.MONEY_COLLECTION,fee:0,settlement:'expected',parcel:get('orders',id).parcel,receiver:{name:payload.RECEIVER_FULLNAME,phone:payload.RECEIVER_PHONE,address:payload.RECEIVER_ADDRESS},sender:a.sender,service:payload.ORDER_SERVICE,payment:payload.ORDER_PAYMENT,history:[{status:'creating',at:now(),actor:user.id}]});});
  let result;try{result=await request(a.environment,'/v2/order/createOrderNlp',{token:secret(accountSecret(a.id)).token,body:payload});if(!result?.ORDER_NUMBER)throw Object.assign(Error('Hãng chưa trả mã vận đơn. Kiểm tra tại Viettel Post.'),{unknown:true});}catch(error){const state=error.unknown?'unknown':'failed';transaction(()=>{db.prepare('UPDATE shipping_requests SET state=?,error=?,updated_at=? WHERE id=?').run(state,error.message,now(),requestId);put('shipments',{...get('shipments',s.id),status:error.unknown?'unknown':'cancelled',error:error.message});put('orders',{...get('orders',id),shippingState:state});});throw Object.assign(error,{orderId:id});}
  return transaction(()=>{db.prepare('UPDATE shipping_requests SET state=?,response=?,error=NULL,updated_at=? WHERE id=?').run('accepted',JSON.stringify(result),now(),requestId);s=put('shipments',{...get('shipments',s.id),tracking:String(result.ORDER_NUMBER),fee:Number(result.MONEY_TOTAL||0),feeBreakdown:result,status:'pickup_pending',history:[...get('shipments',s.id).history,{status:'pickup_pending',at:now(),source:'viettelpost'}]});put('orders',{...get('orders',id),shippingState:'pickup_pending',shipmentId:s.id});audit(user.id,'viettelpost_order_created',s.id,{reference:o.code,tracking:s.tracking});replayEvents(a.id,s.tracking);return get('shipments',s.id);});
 }finally{inFlight.delete(id);}
}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);}
export function receiveVtpWebhook(id,headers,payload){
 const a=get('shipping_accounts',id),keys=secret(accountSecret(id));if(!a||!keys.webhookToken)fail('Webhook không tồn tại.',404);
 const auth=String(headers.authorization||'').replace(/^Bearer\s+/i,'');if(!safeEqual(auth,keys.webhookToken)&&!safeEqual(payload.TOKEN,keys.webhookToken))fail('Webhook không được xác thực.',401);
 const p=payload.DATA;if(!p||typeof p!=='object'||!p.ORDER_NUMBER)fail('Thiếu dữ liệu vận đơn.');const tracking=String(p.ORDER_NUMBER).slice(0,100),date=providerDate(p.ORDER_STATUSDATE);if(!date||!Number.isInteger(Number(p.ORDER_STATUS)))fail('Ngày hoặc trạng thái hãng không hợp lệ.');
 const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;
 const eventId=createHash('sha256').update(id+':'+JSON.stringify(sorted(p))).digest('hex');
 transaction(()=>{db.prepare('INSERT OR IGNORE INTO shipping_events VALUES(?,?,?,?,?,?,?,?,0)').run(eventId,id,tracking,String(p.ORDER_REFERENCE||'').slice(0,100),Number(p.ORDER_STATUS),date,now(),JSON.stringify(p));const unknown=all('shipments').find(s=>s.accountId===id&&s.reference===p.ORDER_REFERENCE&&s.status==='unknown');if(unknown&&!all('shipments').some(s=>s.accountId===id&&s.tracking===tracking)){put('shipments',{...unknown,tracking,status:'pickup_pending',error:null});db.prepare('UPDATE shipping_requests SET state=?,error=NULL,updated_at=? WHERE id=?').run('accepted',now(),unknown.requestId);audit('viettelpost','shipping_recovered_by_webhook',unknown.id,{tracking});}replayEvents(id,tracking);});
 return {status:200,error:false,message:'OK'};
}
function replayEvents(accountId,tracking){for(const event of db.prepare('SELECT * FROM shipping_events WHERE account_id=? AND tracking=? AND applied=0 ORDER BY occurred_at,received_at').all(accountId,tracking)){
 const s=all('shipments').find(s=>s.accountId===accountId&&s.tracking===tracking),o=all('carrier_orders').find(o=>o.accountId===accountId&&o.tracking===tracking);if(!s&&!o)continue;
 if(s)applyEvent(s,event);
 if(o){const p=JSON.parse(event.payload),h={eventId:event.id,at:event.occurred_at,name:p.STATUS_NAME||'',carrierStatus:event.status_code,location:p.LOCATION_CURRENTLY||p.LOCALION_CURRENTLY||'',note:p.NOTE||''};const history=[...(o.history||[]),h];
  const next=mappedStatus(event.status_code),terminal=o.status==='returned'||o.status==='cancelled'||o.status==='delivered'&&!['returning','returned','delivered'].includes(next);
  const newer=(!o.carrierUpdatedAt||event.occurred_at>=o.carrierUpdatedAt)&&!terminal;put('carrier_orders',{...o,history,...(newer?{status:next||o.status,carrierStatus:event.status_code,carrierStatusName:p.STATUS_NAME||'',carrierUpdatedAt:event.occurred_at,carrierData:{...o.carrierData,...p},location:h.location}: {})});}
 db.prepare('UPDATE shipping_events SET applied=1 WHERE id=?').run(event.id);
}}
function applyEvent(s,event){const p=JSON.parse(event.payload),at=event.occurred_at,status=mappedStatus(event.status_code),history=[...(s.history||[]),{eventId:event.id,at,receivedAt:event.received_at,status:status||s.status,carrierStatus:event.status_code,name:p.STATUS_NAME||'',location:p.LOCATION_CURRENTLY||p.LOCALION_CURRENTLY||'',note:p.NOTE||''}];
 if(s.carrierUpdatedAt&&at<s.carrierUpdatedAt){put('shipments',{...s,history});return;}
 if(status&&status!==s.status&&(s.status==='returned'||s.status==='cancelled'||(s.status==='delivered'&&!['returning','returned'].includes(status)))){put('shipments',{...s,history});return;}
 let next={...s,history,carrierUpdatedAt:at,carrierStatus:event.status_code,carrierStatusName:p.STATUS_NAME||'',location:p.LOCATION_CURRENTLY||p.LOCALION_CURRENTLY||'',courier:{name:p.EMPLOYEE_NAME||'',phone:p.EMPLOYEE_PHONE||''},expectedDelivery:p.EXPECTED_DELIVERY_DATE||p.EXPECTED_DELIVERY||'',proof:p.POD||null,carrierData:p};
 if(Number.isFinite(Number(p.MONEY_TOTAL))&&Number(p.MONEY_TOTAL)>=0)next.fee=Number(p.MONEY_TOTAL);
 if(status&&!(s.status==='returned'||s.status==='cancelled'||(s.status==='delivered'&&!['returning','returned'].includes(status))))next.status=status;put('shipments',next);const o=get('orders',s.orderId);if(!o)return;
 // Carrier delivery events never book a payment or restock returned goods.
 let orderStatus=o.status;
 if(['in_transit','delivered','returning','returned','delivery_failed'].includes(next.status)&&!s.inventoryDispatched&&o.status==='confirmed'){
  for(const i of o.items.filter(i=>!i.productType||i.productType==='physical')){const product=get('products',i.productId);if(product.stock< i.quantity||product.reserved<i.quantity)fail('Tồn kho không khớp khi hãng nhận hàng.',409);put('products',{...product,stock:product.stock-i.quantity,reserved:product.reserved-i.quantity});put('stock',{productId:product.id,orderId:o.id,shipmentId:s.id,delta:-i.quantity,reservedDelta:-i.quantity,type:'dispatch',actor:'viettelpost'});}next=put('shipments',{...next,inventoryDispatched:true});orderStatus='fulfilling';
 }
 if(next.status==='delivered')orderStatus='delivered';if(next.status==='returned')orderStatus='return_pending_check';
 if(next.status==='cancelled'&&!s.inventoryDispatched&&o.status==='confirmed'){for(const i of o.items.filter(i=>!i.productType||i.productType==='physical')){const product=get('products',i.productId);if(product.reserved<i.quantity)fail('Lượng hàng giữ không khớp.',409);put('products',{...product,reserved:product.reserved-i.quantity});put('stock',{productId:product.id,orderId:o.id,reservedDelta:-i.quantity,delta:0,type:'release',actor:'viettelpost'});}orderStatus='cancelled';}
 put('orders',{...get('orders',o.id),status:orderStatus,shippingState:next.status});
 audit('viettelpost','shipping_event',s.id,{eventId:event.id,carrierStatus:event.status_code});
}
export async function shippingRoute(path,method,input,user,request=vtpRequest){
 const defaultAccount=path.match(/^\/api\/shipping\/accounts\/([^/]+)\/default$/);if(defaultAccount&&method==='POST'){admin(user);const a=account(defaultAccount[1]);if(a.version!==Number(input.version))fail('Kết nối đã thay đổi.',409);return transaction(()=>{for(const other of all('shipping_accounts'))put('shipping_accounts',{...other,isDefault:other.id===a.id});return get('shipping_accounts',a.id);});}

 const historySync=path.match(/^\/api\/shipping\/accounts\/([^/]+)\/sync-history$/);if(historySync&&method==='POST')return syncVtpHistory(user,historySync[1],input,request);
 const diagnostics=path.match(/^\/api\/shipping\/accounts\/([^/]+)\/diagnostics$/);if(diagnostics&&method==='GET'){
  admin(user);const a=get('shipping_accounts',diagnostics[1]);if(!a)fail('Không tìm thấy kết nối.',404);
  const events=db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN applied=0 THEN 1 ELSE 0 END) AS unmatched, MAX(received_at) AS lastReceivedAt FROM shipping_events WHERE account_id=?').get(a.id);
  const requests=db.prepare('SELECT state, COUNT(*) AS total FROM shipping_requests WHERE account_id=? GROUP BY state').all(a.id);
  return {connected:a.active&&a.status==='connected',senderReady:!!(a.sender?.name&&a.sender?.phone&&a.sender?.address),inventoryCount:a.inventories?.length||0,inventorySyncedAt:a.syncedAt||a.connectedAt,requests:Object.fromEntries(requests.map(r=>[r.state,r.total])),events:{total:events.total,unmatched:events.unmatched||0,lastReceivedAt:events.lastReceivedAt||null},historicalImportAvailable:true};
 }
 const label=path.match(/^\/api\/shipping\/shipments\/([^/]+)\/label$/);if(label&&method==='POST'){const s=get('shipments',label[1]);if(!s)fail('Không tìm thấy vận đơn.',404);shippingAccess(user,get('orders',s.orderId));if(s.carrier!=='viettelpost'||!s.tracking)fail('Vận đơn chưa có mã hãng.');const a=account(s.accountId),r=await request(a.environment,'/v2/order/printing-code',{token:secret(accountSecret(a.id)).token,body:{EXPIRY_TIME:Date.now()+3600000,ORDER_ARRAY:[s.tracking]},fullResponse:true});const code=r?.message;if(typeof code!=='string'||!/^[A-Za-z0-9+/=_-]{10,500}$/.test(code))fail('Hãng chưa trả mã in hợp lệ.');const url=new URL('/DigitalizePrint/report.do',a.environment==='sandbox'?'https://dev-release-print.viettelpost.vn':'https://digitalize.viettelpost.vn');url.searchParams.set('type','a6_1');url.searchParams.set('bill','$'+code);url.searchParams.set('showPostage','1');return {url:url.href};}
 const reconcile=path.match(/^\/api\/shipping\/shipments\/([^/]+)\/reconcile$/);if(reconcile&&method==='POST'){const s=get('shipments',reconcile[1]);if(!s)fail('Không tìm thấy vận đơn.',404);shippingAccess(user,get('orders',s.orderId));if(s.carrier!=='viettelpost'||s.status!=='unknown')fail('Chỉ xác minh vận đơn chưa rõ kết quả.');const tracking=required(input.tracking,'Mã vận đơn đã kiểm tra',100);if(all('shipments').some(other=>other.id!==s.id&&other.accountId===s.accountId&&other.tracking===tracking))fail('Vận đơn đã gắn với đơn khác.',409);return transaction(()=>{const updated=put('shipments',{...s,tracking,status:'pickup_pending',fee:number(input.fee||0,'Cước hãng'),error:null,history:[...s.history,{status:'pickup_pending',at:now(),actor:user.id,note:'Nhân viên xác minh tại hãng'}]});db.prepare('UPDATE shipping_requests SET state=?,error=NULL,updated_at=? WHERE id=?').run('accepted',now(),s.requestId);put('orders',{...get('orders',s.orderId),shippingState:'pickup_pending',shipmentId:s.id});replayEvents(s.accountId,tracking);audit(user.id,'shipping_reconciled',s.id,{tracking});return get('shipments',updated.id);});}
 const cancel=path.match(/^\/api\/shipping\/shipments\/([^/]+)\/cancel$/);if(cancel&&method==='POST'){const s=get('shipments',cancel[1]);if(!s)fail('Không tìm thấy vận đơn.',404);shippingAccess(user,get('orders',s.orderId));if(s.carrier!=='viettelpost'||s.status!=='pickup_pending'||!s.tracking)fail('Chỉ yêu cầu hủy khi hãng chưa lấy hàng.');if(s.cancelRequestedAt)fail('Đã yêu cầu hủy. Chờ hãng cập nhật.',409);const a=account(s.accountId);await request(a.environment,'/v2/order/UpdateOrder',{token:secret(accountSecret(a.id)).token,body:{TYPE:4,ORDER_NUMBER:s.tracking,NOTE:required(input.note,'Lý do hủy',300)}});audit(user.id,'shipping_cancel_requested',s.id);return put('shipments',{...get('shipments',s.id),cancelRequestedAt:now()});}
 if(path==='/api/shipping/quote'&&method==='POST'&&input.accountId){permission(user,'orders');const a=account(input.accountId),from=sender(a.sender||{});const result=await request(a.environment,'/v2/order/getPriceAllNlp',{fullResponse:input.includeAddress===true,token:secret(accountSecret(a.id)).token,body:{SENDER_ADDRESS:from.address,RECEIVER_ADDRESS:required(input.receiverAddress,'Địa chỉ đầy đủ người nhận',500),PRODUCT_TYPE:'HH',PRODUCT_WEIGHT:number(input.weight,'Khối lượng (gram)',1,1e6),PRODUCT_PRICE:number(input.declaredValue||0,'Giá trị hàng'),MONEY_COLLECTION:number(input.cod||0,'Thu hộ'),PRODUCT_LENGTH:number(input.length||0,'Chiều dài'),PRODUCT_WIDTH:number(input.width||0,'Chiều rộng'),PRODUCT_HEIGHT:number(input.height||0,'Chiều cao'),TYPE:1}});return input.includeAddress===true?{services:result.RESULT||result,receiverAddress:result.RECEIVER_ADDRESS||result.data?.RECEIVER_ADDRESS||null}:result;}
 if(path==='/api/shipping/accounts'&&method==='GET'){permission(user,'read');return shippingState(user);}
 if(path==='/api/shipping/accounts'&&method==='POST'){
  admin(user);const previous=input.id?get('shipping_accounts',input.id):null;if(input.id&&!previous)fail('Không tìm thấy kết nối.',404);if(previous&&previous.version!==input.version)fail('Kết nối đã thay đổi. Tải lại trước khi lưu.',409);const id=previous?.id||uid('carrier'),environment=input.environment||previous?.environment||'production';if(!['production','sandbox'].includes(environment))fail('Môi trường không hợp lệ.');
  let token=String(input.token||'').trim()||secret(accountSecret(id)).token;
  const mode=input.authMode||'auto';if(!['auto','website-token','shop-token','partner-token','partner-login'].includes(mode))fail('Cách kết nối không hợp lệ.');
  const websiteToken=mode==='website-token';
  const stageRequest=async(stage,path,options)=>{try{return await request(environment,path,options);}catch(error){let safe=String(error.message||'Hãng từ chối yêu cầu.');for(const value of [input.token,input.password,input.ownerPassword])if(value)safe=safe.split(String(value)).join('[ẩn]');error.message=stage+': '+safe;throw error;}};
  if(previous&&previous.environment!==environment&&!input.token&&!input.username)fail('Đổi môi trường cần token hoặc tài khoản tương ứng.');
  if(websiteToken){if(!String(input.token||'').trim())fail('Nhập token đã sao chép từ website Viettel Post.');const auth=await stageRequest('Đổi token website (LoginVTP)','/v2/user/LoginVTP',{body:{token:String(input.token).trim()}});token=auth?.token;if(!token)fail('Viettel Post chưa trả token từ LoginVTP.');}
  const credentials=!websiteToken&&mode!=='shop-token';
  if(credentials&&(Boolean(input.username)!==Boolean(input.password)||Boolean(input.ownerUsername)!==Boolean(input.ownerPassword)))fail('Nhập đủ tài khoản và mật khẩu.');
  if(mode==='partner-login'&&!input.username)fail('Nhập tài khoản và mật khẩu Partner.');
  if(mode==='partner-token'&&!input.ownerUsername)fail('Nhập tài khoản và mật khẩu shop để đổi token Partner.');
  if(credentials&&input.username){const auth=await stageRequest('Đăng nhập Partner','/v2/user/Login',{body:{USERNAME:input.username,PASSWORD:input.password}});token=auth?.token;if(!token)fail('Viettel Post chưa trả token Partner.');}
  // Shop credentials also exchange a supplied Partner token, without requiring Partner login.
  if(credentials&&(input.ownerUsername||input.username)){if(!token)fail('Nhập token Partner hoặc tài khoản Partner trước khi kết nối shop.');const connected=await stageRequest('Kết nối tài khoản shop (ownerconnect)','/v2/user/ownerconnect',{token,body:{USERNAME:input.ownerUsername||input.username,PASSWORD:input.ownerPassword||input.password}});token=connected?.token;if(!token)fail('Viettel Post chưa trả token shop.');}
  if(!token)fail('Nhập token hoặc tài khoản API Viettel Post.');
  const inventories=await stageRequest('Đọc kho Viettel Post (listInventory)','/v2/user/listInventory',{token,method:'GET'});if(!Array.isArray(inventories))fail('Không đọc được kho gửi Viettel Post.');
  const a=put('shipping_accounts',{id,provider:'viettelpost',name:required(input.name,'Tên kết nối',100),environment,active:true,status:'connected',inventories,sender:input.sender?sender(input.sender):previous?.sender||null,connectedAt:now()},previous?input.version:undefined);
  saveSecret(accountSecret(id),{token,webhookToken:input.webhookToken||secret(accountSecret(id)).webhookToken||randomBytes(32).toString('hex')});audit(user.id,'carrier_connected',id);return a;
 }
 const config=path.match(/^\/api\/shipping\/accounts\/([^/]+)(?:\/(credentials|inventory|disable))?$/);
 if(config){admin(user);const a=get('shipping_accounts',config[1]);if(!a)fail('Không tìm thấy kết nối.',404);
  if(config[2]==='credentials'&&method==='GET'){return {webhookToken:secret(accountSecret(a.id)).webhookToken,webhookPath:'/api/shipping/webhooks/viettelpost/'+a.id};}
  if(config[2]==='disable'&&method==='POST'){audit(user.id,'carrier_disabled',a.id);return put('shipping_accounts',{...a,active:false,status:'disconnected'},input.version);}
  if(config[2]==='inventory'&&method==='POST'){const inventories=await request(a.environment,'/v2/user/listInventory',{token:secret(accountSecret(a.id)).token,method:'GET'});return put('shipping_accounts',{...a,inventories,syncedAt:now()},input.version);}
  if(!config[2]&&method==='PATCH'){const preferred=input.defaultService===undefined?a.defaultService||'':String(input.defaultService).trim().toUpperCase();if(preferred&&!/^[A-Z0-9_-]{1,50}$/.test(preferred))fail('Mã dịch vụ mặc định không hợp lệ.');return put('shipping_accounts',{...a,sender:sender(input.sender),defaultService:preferred},input.version);}
 }
 const dispatch=path.match(/^\/api\/shipping\/orders\/([^/]+)\/(dispatch|quote)$/);
 if(dispatch&&method==='POST'){const o=get('orders',dispatch[1]);shippingAccess(user,o);if(dispatch[2]==='dispatch')return dispatchShipment(user,o.id,input,request);const a=account(input.accountId),p=shipmentPayload(o,get('customers',o.customerId),a,{...input,service:input.service||'VCN'});return request(a.environment,'/v2/order/getPriceAllNlp',{token:secret(accountSecret(a.id)).token,body:{SENDER_ADDRESS:p.SENDER_ADDRESS,RECEIVER_ADDRESS:p.RECEIVER_ADDRESS,PRODUCT_TYPE:p.PRODUCT_TYPE,PRODUCT_WEIGHT:p.PRODUCT_WEIGHT,PRODUCT_PRICE:p.PRODUCT_PRICE,MONEY_COLLECTION:p.MONEY_COLLECTION,PRODUCT_LENGTH:p.PRODUCT_LENGTH,PRODUCT_WIDTH:p.PRODUCT_WIDTH,PRODUCT_HEIGHT:p.PRODUCT_HEIGHT,TYPE:1}});}
 const history=path.match(/^\/api\/shipping\/shipments\/([^/]+)\/history$/);if(history&&method==='GET'){const s=get('shipments',history[1]);if(!s)fail('Không tìm thấy vận đơn.',404);shippingAccess(user,get('orders',s.orderId));return s;}
}
