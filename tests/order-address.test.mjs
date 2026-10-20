import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'order-address-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put}=await import('../server/store.mjs');
const {addressCatalog,resolveOrderAddress,validateOrderAddress}=await import('../server/order-address.mjs');
const {uniqueArea,locationFromSelection,streetFromAddress}=await import('../server/order-address-model.mjs');
const {verifiedAddress}=await import('../server/order-address-proof.mjs');
const {orderBody}=await import('../server/pancake-model.mjs');
const {pancakeRequest}=await import('../server/pancake-api.mjs');
const {createOrder}=await import('../server/domain.mjs');
const p={id:'101',name:'Hà Nội'},d={id:'10106',name:'Quận Đống Đa',provinceId:'101'},w={id:'1010601',name:'Phường Kim Liên',provinceId:'101',districtId:'10106'};
test('manual old address validates hierarchy; wards from another district cannot pass',()=>{
 const input={target:'pos:demo',format:'old',provinceId:p.id,districtId:d.id,wardId:w.id,street:'01 ngõ 191 Khương Thượng'};
 const l=locationFromSelection(input,[p],[d],[w]);assert.equal(l.fullAddress,'01 ngõ 191 Khương Thượng, Phường Kim Liên, Quận Đống Đa, Hà Nội');
 assert.throws(()=>locationFromSelection(input,[p],[d],[{...w,districtId:'OTHER'}]),/không khớp/);
 assert.throws(()=>locationFromSelection({...input,street:''},[p],[d],[w]),/địa chỉ chi tiết/);
});
test('recognition requires a unique whole administrative name and preserves the street',()=>{
 assert.equal(uniqueArea('12 Phố Huế, Hà Nội',[p,{id:'2',name:'Hà Nam'}]),p);
 assert.equal(uniqueArea('Nguyễn An Khánh', [{id:'1',name:'Xã An'},{id:'2',name:'Xã An Khánh'}]),null);
 assert.equal(uniqueArea('01 ngõ 191 Khương Thượng, Phường Kim Liên',[w,{id:'other',name:'Phường Khương Thượng'}]),w);
 assert.equal(streetFromAddress('12 Kim Liên, Phường Kim Liên, Quận Đống Đa, Hà Nội',[p.name,d.name,w.name]),'12 Kim Liên');
});
test('POS catalogs support both hierarchies; unresolved or ambiguous input requires manual selection',async()=>{
 const calls=[];const pos=async(key,path,opts)=>{calls.push([path,opts.query]);return {data:path.endsWith('provinces')?[p]:path.endsWith('districts')?[d]:[w]};};
 const r=await resolveOrderAddress({address:'01 ngõ 191 Khương Thượng, Phường Kim Liên, Quận Đống Đa, Hà Nội',format:'old'},{pos});
 assert.equal(r.resolved,true);assert.equal(r.location.street,'01 ngõ 191 Khương Thượng');assert.ok(calls.some(([path,q])=>path==='/geo/communes'&&q.district_id===d.id));
 assert.equal((await resolveOrderAddress({address:'01 ngõ 191 Khương Thượng',format:'old'},{pos})).resolved,false);
 const proofInput={addressProof:r.proof,requireAddressValidation:'true'};assert.deepEqual(verifiedAddress(proofInput,'',r.location.fullAddress),r.location);
 assert.throws(()=>verifiedAddress(proofInput,'vtp:demo',r.location.fullAddress),/đã thay đổi/);
 assert.throws(()=>verifiedAddress(proofInput,'','địa chỉ sửa khác'),/đã thay đổi/);
 assert.throws(()=>verifiedAddress({requireAddressValidation:'true'},'',r.location.fullAddress),/Chọn và xác nhận/);
});
test('new POS commune lookup uses province only, without inventing a district',async()=>{
 const pos=async(key,path,opts)=>{assert.notEqual(path,'/geo/districts');if(path.endsWith('communes'))assert.deepEqual(opts.query,{province_id:'101'});return {data:path.endsWith('provinces')?[p]:[{...w,district_id:null}]};};
 const r=await validateOrderAddress({format:'new',street:'12 Phố Huế',provinceId:p.id,wardId:w.id},{pos});assert.equal(r.location.districtId,'');assert.equal(r.location.fullAddress,'12 Phố Huế, Phường Kim Liên, Hà Nội');
});
test('carrier catalog preserves its own ID namespace and picks ward name, not province name',async()=>{
 put('shipping_accounts',{id:'vtp-test',active:true,status:'connected',environment:'sandbox'});
 const vtp=async(env,path)=>{assert.equal(env,'sandbox');return path.includes('Province')?[{PROVINCE_ID:1,PROVINCE_NAME:'Hà Nội'}]:[{PROVINCE_ID:1,WARDS_ID:9,WARDS_NAME:'Phường Kim Liên'}];};
 const r=await validateOrderAddress({target:'vtp:vtp-test',format:'new',street:'12 phố Huế',provinceId:'1',wardId:'9'},{vtp});assert.equal(r.location.wardName,'Phường Kim Liên');assert.equal(r.location.provider,'vtp');
 const out=orderBody({status:'draft',address:r.location.fullAddress,addressLocation:r.location}, {},[],{id:'vtp-test',shopId:1});assert.equal(out.shipping_address.province_id,undefined);
});
test('POS order payload sends selected administrative IDs and the street separately',()=>{
 const location=locationFromSelection({target:'pos:demo',format:'old',provinceId:p.id,districtId:d.id,wardId:w.id,street:'12 phố Huế'},[p],[d],[w]);
 const out=orderBody({status:'draft',address:location.fullAddress,addressLocation:location},{},[],{id:'demo',shopId:1});assert.equal(out.shipping_address.commune_id,w.id);assert.equal(out.shipping_address.district_id,d.id);assert.equal(out.shipping_address.address,'12 phố Huế');assert.equal(out.shipping_address.full_address,location.fullAddress);
 const changed=orderBody({status:'draft',address:'địa chỉ khác',addressLocation:location},{},[],{id:'demo',shopId:1});assert.equal(changed.shipping_address.commune_id,undefined);
});
test('geo request allowlist is read-only and prevents unrelated query parameters',async()=>{
 await assert.rejects(()=>pancakeRequest('secret','/geo/provinces',{method:'POST'}),/không hợp lệ/);
 await assert.rejects(()=>pancakeRequest('secret','/geo/communes',{query:{province_id:'../shops'}}),/không hợp lệ/);
 await assert.rejects(()=>addressCatalog({level:'ward',format:'old',provinceId:p.id}),/cấp trên/);
});
test('order creation saves verified location and rejects a changed address before saving',async()=>{
 const checked=await validateOrderAddress({format:'old',street:'12 phố Huế',provinceId:p.id,districtId:d.id,wardId:w.id},{pos:async(key,path)=>({data:path.endsWith('provinces')?[p]:path.endsWith('districts')?[d]:[w]})});
 put('customers',{id:'address-customer',name:'Khách kiểm thử',phone:'0901234567'});put('products',{id:'address-product',name:'Sản phẩm kiểm thử',active:true,productType:'physical',stock:10,reserved:0,price:100000});
 const input={customerId:'address-customer',items:[{productId:'address-product',quantity:1}],phone:'0901234567',address:checked.location.fullAddress,addressProof:checked.proof,requireAddressValidation:'true'};
 const order=createOrder({id:'owner',role:'owner'},input);assert.deepEqual(order.addressLocation,checked.location);
 assert.throws(()=>createOrder({id:'owner',role:'owner'},{...input,address:'địa chỉ khác'}),/đã thay đổi/);
});
