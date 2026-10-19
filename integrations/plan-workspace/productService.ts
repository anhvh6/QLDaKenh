export const productService={
 async getProducts(){const r=await fetch('/api/product-catalog',{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Không tải được sản phẩm.');return data.sort((a:any,b:any)=>a.ten_sp.localeCompare(b.ten_sp,'vi'));},
 async upsertProduct(){throw Error('Vui lòng sửa tại mục Sản phẩm.');},
 async deleteProduct(){throw Error('Vui lòng ngừng bán tại mục Sản phẩm.');}
};
