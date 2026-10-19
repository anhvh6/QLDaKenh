import React,{useState,useEffect} from 'react';
import {Layout} from '../components/Layout';
import {productService} from '../src/services/productService';

export const ProductManagement=({onNavigate}:any)=>{
 const [rows,setRows]=useState<any[]>([]),[search,setSearch]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;const load=async()=>{try{const data=await productService.getProducts();if(live){setRows(data);setError('');}}catch(e:any){if(live)setError(e.message);}finally{if(live)setLoading(false);}};load();window.addEventListener('focus',load);return()=>{live=false;window.removeEventListener('focus',load);};},[]);
 const money=(n:number)=>Number(n||0).toLocaleString('vi-VN')+' ₫';
 const openProducts=()=>{window.parent.location.hash='products';};
 return <Layout title="DANH MỤC SẢN PHẨM" onBack={()=>onNavigate('dashboard')} actions={<button className="btn primary" onClick={openProducts}>Quản lý sản phẩm</button>}>
  <div className="p-4 md:p-8 space-y-4">
   <p className="text-sm text-slate-500">Dùng chung danh mục tại Sản phẩm. Tên, giá và tồn kho được cập nhật từ đó.</p>
   <input className="line-input max-w-lg" aria-label="Tìm sản phẩm" placeholder="Tìm tên hoặc SKU…" value={search} onChange={e=>setSearch(e.target.value)}/>
   {error?<p role="alert">{error}</p>:loading?<p>Đang tải sản phẩm…</p>:<div className="overflow-x-auto bg-white rounded-2xl"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr>{['Sản phẩm / SKU','Loại','Giá nhập','Giá bán','Có thể bán','Trạng thái'].map(t=><th className="p-4" key={t}>{t}</th>)}</tr></thead><tbody>{rows.filter(p=>(p.ten_sp+' '+p.sku).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map(p=><tr key={p.productId} className="border-t border-slate-100"><td className="p-4"><strong>{p.ten_sp}</strong><div className="text-xs text-slate-500">{p.sku}</div></td><td className="p-4">{p.productType==='course'?'Khóa học':p.productType==='service'?'Dịch vụ':'Hàng vật lý'}</td><td className="p-4">{money(p.gia_nhap)}</td><td className="p-4">{money(p.gia_ban)}</td><td className="p-4">{p.availableStock===null?'Không giới hạn':p.availableStock}</td><td className="p-4">{p.trang_thai===1?'Đang bán':'Ngừng bán'}</td></tr>)}</tbody></table>{!rows.length&&<p className="p-4">Chưa có sản phẩm.</p>}</div>}
  </div>
 </Layout>;
};
