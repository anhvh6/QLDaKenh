import {get,put,all,transaction,audit} from './store.mjs';
import {permission,fail,required,number,orderItemTotals} from './domain.mjs';
import {assertCustomer} from './taophacdo.mjs';
import {validateOrderTarget} from './order-routing.mjs';
import {orderPOSFields} from './order-workspace.mjs';
export function orderEditorRoute(path,method,input,user){
 const match=path.match(/^\/api\/orders\/([^/]+)\/editor$/);if(!match)return;
 let id;try{id=decodeURIComponent(match[1]);}catch{fail('Mã đơn hàng không hợp lệ.');}const o=get('orders',id);if(!o)fail('Không tìm thấy đơn hàng.',404);assertCustomer(user,o.customerId);
 if(method==='GET'){permission(user,'read');return {order:orderPOSFields([o])[0],products:all('products').filter(p=>p.active!==false),shipments:all('shipments').filter(s=>s.orderId===o.id),sync:all('pos_jobs').filter(j=>j.kind==='orders'&&j.localId===o.id).map(j=>({state:j.state,error:j.error||''}))};}
 if(method!=='PATCH')fail('Phương thức không hợp lệ.',405);permission(user,'orders');
 return transaction(()=>{
  if(Number(input.version)!==o.version)fail('Đơn đã thay đổi. Mở lại để cập nhật.',409);
  if(o.status!=='draft'||all('shipments').some(s=>s.orderId===o.id&&s.status!=='cancelled'))fail('Chỉ sửa sản phẩm/thông tin khi đơn ở trạng thái Mới và chưa có vận đơn.',409);
  const jobs=all('pos_jobs').filter(j=>j.kind==='orders'&&j.localId===o.id);if(jobs.some(j=>['sending','unknown','conflict'].includes(j.state)))fail('Đơn POS đang gửi hoặc cần đối soát. Kiểm tra kết quả trước khi sửa.',409);
  if(!Array.isArray(input.items)||!input.items.length)fail('Thêm ít nhất một sản phẩm.');
  const totals=orderItemTotals(user,input,true);if(totals.subtotal-totals.discount+totals.shippingFee<Number(o.paid||0))fail('Tổng tiền mới thấp hơn số tiền đã thu. Đối soát hoàn tiền trước.',409);
  const fulfillmentTarget=validateOrderTarget(String(input.fulfillmentTarget===undefined?o.fulfillmentTarget||'':input.fulfillmentTarget||''));
  if(o.posDispatchRequested&&fulfillmentTarget!==o.fulfillmentTarget)fail('Đơn đã gửi POS; không đổi sang nơi xử lý khác.',409);
  const parcel=Object.fromEntries(['weight','length','width','height'].map(k=>[k,number(input[k]??o.parcel?.[k]??(k==='weight'?500:0),k,k==='weight'?1:0,k==='weight'?1e6:300)]));
  const next={...o,items:totals.items,subtotal:totals.subtotal,discount:totals.discount,shippingFee:totals.shippingFee,total:totals.subtotal-totals.discount+totals.shippingFee,requiresShipping:totals.physical,receiverName:required(input.receiverName,'Tên người nhận',200),phone:required(input.phone,'Số điện thoại',30),address:totals.physical||fulfillmentTarget.startsWith('pos:')?required(input.address,'Địa chỉ nhận hàng',1000):String(input.address||'').slice(0,1000),email:String(input.email||'').slice(0,200),note:String(input.note||'').slice(0,2000),printNote:String(input.printNote||'').slice(0,2000),freeShipping:input.freeShipping===true,bankTransfer:input.bankTransfer===true,transferAmount:input.bankTransfer===true?number(input.transferAmount||0,'Chuyển khoản dự kiến'):0,fulfillmentTarget,parcel,awaitingProducts:false,lastEditedBy:user.id};
  next.paymentStatus=next.paid>=next.total?'paid':next.paid>0?'partial':'unpaid';const saved=put('orders',next,o.version);audit(user.id,'order_draft_edited',o.id,{items:saved.items.length});return saved;
 });
}
