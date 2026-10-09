const cache=new Map();
export async function resolveCarrierAddress(environment,parsed,request){
 if(!parsed?.PROVINCE_ID||!parsed.WARD_ID)return parsed;
 const list=async(path,query={})=>{const key=environment+path+JSON.stringify(query),old=cache.get(key);if(old&&old.until>Date.now())return old.rows;const rows=await request(environment,path,{method:'GET',query});if(!Array.isArray(rows))throw Error('Danh mục địa chỉ hãng không hợp lệ.');cache.set(key,{rows,until:Date.now()+3600000});return rows;};
 const same=(a,b)=>String(a)===String(b);
 try{
  const [provinces,wards]=await Promise.all([list('/v3/categories/listProvinceNew'),list('/v3/categories/listWardsNew',{provinceId:parsed.PROVINCE_ID})]);
  const p=provinces.find(p=>same(p.PROVINCE_ID,parsed.PROVINCE_ID)),w=wards.find(w=>same(w.WARDS_ID,parsed.WARD_ID));
  if(p&&w)return {...parsed,ADDRESS:[w.WARDS_NAME,p.PROVINCE_NAME||p.WPROVINCE_NAME].join(', '),addressType:'new'};
 }catch{}
 try{
  const [provinces,districts,wards]=await Promise.all([list('/v2/categories/listProvince'),list('/v2/categories/listDistrict',{provinceId:parsed.PROVINCE_ID}),list('/v2/categories/listWards',{districtId:parsed.DISTRICT_ID})]);
  const p=provinces.find(p=>same(p.PROVINCE_ID,parsed.PROVINCE_ID)),d=districts.find(d=>same(d.DISTRICT_ID,parsed.DISTRICT_ID)),w=wards.find(w=>same(w.WARDS_ID,parsed.WARD_ID));
  if(p&&d&&w)return {...parsed,ADDRESS:[w.WARDS_NAME,d.DISTRICT_NAME,p.PROVINCE_NAME].join(', '),addressType:'old'};
 }catch{}
 return {...parsed,addressType:'unresolved'};
}
