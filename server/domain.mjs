import {finishMentionTasks} from './staff-tasks.mjs';
import {join,basename} from 'node:path';
import {dataDir} from './store.mjs';
import { all,get,put,remove,transaction,audit,notification,now,uid,secret,saveSecret,db } from './store.mjs';
import {syncPlanHandoff} from './plan-bridge.mjs';
import {captureLead,syncPaymentOrder,enrollmentFromOrder,assertChannel} from './taophacdo.mjs';
import { providers,publish,continuePublish,sendMessage,ghn,validMediaURL } from './connectors.mjs';
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function required(v,label,max=10000){if(typeof v!=='string'||!v.trim()||v.length>max)fail(`${label} không hợp lệ.`);return v.trim();}
export function number(v,label,min=0,max=1e12){const n=Number(v);if(!Number.isFinite(n)||n<min||n>max||!Number.isInteger(n))fail(`${label} không hợp lệ.`);return n;}
export const kinds=['connections','contents','publications','assets','campaigns','customers','products','orders','shipments','conversations','messages','templates','knowledge','workflows','notifications','tasks','payments','returns','stock','settings'];
export function permission(user,action){const sets={owner:['*'],manager:['*'],editor:['read','content','assets','campaigns'],support:['read','assets','inbox','customers','orders','tasks'],warehouse:['read','shipping','products'],viewer:['read']};if(!(sets[user.role]||[]).some(x=>x==='*'||x===action))fail('Bạn không có quyền thực hiện thao tác này.',403);}
const area={connections:'admin',contents:'content',campaigns:'campaigns',customers:'customers',products:'products',templates:'inbox',knowledge:'admin',workflows:'admin',tasks:'tasks',notifications:'read',settings:'admin'};
export function editRecord(user,kind,id,input){
 if(!area[kind])fail('Dữ liệu này phải cập nhật qua quy trình nghiệp vụ.');permission(user,area[kind]);if(area[kind]==='admin'&&user.role!=='owner')fail('Chỉ chủ hệ thống được cấu hình mục này.',403);
 const prev=id?get(kind,id):null;if(id&&!prev)fail('Không tìm thấy dữ liệu.',404);
 const data={...prev,...input};delete data.version;delete data.token;delete data.appSecret;delete data.verifyToken;delete data.id;
 if(kind==='products'){
  data.id_sp=prev?.id_sp||data.sku;
  required(data.name,'Tên sản phẩm',200);required(data.sku,'SKU',100);data.price=number(data.price,'Giá bán');data.cost=number(data.cost||0,'Giá vốn');data.productType=data.productType||prev?.productType||'physical';if(!['physical','service','course'].includes(data.productType))fail('Loại sản phẩm không hợp lệ.');if(prev&&prev.productType!==data.productType&&all('orders').some(o=>o.items.some(i=>i.productId===prev.id)))fail('Không đổi loại sản phẩm đã có đơn.');data.stock=number(data.stock||0,'Tồn kho');data.weight=number(data.weight||500,'Khối lượng',1,100000);
  data.reserved=prev?.reserved||0;if(data.stock<data.reserved)fail('Tồn kho không thể nhỏ hơn lượng đang giữ cho đơn.');
  if(all('products').some(p=>p.sku.toLowerCase()===data.sku.toLowerCase()&&p.id!==id))fail('SKU đã tồn tại.');
 }
 if(kind==='customers'){data.createdBy=prev?.createdBy||user.id;data.customer_id=prev?.customer_id||'LOCAL-'+uid('customer');if(prev?.origin==='taophacdo')for(const k of ['customer_id','is_customized','video_date','ma_vd','start_date','end_date','san_pham','gia_tien','status'])data[k]=prev[k];required(data.name,'Tên khách',200);data.tags=Array.isArray(data.tags)?data.tags.slice(0,20):[];data.consent=data.consent===true;}
 if(kind==='contents'){
  required(data.title,'Tên nội dung',250);data.caption=String(data.caption||'').slice(0,30000);if(!['text','image','video'].includes(data.type))fail('Loại nội dung không hợp lệ.');
  data.channels=(data.channels||[]).filter(x=>get('connections',x));data.assets=(data.assets||[]).map(id=>{const a=get('assets',id);if(!a||a.active===false||!(a.scopes||['post']).includes('post'))fail('Media không còn dùng cho đăng bài.');if(a.connectionId)assertChannel(user,a.connectionId);return id;});data.status='draft';data.approval='pending';
  // Editing an already scheduled content does not silently mutate the frozen publication.
 }
 if(kind==='connections'){
  if(!providers[data.provider])fail('Nền tảng không hợp lệ.');required(data.name,'Tên kênh',200);if(!['demo','assisted','api'].includes(data.mode))fail('Chế độ không hợp lệ.');
  if(data.mode==='api'&&!providers[data.provider].publish&&!providers[data.provider].message)fail('Kênh này hiện chỉ hỗ trợ đăng thủ công.');
  data.status=data.mode==='demo'?'demo':data.mode==='assisted'?'assisted':'configured';data.verifiedAt=null;
 }
 if(['campaigns','templates','workflows','tasks'].includes(kind))required(data.name||data.title,'Tên',250);
 if(kind==='templates'){data.usageInstructions=String(data.usageInstructions||'').slice(0,5000);data.enabled=data.enabled!==false;required(data.text,'Nội dung mẫu');if(!Array.isArray(data.assetIds||[])||(data.assetIds||[]).length>10)fail('Tối đa 10 media cho mẫu.');for(const id of data.assetIds||[]){const a=get('assets',id);if(!a||a.active===false||!(a.scopes||['template']).includes('template'))fail('Media không còn dùng cho mẫu trả lời.');if(a.connectionId)assertChannel(user,a.connectionId);}}
 if(kind==='knowledge'){required(data.title,'Tiêu đề',250);required(data.body,'Nội dung',30000);}
 if(kind==='workflows'){
  if(!['message_received','shipping_failed','order_confirmed'].includes(data.trigger))fail('Sự kiện không hợp lệ.');
  if(!['tag','notify','task'].includes(data.action))fail('Hành động không hợp lệ.');data.enabled=data.enabled===true;data.runs=prev?.runs||0;
 }
 const result=transaction(()=>{const r=put(kind,{...data,...(id?{id}:{} )},prev?input.version:undefined);if(kind==='products'&&(!prev||prev.stock!==r.stock))put('stock',{productId:r.id,delta:r.stock-(prev?.stock||0),type:'adjustment',reason:input.reason||'Điều chỉnh tồn kho',actor:user.id});audit(user.id,prev?'update':'create',r.id,{kind});return r;});
 if(kind==='connections'&&(input.token||input.appSecret)){saveSecret(result.id,{...secret(result.id),...(input.token?{token:input.token}:{}),...(input.appSecret?{appSecret:input.appSecret}:{}),...(input.verifyToken?{verifyToken:input.verifyToken}:{})});}
 return result;
}
export function deleteRecord(user,kind,id){permission(user,area[kind]||'admin');if(area[kind]==='admin'&&user.role!=='owner')fail('Chỉ chủ hệ thống được thực hiện.',403);const r=get(kind,id);if(!r)fail('Không tìm thấy.',404);
 if(kind==='connections'){put(kind,{...r,status:'disconnected'});db.prepare('DELETE FROM secrets WHERE id=?').run(id);for(const p of all('publications').filter(x=>x.connectionId===id&&['scheduled','awaiting_manual','blocked','failed'].includes(x.status)))put('publications',{...p,status:'cancelled'});}
 else if(kind==='products'){put(kind,{...r,active:false});}
 else if(['contents','campaigns','templates','knowledge','workflows','tasks'].includes(kind)){
  if(kind==='contents'&&all('publications').some(x=>x.contentId===id&&!['cancelled','draft'].includes(x.status)))fail('Nội dung có lịch sử xuất bản. Hãy giữ lại để truy vết.');remove(kind,id);
 }else fail('Mục này không hỗ trợ xóa trực tiếp.');audit(user.id,'delete',id,kind);return {ok:true};}
