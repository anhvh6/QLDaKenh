// Narrow repair of an acknowledged order whose only conflict is an empty POS address.
// Defaults to read-only; --apply updates this existing order, never creates another one.
import {all,get,secret,db,audit} from '../server/store.mjs';
import {pancakeRequest} from '../server/pancake-api.mjs';
import {fields,hash,orderAddress,orderCode,paidAmount} from '../server/pancake-model.mjs';
import {posRoute} from '../server/pancake-pos.mjs';
const id=process.argv[2],apply=process.argv.includes('--apply');if(!id)throw Error('Supply the exact local order ID.');
const order=get('orders',id),job=all('pos_jobs').find(j=>j.kind==='orders'&&j.localId===id&&j.state==='conflict');
if(!order||!job)throw Error('The selected order has no address conflict.');
const account=get('pos_accounts',job.accountId),link=get('pos_links',job.id),local=fields('orders',order);
if(!account?.active||account.status!=='connected'||!link?.remoteId||!local.address||hash(local)!==hash(job.target))throw Error('Connection, identity or local order changed; review before repair.');
const differences=Object.keys(local).filter(k=>JSON.stringify(local[k])!==JSON.stringify(job.remoteTarget?.[k]));
if(differences.length!==1||differences[0]!=='address'||job.remoteTarget.address)throw Error('The conflict includes fields other than an empty address.');
const path='/shops/'+encodeURIComponent(account.shopId)+'/orders/'+encodeURIComponent(link.remoteId),key=secret('pancake:'+account.id).apiKey;
const unwrap=r=>r.data||r,before=unwrap(await pancakeRequest(key,path));
// List/detail responses expand item, customer and warehouse metadata differently.
const business=r=>({id:String(r.id),code:orderCode(r),status:r.status,warehouse:r.warehouse_id,address:r.shipping_address,billName:r.bill_full_name,billPhone:r.bill_phone_number,email:r.bill_email,items:(r.items||[]).map(i=>({product:i.product_id,variation:i.variation_id,quantity:Number(i.quantity),price:Number(i.variation_info?.retail_price||0),discount:Number(i.discount_each_product||0)})),discount:Number(r.total_discount||0),shippingFee:Number(r.shipping_fee||0),paid:paidAmount(r),note:r.note||'',tracking:r.partner?.extend_code||''});
if(orderCode(before)!==order.code||String(before.id)!==String(link.remoteId)||before.status!==0||orderAddress(before)||hash(business(before))!==hash(business(link.remote)))throw Error('POS order changed or has an address; review before repair.');
const owner=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(account.ownerId);if(!owner?.active||owner.role!=='owner')throw Error('Original connection owner unavailable.');
console.log(JSON.stringify({apply,code:order.code,remoteId:link.remoteId,onlyAddressMissing:true}));
if(apply){
 await pancakeRequest(key,path,{method:'PUT',body:{shipping_address:{full_name:before.shipping_address?.full_name||order.receiverName,phone_number:before.shipping_address?.phone_number||order.phone,address:local.address,full_address:local.address}}});
 const after=unwrap(await pancakeRequest(key,path));if(orderAddress(after)!==local.address)throw Error('POS address read-back differs; do not resend creation.');
 await posRoute('/api/pos/jobs/'+job.id+'/reconcile','POST',{},owner,new URL('http://localhost'));
 const saved=get('pos_jobs',job.id);audit(owner.id,'pos_order_address_repaired',order.id,{remoteId:link.remoteId});
 console.log(JSON.stringify({code:order.code,remoteId:link.remoteId,state:saved.state,addressReadBackMatches:true,createdNewOrder:false}));
 if(saved.state!=='done')throw Error('Remaining mismatch requires review.');
}
