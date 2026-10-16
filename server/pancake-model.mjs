import {createHash} from 'node:crypto';
export const hash=value=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
export const normalizePhone=value=>String(value||'').replace(/[^\d]/g,'').replace(/^84(?=\d{9}$)/,'0');
export const remoteId=(kind,row)=>String(kind==='customers'?(row.customer_id||row.id):row.id??'');
export const localStatus=code=>({0:'draft',17:'draft',11:'confirmed',12:'confirmed',13:'confirmed',20:'confirmed',1:'confirmed',8:'confirmed',9:'confirmed',2:'shipping',3:'delivered',16:'delivered',4:'returning',15:'partially_returned',5:'return_pending_check',6:'cancelled',7:'cancelled'}[Number(code)]);
export const posStatus=status=>({draft:0,confirmed:1,shipping:2,delivered:3,returning:4,partially_returned:15,return_pending_check:5,cancelled:6}[status]);
export const paidAmount=row=>Math.max(0,Number(row.cash||0)+Number(row.transfer_money||0)+['charged_by_card','charged_by_momo','charged_by_vnpay','charged_by_qrpay','charged_by_fundiin','charged_by_kredivo'].reduce((n,k)=>n+Number(row[k]||0),0));
export function fields(kind,row){
 if(kind==='products')return {name:row.name||'',sku:row.sku||'',price:Number(row.price||0),cost:Number(row.cost||0),weight:Number(row.weight||500),active:row.active!==false};
 if(kind==='customers')return {name:row.name||'',phone:normalizePhone(row.phone),email:row.email||'',address:row.address||''};
 return {customerId:row.customerId,receiverName:row.receiverName||'',phone:normalizePhone(row.phone),email:row.email||'',address:row.address||'',items:(row.items||[]).map(i=>({productId:i.productId,quantity:Number(i.quantity),price:Number(i.price)})),discount:Number(row.discount||0),shippingFee:Number(row.shippingFee||0),paid:Number(row.paid||0),status:row.status,note:row.note||'',tracking:row.posTracking||''};
}
export function fromProduct(v){const product=v.product||{};return {name:[product.name||v.name||v.display_id,...(v.fields||[]).map(f=>f.value)].filter(Boolean).join(' · '),sku:String(v.custom_id||v.display_id||v.barcode||v.id),price:Number(v.retail_price||0),cost:Number(v.last_imported_price||v.average_imported_price||0),weight:Math.max(1,Number(v.weight||product.weight||500)),active:v.is_hidden!==true&&v.is_removed!==true&&product.is_published!==false,productType:product.type==='service'?'service':'physical',images:v.images||[]};}
export function customerAddresses(c){return c.shop_customer_addresses||c.shop_customer_address||[];}
export const orderCode=row=>String(row.custom_id||row.id||'');
// Send only writable OpenAPI fields; GET responses include server-only fields and nulls.
export function writableProduct(product){
 const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>row[k]!==undefined&&row[k]!==null).map(k=>[k,row[k]]));
 const out=pick(product,['measure_group_id','name','type','category_ids','note','note_product','product_attributes','tags','weight','custom_id','is_published','bonus_products','materials','keyword','brand_id']);
 out.variations=(product.variations||[]).map(v=>pick(v,['id','fields','images','last_imported_price','retail_price','price_at_counter','retail_price_by_currency','weight','size','barcode','custom_id','is_hidden','wholesale_price2','is_removed','keyword']));
 return out;
}
export function fromCustomer(c){const address=customerAddresses(c)[0];return {name:c.name||'Khách hàng POS',phone:normalizePhone(c.phone_numbers?.[0]),email:c.emails?.[0]||'',address:String(address?.full_address||address?.address||'').replace(/^[,\s]+|[,\s]+$/g,'')};}
export function orderBody(order,customer,items,account,shipment){
 const status=posStatus(order.status);if(status===undefined)throw Error('Trạng thái đơn hiện tại chưa có ánh xạ sang POS.');
 return {shop_id:Number(account.shopId),custom_id:order.code||order.id,status,bill_full_name:order.receiverName||customer?.name,bill_phone_number:order.phone||customer?.phone,bill_email:order.email||customer?.email||'',warehouse_id:account.warehouseId,items,total_discount:Number(order.discount||0),shipping_fee:Number(order.shippingFee||0),is_free_shipping:order.freeShipping===true,note:order.note||'',cash:Number(order.paid||0),shipping_address:{full_name:order.receiverName||customer?.name,phone_number:order.phone||customer?.phone,full_address:order.address||customer?.address||''},...(shipment?.tracking?{partner:{extend_code:shipment.tracking}}:{})};
}
