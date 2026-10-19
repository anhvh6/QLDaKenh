// All new product selections share the commerce catalog. Purchase rows remain snapshots.
export function planProducts(products,{includeInactive=false}={}){
 return products.filter(p=>includeInactive||p.active!==false).map(p=>({
  id:p.id,productId:p.id,id_sp:p.id_sp||p.sku||p.id,sku:p.sku||'',
  ten_sp:p.name,gia_ban:Number(p.price||0),gia_nhap:Number(p.cost||0),
  trang_thai:p.active===false?0:1,productType:p.productType||'physical',
  stock:Number(p.stock||0),reserved:Number(p.reserved||0),
  availableStock:(p.productType||'physical')==='physical'?Math.max(0,Number(p.stock||0)-Number(p.reserved||0)):null,
  version:p.version
 }));
}
export function orderProducts(products){return planProducts(products).map(p=>({id:p.productId,id_sp:p.id_sp,sku:p.sku,name:p.ten_sp,price:p.gia_ban,productType:p.productType,availableStock:p.availableStock}));}
export function resolveCatalogProduct(products,id){
 const active=products.filter(p=>p.active!==false);
 const exact=active.find(p=>p.id===id);if(exact)return exact;
 if(!String(id).startsWith('catalog:'))return null;
 const key=id.slice(8),matches=active.filter(p=>(p.id_sp||p.sku||p.id)===key);
 return matches.length===1?matches[0]:null;
}
