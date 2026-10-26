let pending:Promise<any[]>|null=null,rows:any[]|null=null,loadedAt=0;
export const productService={
 async getProducts(){if(rows&&Date.now()-loadedAt<15000)return rows;if(pending)return pending;pending=(async()=>{const r=await fetch('/api/product-catalog',{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Không tải được sản phẩm.');rows=data.sort((a:any,b:any)=>a.ten_sp.localeCompare(b.ten_sp,'vi'));loadedAt=Date.now();return rows!;})().finally(()=>{pending=null;});return pending;},
 async upsertProduct(){throw Error('Vui lòng sửa tại mục Sản phẩm.');},
 async deleteProduct(){throw Error('Vui lòng ngừng bán tại mục Sản phẩm.');}
};
