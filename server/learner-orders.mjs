// Project synchronized records only; never send raw provider payloads to the profile.
const closed=new Set(['delivered','returned','cancelled','deleted','completed']);
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^84(?=\d{9}$)/,'0');
const newest=rows=>rows.slice().sort((a,b)=>String(b.carrierUpdatedAt||b.updatedAt||b.createdAt||b.at||'').localeCompare(String(a.carrierUpdatedAt||a.updatedAt||a.createdAt||a.at||'')))[0];
export function learnerOrders(customer,{orders=[],shipments=[],links=[],carrierOrders=[],customers=[],users=[],products=[]},owner=false){
 const local=orders.filter(o=>o.customerId===customer.id),used=new Set(),result=[];
 const uniquePhone=phone(customer.phone)&&customers.filter(c=>phone(c.phone)===phone(customer.phone)).length===1;
 for(const o of local){
  const s=newest(shipments.filter(s=>s.orderId===o.id&&s.status!=='cancelled'));
  const link=newest(links.filter(l=>l.kind==='orders'&&l.localId===o.id)),r=link?.remote||{},a=r.shipping_address||{},p=r.partner||{};
  const tracking=s?.tracking||o.posTracking||p.order_number_vtp||p.extend_code||'';
  const carrier=carrierOrders.find(c=>c.tracking===tracking&&tracking&&((s?.accountId&&c.accountId===s.accountId)||(!s?.accountId&&o.posTracking===tracking)));
  if(carrier)used.add(carrier.id);
  const status=carrier?.status||s?.status||o.status;
  if(closed.has(status)||['cancelled','deleted'].includes(o.status)||o.requiresShipping===false)continue;
  const last=newest(s?.history||[]);
  result.push({id:o.id,code:o.code||link?.remoteId||o.id,status,statusName:carrier?.carrierStatusName||s?.carrierStatusName||(!s||s.carrier==='pancake_pos'?r.status_name:'')||'',
   source:link?'Pancake POS':s?.carrier==='viettelpost'?'Viettel Post':o.source||'Hệ thống',
   receiverName:s?.receiver?.name||carrier?.receiverName||o.receiverName||a.full_name||customer.name,
   phone:s?.receiver?.phone||carrier?.phone||o.phone||a.phone_number||customer.phone||'',
   address:s?.receiver?.address||carrier?.address||o.address||a.address||a.full_address||'',
   items:(o.items||[]).map(i=>({name:i.name||products.find(p=>p.id===i.productId)?.name||'Sản phẩm',quantity:i.quantity})),
   total:o.total??null,weight:s?.parcel?.weight||carrier?.weight||o.parcel?.weight||r.total_weight||null,
   createdAt:o.createdAt||r.inserted_at||'',updatedAt:carrier?.carrierUpdatedAt||s?.carrierUpdatedAt||r.updated_at||o.updatedAt||'',
   note:o.note||r.note||'',printNote:r.note_print||'',creator:r.creator?.name||(o.posSourceAccountId?'':users.find(u=>u.id===o.createdBy)?.name)||'',
   tracking,carrier:o.posCarrier||p.partner_name||(s?.carrier==='viettelpost'||carrier?'Viettel Post':''),
   expectedDelivery:s?.expectedDelivery||carrier?.carrierData?.EXPECTED_DELIVERY_DATE||carrier?.carrierData?.EXPECTED_DELIVERY||r.estimate_delivery_date||'',
   deliveryNote:carrier?.history?.at(-1)?.note||last?.note||carrier?.note||''});
 }
 // Unlinked carrier history can only be associated for the owner with one exact,
 // unmasked phone match. Staff only receive explicitly linked customer orders.
 if(owner&&uniquePhone)for(const c of carrierOrders){
  if(used.has(c.id)||closed.has(c.status)||phone(c.phone)!==phone(customer.phone))continue;
  if(result.some(o=>o.tracking===c.tracking))continue;
  result.push({id:c.id,code:c.reference||c.tracking,status:c.status,statusName:c.carrierStatusName||'',source:'Viettel Post',receiverName:c.receiverName,phone:c.phone,address:c.address,
   items:c.productName?[{name:c.productName,quantity:c.quantity}]:[],total:c.declaredValue??null,weight:c.weight||null,createdAt:c.createdAt,updatedAt:c.carrierUpdatedAt||c.syncedAt,
   note:c.note||'',printNote:'',creator:'',tracking:c.tracking,carrier:'Viettel Post',expectedDelivery:c.carrierData?.EXPECTED_DELIVERY_DATE||c.carrierData?.EXPECTED_DELIVERY||'',deliveryNote:c.history?.at(-1)?.note||''});
 }
 return result.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