export function schedule(user,id,input){permission(user,'content');const c=get('contents',id);if(!c)fail('Không tìm thấy nội dung.',404);if(input.version!==c.version)fail('Nội dung đã thay đổi. Mở lại trước khi lên lịch.',409);
 const channels=c.channels||[];if(!channels.length)fail('Chọn ít nhất một kênh.');if(!c.caption.trim())fail('Nhập nội dung bài đăng.');
 const scheduleAt=input.immediate?now():input.scheduleAt;if(!Number.isFinite(Date.parse(scheduleAt)))fail('Chọn lịch đăng hợp lệ.');if(!input.immediate&&Date.parse(scheduleAt)<Date.now()+10*60000)fail('Lịch đăng cần cách hiện tại tối thiểu 10 phút.');
 if(all('publications').some(p=>p.contentId===id&&['scheduled','dispatching','processing','awaiting_manual','unknown'].includes(p.status)))fail('Nội dung đã có lịch đang chạy. Hủy các đích chưa gửi trước khi tạo lịch mới.');
 const frozen=channels.map(cid=>{const ch=get('connections',cid);if(!ch||ch.status==='disconnected')fail('Kênh đã ngắt kết nối.');const v=c.variants?.[cid]||{};const type=v.type||c.type;const mediaUrl=v.mediaUrl||c.mediaUrl||'';let mode=ch.mode;
  if(mode==='api'){
   if(!providers[ch.provider].publish)fail(`${ch.name}: chỉ hỗ trợ nhắn tin, hãy chọn chế độ hỗ trợ đăng.`);
   if(ch.status!=='connected')fail(`${ch.name}: cần kiểm tra kết nối trước.`);
   if(!providers[ch.provider].formats.includes(type))fail(`${ch.name}: API hiện chưa hỗ trợ định dạng ${type}; chuyển sang hỗ trợ đăng.`);
   if(type!=='text')validMediaURL(mediaUrl);
   if(ch.provider==='x'&&(v.caption||c.caption).length>280)fail('Bản X đang giới hạn văn bản ở 280 ký tự.');
  }
  return {contentId:id,connectionId:cid,title:v.title||c.title,caption:v.caption||c.caption,type,assets:c.assets||[],mediaUrl,status:'scheduled',mode,scheduleAt,revision:c.version,attempts:0};
 });return transaction(()=>{const jobs=frozen.map(p=>put('publications',p));put('contents',{...c,status:'scheduled',scheduleAt,approval:'approved'});audit(user.id,'schedule',id,{targets:jobs.length});return jobs;});
}
export function publicationAction(user,id,input){permission(user,'content');const p=get('publications',id);if(!p)fail('Không tìm thấy lịch.',404);
 if(input.action==='cancel'){if(!['scheduled','awaiting_manual','failed','blocked'].includes(p.status))fail('Không thể hủy tác vụ đã gửi hoặc chưa rõ kết quả.');return put('publications',{...p,status:'cancelled'});}
 if(input.action==='confirm'){if(p.status!=='awaiting_manual')fail('Đích này không chờ xác nhận thủ công.');let u;try{u=new URL(input.url);}catch{fail('Nhập URL bài đã đăng.');}if(!['https:','http:'].includes(u.protocol))fail('URL không hợp lệ.');return put('publications',{...p,status:'manually_confirmed',url:u.href,publishedAt:now()});}
 if(input.action==='retry'){if(!['failed','blocked'].includes(p.status))fail('Chỉ thử lại tác vụ đã thất bại rõ ràng. Tác vụ chưa rõ kết quả cần đối soát.');return put('publications',{...p,status:'scheduled',scheduleAt:now(),error:''});}
 if(input.action==='resolve'){if(!['unknown','processing'].includes(p.status))fail('Tác vụ không cần đối soát.');let u;try{u=new URL(input.url);}catch{fail('Cần URL đã kiểm tra thực tế.');}if(u.protocol!=='https:')fail('Cần URL HTTPS.');audit(user.id,'publication_reconciled',id);return put('publications',{...p,status:'manually_confirmed',url:u.href,publishedAt:now()});}
 fail('Hành động không hợp lệ.');
}
export function createOrder(user,input,{allowCustomPrice=false,allowDraftAddress=false}={}){permission(user,'orders');const customer=get('customers',input.customerId);if(!customer)fail('Chọn khách hàng.');if(!Array.isArray(input.items)||!input.items.length)fail('Thêm ít nhất một sản phẩm.');if(input.conversationId){const conv=get('conversations',input.conversationId);if(!conv||conv.customerId!==customer.id)fail('Hội thoại không khớp khách hàng.');}
 const seen=new Set();const items=input.items.map(i=>{const p=get('products',i.productId);if(!p||p.active===false)fail('Sản phẩm không còn bán.');if(seen.has(p.id))fail('SKU bị lặp. Hãy gộp số lượng.');seen.add(p.id);return {productId:p.id,name:p.name,sku:p.sku,price:!allowCustomPrice||i.price===undefined?p.price:number(i.price,'Đơn giá',0,1e12),productType:p.productType||'physical',courseId:p.courseId||null,quantity:number(i.quantity,'Số lượng',1,10000)};});
 if(allowCustomPrice&&!['owner','manager'].includes(user.role)&&items.some(i=>i.price<get('products',i.productId).price*.8))fail('Giảm đơn giá trên 20% cần quản lý.',403);
 const subtotal=items.reduce((s,i)=>s+i.price*i.quantity,0);const discount=number(input.discount||0,'Giảm giá',0,subtotal);if(discount>subtotal*.2&&!['owner','manager'].includes(user.role))fail('Giảm trên 20% cần quản lý.',403);
 const physical=items.some(i=>i.productType==='physical');const shippingFee=physical?number(input.shippingFee||0,'Phí vận chuyển'):0;return transaction(()=>{const order=put('orders',{code:'MOC-'+Date.now().toString(36).toUpperCase(),customerId:customer.id,items,subtotal,discount,shippingFee,total:subtotal-discount+shippingFee,paid:0,status:'draft',paymentStatus:'unpaid',freeShipping:input.freeShipping===true,bankTransfer:input.bankTransfer===true,transferAmount:input.bankTransfer===true?number(input.transferAmount??subtotal-discount+shippingFee,'Tiền chuyển khoản',0,1e12):0,email:String(input.email||customer.email||'').slice(0,200),requiresShipping:physical,address:physical?(allowDraftAddress?String(input.address||customer.address||'').trim().slice(0,500):required(input.address||customer.address,'Địa chỉ',500)):'',phone:required(input.phone||customer.phone,'Số điện thoại',30),note:String(input.note||'').slice(0,2000),source:input.source||'Trực tiếp',conversationId:input.conversationId||null,connectionId:input.conversationId?get('conversations',input.conversationId)?.connectionId:null,contentId:input.conversationId?get('conversations',input.conversationId)?.contentId:null,sourcePostId:input.conversationId?get('conversations',input.conversationId)?.postId:null});syncPaymentOrder(order);if(order.conversationId){const conv=get('conversations',order.conversationId);if(!conv||conv.customerId!==customer.id)fail('Hội thoại không khớp khách hàng.');put('messages',{conversationId:conv.id,direction:'note',text:'Đã tạo đơn '+order.code+' · '+order.total.toLocaleString('vi-VN')+' ₫ (nháp)',status:'internal',orderId:order.id,actor:user.id});}audit(user.id,'order_created',order.id);return order;});
}
export function orderAction(user,id,input){permission(user,'orders');return transaction(()=>{
 const o=get('orders',id);if(!o)fail('Không tìm thấy đơn.',404);
 if(input.action==='confirm'){
  if(o.status!=='draft')fail('Chỉ xác nhận đơn nháp.');if(o.requiresShipping){const customer=get('customers',o.customerId);o.address=required(o.address||customer?.address,'Địa chỉ giao hàng (bổ sung trong hồ sơ khách hàng)',500);}for(const item of o.items.filter(i=>!i.productType||i.productType==='physical')){const p=get('products',item.productId);if(!p||p.stock-p.reserved<item.quantity)fail(`Không đủ tồn: ${item.name}.`,409);put('products',{...p,reserved:p.reserved+item.quantity});put('stock',{productId:p.id,orderId:id,delta:0,reservedDelta:item.quantity,type:'reserve',actor:user.id});}o.status='confirmed';
 }else if(input.action==='cancel'){
  if(!['draft','confirmed'].includes(o.status))fail('Đơn đã bàn giao phải xử lý hoàn hàng.');if(all('shipments').some(s=>s.orderId===id&&s.status!=='cancelled'))fail('Cần hủy vận đơn trước khi hủy đơn.');
  if(o.paid>0)fail('Đơn đã có tiền. Ghi nhận hoàn tiền trước khi hủy.');
  if(o.status==='confirmed')for(const i of o.items.filter(i=>!i.productType||i.productType==='physical')){const p=get('products',i.productId);put('products',{...p,reserved:p.reserved-i.quantity});put('stock',{productId:p.id,orderId:id,reservedDelta:-i.quantity,delta:0,type:'release',actor:user.id});}o.status='cancelled';
 }else if(input.action==='pay'){
  if(!['owner','manager'].includes(user.role))fail('Chỉ quản lý được xác nhận đã nhận tiền.',403);if(o.status==='cancelled')fail('Đơn đã hủy.');const amount=number(input.amount,'Số tiền',1,o.total-o.paid);o.paid+=amount;put('payments',{orderId:id,amount,type:'payment',method:input.method||'bank',reference:required(input.reference,'Tham chiếu / ghi chú',300),actor:user.id});
 }else if(input.action==='refund'){
  if(!['owner','manager'].includes(user.role))fail('Cần quyền quản lý.',403);const amount=number(input.amount,'Tiền hoàn',1,o.paid);o.paid-=amount;put('payments',{orderId:id,amount:-amount,type:'refund',reference:required(input.reference,'Lý do hoàn tiền',500),actor:user.id});
 }else if(input.action==='return'){
  if(!['delivered','partially_returned'].includes(o.status))fail('Chỉ nhập hàng hoàn từ đơn đã giao.');
  const returns=all('returns').filter(r=>r.orderId===id);if(!input.items?.length)fail('Chọn hàng đã nhận và kiểm tra.');
  const returnSeen=new Set();for(const i of input.items){if(returnSeen.has(i.productId))fail('Không lặp sản phẩm trong phiếu hoàn.');returnSeen.add(i.productId);const original=o.items.find(x=>x.productId===i.productId);if(!original)fail('SKU không có trên đơn.');const returned=returns.flatMap(r=>r.items).filter(x=>x.productId===i.productId).reduce((s,x)=>s+x.quantity,0);const q=number(i.quantity,'Số lượng hoàn',1,original.quantity-returned);const p=get('products',i.productId);if(i.restock&&(!original.productType||original.productType==='physical')){put('products',{...p,stock:p.stock+q});put('stock',{productId:p.id,orderId:id,delta:q,type:'return',actor:user.id});}}
  put('returns',{orderId:id,items:input.items,reason:required(input.reason,'Lý do hoàn',500),actor:user.id});o.status='partially_returned';
 }else fail('Hành động đơn không hợp lệ.');o.paymentStatus=o.paid>=o.total?'paid':o.paid>0?'partial':'unpaid';if(!o.requiresShipping&&o.requiresShipping!==undefined&&o.status==='confirmed'&&o.paymentStatus==='paid')o.status='delivered';const updated=put('orders',o);syncPlanHandoff(updated);syncPaymentOrder(updated);enrollmentFromOrder(updated);audit(user.id,`order_${input.action}`,id);return updated;
});}
export async function createShipment(user,id,input){permission(user,'shipping');const o=get('orders',id);if(!o||o.status!=='confirmed')fail('Cần đơn đã xác nhận.');if(all('shipments').some(x=>x.orderId===id&&x.status!=='cancelled'))fail('Đơn đã có vận đơn; kiểm tra trước khi tạo lại.');
 if(o.requiresShipping===false)fail('Đơn dịch vụ/khóa học không cần vận chuyển.');const carrier=input.carrier||'manual';if(!['manual','demo','ghn','viettelpost_manual'].includes(carrier))fail('Hãng chưa hỗ trợ.');
 let shipment=put('shipments',{orderId:id,carrier,status:'creating',tracking:input.tracking||'',cod:Math.max(0,o.total-o.paid),fee:number(input.fee||0,'Phí hãng'),settlement:'expected',history:[{status:'creating',at:now()}]});
 try{
 if(carrier==='ghn'){
  const toDistrict=number(input.toDistrict,'Mã quận/huyện GHN',1);const toWard=required(input.toWard,'Mã phường/xã GHN',100);const serviceType=number(input.serviceType||2,'Loại dịch vụ',1,5);
  const r=await ghn('v2/shipping-order/create',{payment_type_id:1,note:o.note,required_note:'KHONGCHOXEMHANG',client_order_code:shipment.id,to_name:get('customers',o.customerId).name,to_phone:o.phone,to_address:o.address,to_district_id:toDistrict,to_ward_code:toWard,cod_amount:shipment.cod,weight:o.items.reduce((s,i)=>s+(get('products',i.productId).weight||500)*i.quantity,0),length:20,width:15,height:10,service_type_id:serviceType,insurance_value:o.subtotal,items:o.items.map(i=>({name:i.name,code:i.sku,quantity:i.quantity,price:i.price,weight:get('products',i.productId).weight||500}))});
  shipment.tracking=r.data.order_code;shipment.fee=r.data.total_fee||shipment.fee;
 }else if(carrier==='demo')shipment.tracking='DEMO-'+Date.now().toString(36).toUpperCase();else required(shipment.tracking,'Mã vận đơn thực tế',100);
 shipment.status='pickup_pending';shipment.history.push({status:'pickup_pending',at:now()});shipment=put('shipments',shipment);audit(user.id,'shipment_created',shipment.id);return shipment;
 }catch(e){put('shipments',{...shipment,status:carrier==='ghn'?'unknown':'cancelled',error:e.message});throw e;}
}
export function shipmentAction(user,id,input){permission(user,'shipping');return transaction(()=>{const s=get('shipments',id);if(!s)fail('Không tìm thấy kiện.',404);const o=get('orders',s.orderId);const allowed={pickup_pending:['in_transit','cancelled'],in_transit:['delivered','delivery_failed','returning'],delivery_failed:['in_transit','returning'],returning:['returned'],unknown:['pickup_pending','cancelled']};
 if(input.action==='settle'){
  if(!['owner','manager'].includes(user.role))fail('Cần quyền quản lý để đối soát.',403);if(s.status!=='delivered'||s.settlement==='settled')fail('Kiện chưa giao hoặc đã đối soát.');const amount=number(input.amount,'Tiền thực nhận');const expected=Math.max(0,s.cod-s.fee);s.settlement=amount===expected?'settled':'discrepancy';s.settledAmount=amount;s.settledAt=now();
  // The gross collected amount is recognized once; carrier fees are tracked separately.
  if(!s.paymentRecorded&&s.settlement==='settled'){const collect=Math.min(s.cod,o.total-o.paid);if(collect>0){o.paid+=collect;put('payments',{orderId:o.id,shipmentId:id,amount:collect,type:'cod',netAmount:amount,fee:s.fee,reference:input.reference||s.tracking,actor:user.id});put('orders',{...o,paymentStatus:o.paid>=o.total?'paid':'partial'});}s.paymentRecorded=true;}
 }else{
  const next=input.status;if(!allowed[s.status]?.includes(next))fail('Chuyển trạng thái kiện không hợp lệ.');
  if(s.carrier==='ghn'&&!input.verified)fail('Xác nhận bạn đã kiểm tra trạng thái thực tế trên GHN.');
  if(s.status==='unknown'&&next==='pickup_pending'){s.tracking=required(input.tracking,'Mã vận đơn đã đối soát',100);}
  if(next==='in_transit'&&o.status==='confirmed'){
   for(const i of o.items.filter(i=>!i.productType||i.productType==='physical')){const p=get('products',i.productId);if(p.reserved<i.quantity||p.stock<i.quantity)fail('Tồn kho không khớp; cần kiểm tra.');put('products',{...p,stock:p.stock-i.quantity,reserved:p.reserved-i.quantity});put('stock',{productId:p.id,orderId:o.id,delta:-i.quantity,reservedDelta:-i.quantity,type:'dispatch',actor:user.id});}put('orders',{...o,status:'fulfilling'});
  }
  if(next==='delivered')put('orders',{...o,status:'delivered'});
  if(next==='returned'){for(const i of o.items.filter(i=>!i.productType||i.productType==='physical')){const p=get('products',i.productId);put('products',{...p,stock:p.stock+i.quantity});put('stock',{productId:p.id,orderId:o.id,delta:i.quantity,type:'returned_checked',actor:user.id});}put('orders',{...o,status:'returned'});}
  s.status=next;s.history=[...(s.history||[]),{status:next,at:now(),actor:user.id}];if(next==='delivery_failed')runWorkflows('shipping_failed',{...s,title:o.code});
 }syncPlanHandoff(get('orders',o.id));audit(user.id,'shipment_updated',id,input.action||input.status);return put('shipments',s);});}
