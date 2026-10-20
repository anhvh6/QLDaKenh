import {get,secret} from './store.mjs';
import {pancakeRequest} from './pancake-api.mjs';
import {vtpRequest} from './viettelpost.mjs';
import {uniqueArea,locationFromSelection,streetFromAddress} from './order-address-model.mjs';
import {addressProof} from './order-address-proof.mjs';
const cache=new Map();
const fail=message=>{throw Object.assign(Error(message),{status:400});};
function connection(target){if(!target)return {provider:'pos',key:'',id:'public'};const [provider,id,...rest]=String(target).split(':');if(rest.length||!['pos','vtp'].includes(provider))fail('Chọn nơi xử lý đơn hàng.');const a=get(provider==='pos'?'pos_accounts':'shipping_accounts',id);if(!a?.active||a.status!=='connected')fail('Kết nối xử lý đơn đang dừng.');return {provider,id,environment:a.environment,key:secret((provider==='pos'?'pancake:':'carrier:')+id)[provider==='pos'?'apiKey':'token']};}
export async function addressCatalog(input,{pos=pancakeRequest,vtp=vtpRequest}={}){
 const {target='',format='new',level='province',provinceId='',districtId=''}=input;if(!['new','old'].includes(format)||!['province','district','ward'].includes(level))fail('Loại danh mục địa chỉ không hợp lệ.');
 if(level!=='province'&&!/^[-_A-Za-z0-9]{1,40}$/.test(provinceId)||level==='ward'&&format==='old'&&!/^[-_A-Za-z0-9]{1,40}$/.test(districtId))fail('Chọn đầy đủ khu vực cấp trên.');
 const a=connection(target),key=JSON.stringify([target,a.environment,format,level,level==='province'?'':provinceId,level==='ward'&&format==='old'?districtId:'']),previous=cache.get(key);if(previous?.until>Date.now())return previous.rows;
 let rows;if(a.provider==='pos'){
  const path='/geo/'+({province:'provinces',district:'districts',ward:'communes'}[level]),query=level==='province'?{country_code:84,is_new:format==='new'}:{province_id:provinceId,...(format==='old'&&level==='ward'?{district_id:districtId}:{})};
  const result=await pos(a.key||'',path,{method:'GET',query});rows=result.data?.map(r=>({id:String(r.id),name:r.name,provinceId:r.province_id?String(r.province_id):'',districtId:r.district_id?String(r.district_id):''}));
 }else{
  const path=level==='province'?(format==='new'?'/v3/categories/listProvinceNew':'/v2/categories/listProvince'):level==='district'?'/v2/categories/listDistrict':format==='new'?'/v3/categories/listWardsNew':'/v2/categories/listWards';
  const query=level==='province'?{}:level==='ward'&&format==='old'?{districtId}:{provinceId};const result=await vtp(a.environment,path,{method:'GET',query,token:a.key});
  rows=result?.map(r=>({id:String(r[level==='province'?'PROVINCE_ID':level==='district'?'DISTRICT_ID':'WARDS_ID']),name:level==='province'?(r.PROVINCE_NAME||r.WPROVINCE_NAME):level==='district'?r.DISTRICT_NAME:r.WARDS_NAME,provinceId:r.PROVINCE_ID?String(r.PROVINCE_ID):provinceId,districtId:r.DISTRICT_ID?String(r.DISTRICT_ID):districtId}));
 }
 if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r.name||r.id==='undefined'))fail('Nguồn địa chỉ chưa trả danh mục hợp lệ. Thử tải lại, chưa thể xác nhận địa chỉ.');
 if(cache.size>500)cache.delete(cache.keys().next().value);cache.set(key,{rows,until:Date.now()+3600000});return rows;
}
export async function validateOrderAddress(input,deps){const base={...input,format:input.format||'new'};const provinces=await addressCatalog({...base,level:'province'},deps),districts=base.format==='old'?await addressCatalog({...base,level:'district'},deps):[],wards=await addressCatalog({...base,level:'ward'},deps);const location=locationFromSelection(base,provinces,districts,wards);return {location,proof:addressProof(location)};}
export async function resolveOrderAddress(input,deps){
 const address=String(input.address||'').trim();if(address.length<8||address.length>500)return {resolved:false};
 if(input.target?.startsWith('vtp:')){
  const a=connection(input.target),sender=get('shipping_accounts',a.id)?.sender;
  if(sender?.address)try{
   const result=await (deps?.vtp||vtpRequest)(a.environment,'/v2/order/getPriceAllNlp',{token:a.key,fullResponse:true,body:{SENDER_ADDRESS:sender.address,RECEIVER_ADDRESS:address,PRODUCT_TYPE:'HH',PRODUCT_WEIGHT:500,PRODUCT_PRICE:0,MONEY_COLLECTION:0,TYPE:1}}),parsed=result.RECEIVER_ADDRESS||result.data?.RECEIVER_ADDRESS;
   if(parsed?.PROVINCE_ID&&(parsed.WARD_ID||parsed.WARDS_ID))for(const format of ['new','old'])try{
    const base={target:input.target,format,provinceId:String(parsed.PROVINCE_ID),districtId:String(parsed.DISTRICT_ID||''),wardId:String(parsed.WARD_ID||parsed.WARDS_ID)},provinces=await addressCatalog({...base,level:'province'},deps),districts=format==='old'?await addressCatalog({...base,level:'district'},deps):[],wards=await addressCatalog({...base,level:'ward'},deps),p=provinces.find(r=>r.id===base.provinceId),d=districts.find(r=>r.id===base.districtId),w=wards.find(r=>r.id===base.wardId);
    if(!p||!w||format==='old'&&!d)continue;
    const street=streetFromAddress(address,[p.name,d?.name,w.name].filter(Boolean));if(street===address)return {resolved:false};const location=locationFromSelection({...base,street},provinces,districts,wards);return {resolved:true,location,proof:addressProof(location)};
   }catch{}
  }catch{}
 }
 for(const format of input.format?[input.format]:/\b(quận|huyện|q\.|h\.)/iu.test(address)?['old','new']:['new','old']){
  const base={target:input.target||'',format},p=uniqueArea(address,await addressCatalog({...base,level:'province'},deps));if(!p)continue;base.provinceId=p.id;
  const districts=format==='old'?await addressCatalog({...base,level:'district'},deps):[],d=format==='old'?uniqueArea(address,districts):null;if(format==='old'&&!d)continue;base.districtId=d?.id||'';
  const wards=await addressCatalog({...base,level:'ward'},deps),w=uniqueArea(address,wards);if(!w)continue;
  const street=streetFromAddress(address,[p.name,d?.name,w.name].filter(Boolean));if(street===address&&!address.includes(','))return {resolved:false};
  const location=locationFromSelection({...base,street,wardId:w.id},[p],districts,wards);return {resolved:true,location,proof:addressProof(location)};
 }
 return {resolved:false};
}