export function runWorkflows(trigger,entity){for(const w of all('workflows').filter(x=>x.enabled&&x.trigger===trigger)){
 const hay=(entity.text||entity.lastMessage||'').toLowerCase();if(w.keyword&&!hay.includes(w.keyword.toLowerCase()))continue;
 if(w.action==='tag'&&entity.conversationId){const conv=get('conversations',entity.conversationId);if(conv)put('conversations',{...conv,tags:[...new Set([...(conv.tags||[]),w.value])]});}
 if(w.action==='notify')notification(w.name,w.value,'inbox');if(w.action==='task')put('tasks',{name:w.value||w.name,status:'open',entityId:entity.id});put('workflows',{...w,runs:(w.runs||0)+1,lastRun:now()});audit('automation',w.name,entity.id);
}}
export async function reply(user,id,input){permission(user,'inbox');const conv=get('conversations',id);if(!conv||conv.deletedAt)fail('Không tìm thấy hội thoại.',404);assertChannel(user,conv.connectionId);let text=String(input.text||'').trim();if(text.length>5000)fail('Nội dung quá dài.');const ch=get('connections',conv.connectionId);if(!ch)fail('Kênh không tồn tại.');if(conv.groupUnavailable&&!input.note)fail('Tài khoản đã rời nhóm hoặc nhóm đã giải tán.');
 const ids=input.assetIds||[];if(!Array.isArray(ids)||ids.length>10)fail('Chọn tối đa 10 media.');const assets=ids.map(id=>{const a=get('assets',id);if(!a||a.active===false||!(a.scopes||['chat']).includes('chat')||!/^\/uploads\/asset_[a-zA-Z0-9-]+\.[a-z]+$/.test(a.url))fail('Media không hợp lệ.');if(a.connectionId)assertChannel(user,a.connectionId);return a;});
 if(!text&&!assets.length)fail('Nhập nội dung hoặc chọn media.');
 if(assets.length&&ch.mode!=='demo'&&ch.provider!=='zalo_personal'&&!input.note)fail('Kênh này chưa hỗ trợ gửi media trong ứng dụng.');
 let quoted=input.quoteId?get('messages',input.quoteId):null;if(input.quoteId&&(!quoted||quoted.deletedAt||quoted.conversationId!==id||quoted.direction==='note'))fail('Tin trích dẫn không hợp lệ.');
 const nativeQuote=quoted&&ch.provider==='zalo_personal'&&quoted.quoteSource;
 if(quoted&&!nativeQuote)text='> '+quoted.text.slice(0,1000)+'\n\n'+text;
 if(text.length>5000)fail('Nội dung kèm trích dẫn vượt 5000 ký tự.');
 const options={...(nativeQuote?{quote:quoted.quoteSource}:{}),...(assets.length?{attachments:assets.map(a=>join(dataDir,'uploads',basename(a.url)))}:{})};
 if(input.version!==conv.version)fail('Hội thoại vừa thay đổi. Tải lại trước khi gửi.',409);
 if(conv.sending)fail('Có một tin nhắn đang gửi. Vui lòng chờ.',409);put('conversations',{...conv,sending:true,assignee:user.id});
 const retrySource=input.retryOf?get('messages',input.retryOf):null;
 if(input.retryOf&&(!retrySource||retrySource.conversationId!==id||retrySource.status!=='failed'||retrySource.retryMessageId)){put('conversations',{...get('conversations',id),sending:false});fail('Tin nhắn không còn có thể gửi lại.',409);}
 let msg=put('messages',{conversationId:id,direction:input.note?'note':'outgoing',senderType:user.botId?'ai':'staff',botId:user.botId||null,botRunId:user.botRunId||null,text,attachments:assets.map(({id,url,name,type})=>({assetId:id,url,name,type})),quoteId:quoted?.id||null,retryOf:retrySource?.id||null,status:'sending',actor:user.id});
 if(retrySource)put('messages',{...retrySource,retryMessageId:msg.id});
 try{let result;if(input.note)result={};else if(ch.mode==='demo')result={demo:true};else {if(ch.status!=='connected')fail('Kênh chưa được kết nối thực tế.');result=await sendMessage(ch,conv,text,options);}
 msg=put('messages',{...msg,status:input.note?'internal':ch.mode==='demo'?'demo':'accepted',externalId:result.message_id||result.id||null});
 const current=get('conversations',id);put('conversations',{...current,sending:false,lastMessage:input.note?current.lastMessage:text,lastAt:input.note?current.lastAt:now(),unread:input.note?current.unread:false,waitingSince:input.note?current.waitingSince:null,slaAlerted:input.note?current.slaAlerted:false,firstResponseSeconds:!input.note&&current.waitingSince?Math.round((Date.now()-Date.parse(current.waitingSince))/1000):current.firstResponseSeconds,assignee:user.id});audit(user.id,input.note?'note_added':'message_sent',id);if(!input.note)finishMentionTasks(user,id,msg.id);return msg;
 }catch(e){put('messages',{...msg,status:e.unknown?'unknown':'failed',error:e.message});put('conversations',{...get('conversations',id),sending:false});throw e;}
}
export function ingestDemo(user,input){permission(user,'inbox');assertChannel(user,input.connectionId);const ch=get('connections',input.connectionId);if(ch?.mode!=='demo')fail('Chỉ tạo tương tác mẫu trên kênh mẫu.');const c=get('customers',input.customerId);if(!c)fail('Chọn khách hàng.');const text=required(input.text,'Tin nhắn');const conv=put('conversations',{customerId:c.id,connectionId:ch.id,kind:input.kind||'message',status:'open',unread:true,assignee:'',lastMessage:text,lastAt:now(),tags:[],mode:'demo',productId:input.productId||null});const msg=put('messages',{conversationId:conv.id,direction:'incoming',text,status:'demo'});runWorkflows('message_received',{...msg,conversationId:conv.id});captureLead(get('conversations',conv.id),msg);return get('conversations',conv.id);}
let ticking=false;
export async function tick(){if(ticking)return;ticking=true;try{
 const jobs=all('publications').filter(p=>p.status==='scheduled'&&Date.parse(p.scheduleAt)<=Date.now()).slice(0,5);
 for(const p of jobs){const ch=get('connections',p.connectionId);if(!ch||ch.status==='disconnected'){put('publications',{...p,status:'blocked',error:'Kênh đã ngắt kết nối.'});continue;}
  if(p.mode==='assisted'){put('publications',{...p,status:'awaiting_manual'});notification('Đến giờ đăng: '+p.title,`Mở gói đăng cho ${ch.name}.`,'calendar');continue;}
  if(p.mode==='demo'){put('publications',{...p,status:'demo_published',publishedAt:now(),attempts:p.attempts+1});continue;}
  if(ch.status!=='connected'){put('publications',{...p,status:'blocked',error:'Kênh chưa được kiểm tra kết nối.'});continue;}
  put('publications',{...p,status:'dispatching',attempts:p.attempts+1});
  try{const r=await publish(ch,p);put('publications',{...get('publications',p.id),...r,status:r.processing?'processing':'published',publishedAt:r.processing?null:now(),error:''});}
  catch(e){put('publications',{...get('publications',p.id),status:e.unknown?'unknown':'failed',error:e.message});notification('Cần xử lý bài đăng',`${ch.name}: ${e.message}`,'calendar');}
 }
 for(const p of all('publications').filter(x=>x.status==='processing'&&x.containerId).slice(0,5)){
  if(Date.now()-Date.parse(p.updatedAt)>30*60000){put('publications',{...p,status:'unknown',error:'Xử lý quá lâu. Đối soát trên nền tảng gốc.'});continue;}
  const ch=get('connections',p.connectionId);if(!ch||ch.status!=='connected')continue;
  try{const r=await continuePublish(ch,p);if(r)put('publications',{...p,...r,status:'published',publishedAt:now()});}catch(e){put('publications',{...p,status:e.unknown?'unknown':'failed',error:e.message});}
 }
}finally{ticking=false;}}
export function recoverJobs(){for(const p of all('publications').filter(x=>x.status==='dispatching'))put('publications',{...p,status:'unknown',error:'Máy chủ khởi động lại khi đang gửi. Cần kiểm tra kết quả trước khi gửi lại.'});for(const c of all('conversations').filter(x=>x.sending))put('conversations',{...c,sending:false});for(const m of all('messages').filter(x=>x.status==='sending'))put('messages',{...m,status:'unknown'});for(const s of all('shipments').filter(x=>x.status==='creating'))put('shipments',{...s,status:'unknown'});}
