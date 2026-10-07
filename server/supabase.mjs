import { all,get,put,transaction,audit,now,secret,saveSecret,getSupabaseHeaders,SUPABASE_URL,SUPABASE_KEY } from './store.mjs';
import { fail,required } from './domain.mjs';

// Explicit projections exclude learner tokens, device credentials and clinical notes.
export const projections={
 customers:'id,customer_id,customer_name,sdt,email,dia_chi,san_pham,gia_tien,trang_thai_gan,trang_thai,ma_vd,start_date,end_date,duration_days,video_date,status,is_customized,created_at,updated_at',
 products:'id,id_sp,ten_sp,gia_nhap,gia_ban,trang_thai,created_at,updated_at',
 courses:'id,name,description,fee,duration,status,created_at',
 master_video_tasks:'id,video_date,day,type,title,detail,nhom,sort_order',
 customer_tasks:'id,customer_id,day,type,title,detail,nhom,is_deleted,sort_order',
 attendance_logs:'id,customer_id,access_date,created_at'
};
export function mapRow(table,row,prev={}){
 const projected=Object.fromEntries(projections[table].split(',').filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
 if(!row.id)fail('Thiếu khóa chính từ '+table);const base={...prev,...projected,id:row.id,origin:'taophacdo',remoteUpdatedAt:row.updated_at||null};
 if(table==='customers'){if(!row.customer_id)fail('customers.customer_id không được trống.');base.san_pham=(Array.isArray(row.san_pham)?row.san_pham:[]).map(p=>Object.fromEntries(['id_sp','ten_sp','so_luong','don_gia','gia_nhap','thanh_tien'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])));return {...base,name:row.customer_name||row.customer_id,phone:row.sdt||'',email:row.email||'',address:row.dia_chi||'',tags:prev.tags||[],consent:prev.consent===true};}
 if(table==='products')return {...base,name:row.ten_sp,sku:row.id_sp,price:Number(row.gia_ban||0),cost:Number(row.gia_nhap||0),stock:prev.stock||0,reserved:prev.reserved||0,weight:prev.weight||500,productType:prev.productType||'physical',active:row.trang_thai===1};
 return base;
}
function config(user){
  const h = getSupabaseHeaders();
  return { url: SUPABASE_URL, key: SUPABASE_KEY, accessToken: h.Authorization.split(' ')[1] };
}
async function remote(c,path,options={}){const r=await fetch(c.url+path,{...options,headers:{apikey:c.key,...(c.accessToken?{Authorization:'Bearer '+c.accessToken}:{}),'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(20000)});const data=await r.json().catch(()=>null);if(!r.ok)fail(r.status===401?'Phiên Supabase hết hạn. Đăng nhập lại.':`Supabase từ chối (${r.status}). Kiểm tra schema và quyền RLS của tài khoản.`,r.status===401?400:422);return data;}
let planCatalogCache=null,planCatalogPending=null;
export async function readPlanCatalog(){
 const localProducts=all('products').filter(p=>p.active!==false).map(p=>({id_sp:p.id_sp||p.sku,ten_sp:p.name,gia_ban:p.price,gia_nhap:p.cost,trang_thai:1,productType:p.productType})),localTasks=all('master_video_tasks').filter(t=>!t.is_deleted);
 if(process.env.PLAN_REMOTE_CATALOG==='0')return {products:localProducts,tasks:localTasks};
 if(planCatalogCache&&Date.now()-planCatalogCache.at<60000)return planCatalogCache.data;
 if(planCatalogPending)return planCatalogPending;
 planCatalogPending=(async()=>{try{const c=config();async function rows(table){const out=[];for(let offset=0;offset<20000;){const batch=await remote(c,`/rest/v1/${table}?select=*&order=id.asc&offset=${offset}&limit=500`);if(!Array.isArray(batch))fail('Danh mục phác đồ không hợp lệ.');out.push(...batch);offset+=batch.length;if(batch.length<500)return out;}fail('Danh mục quá lớn, cần phân trang thêm.');}
 const [products,tasks]=await Promise.all([rows('products'),rows('master_video_tasks')]);
 const mappedProducts=products.filter(p=>Number(p.trang_thai)===1).map(p=>({id_sp:p.id_sp,ten_sp:p.ten_sp,gia_ban:Number(p.gia_ban||0),gia_nhap:Number(p.gia_nhap||0),trang_thai:1,productType:p.productType||p.product_type}));
 const mappedTasks=tasks.filter(t=>!t.is_deleted).map(t=>({id:t.id,video_date:t.video_date||t.Video_date,day:Number(String(t.day??t.Day??t.N??0).match(/\d+/)?.[0]||0),title:t.title||t.Title||'',detail:t.detail||t.Detail||'',type:t.type||t.Type||'Bài bắt buộc',link:t.link||t.Link||'',nhom:t.nhom||t.Nhom||'',sort_order:Number(t.sort_order||0)}));
 const data={products:[...new Map([...localProducts,...mappedProducts].map(p=>[p.id_sp,p])).values()],tasks:[...new Map([...localTasks,...mappedTasks].map(t=>[t.id,t])).values()]};planCatalogCache={at:Date.now(),data};return data;
 }catch(err){return {products:localProducts,tasks:localTasks,warning:'Chưa tải được danh mục phác đồ từ Supabase: '+err.message+'. Đang hiển thị dữ liệu nội bộ; tải lại để thử lại.'};}finally{planCatalogPending=null;}})();return planCatalogPending;
}
export async function readPlanProfile(customerId){if(process.env.PLAN_REMOTE_CATALOG==='0')return null;const rows=await remote(config(),'/rest/v1/customers?select=note,chewing_status,sidebar_blocks_json,app_title,app_slogan&customer_id=eq.'+encodeURIComponent(customerId)+'&limit=1');return rows[0]||null;}
// Learner links are returned only by the scoped profile route, never the global state.
const learnerColumns='customer_id,customer_name,sdt,email,dia_chi,start_date,end_date,duration_days,require_google_auth,require_device_limit,link,updated_at,san_pham,gia_tien,is_customized,video_date,ma_vd,status';
export async function readLearner(customerId){if(process.env.PLAN_REMOTE_CATALOG==='0')return null;return (await remote(config(),'/rest/v1/customers?select='+learnerColumns+'&customer_id=eq.'+encodeURIComponent(customerId)+'&limit=1'))[0]||null;}
export async function writeLearner(customerId,updatedAt,patch){if(!updatedAt)fail('Hồ sơ nguồn chưa có phiên bản cập nhật.',409);const allowed=['sdt','email','dia_chi','start_date','end_date','duration_days','require_google_auth','require_device_limit','san_pham','gia_tien','is_customized','video_date','ma_vd'];const body=Object.fromEntries(Object.entries(patch).filter(([k])=>allowed.includes(k)));body.updated_at=now();const rows=await remote(config(),'/rest/v1/customers?select='+learnerColumns+'&customer_id=eq.'+encodeURIComponent(customerId)+'&updated_at=eq.'+encodeURIComponent(updatedAt),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});if(!rows?.length)fail('Phác đồ đã thay đổi. Mở lại hồ sơ để cập nhật.',409);return rows[0];}
export async function readLearnerActivity(customerId,custom=false){if(process.env.PLAN_REMOTE_CATALOG==='0')return {attendance:[],tasks:[]};async function rows(table,columns){const out=[];for(let offset=0;offset<20000;offset+=500){const batch=await remote(config(),'/rest/v1/'+table+'?select='+columns+'&customer_id=eq.'+encodeURIComponent(customerId)+'&order=id.asc&offset='+offset+'&limit=500');out.push(...batch);if(batch.length<500)return out;}fail('Lịch sử quá lớn.');}const [attendance,tasks]=await Promise.all([rows('attendance_logs','id,access_date,created_at'),custom?rows('customer_tasks','id,day,type,title,detail,link,nhom,sort_order,is_deleted'):[]]);return {attendance,tasks};}
export function integrationState(user){return {configured:true,url:SUPABASE_URL,email:'anhvh@gmail.com',mode:'read_only_import',lastRun:all('sync_runs')[0]||null};}
export async function supabaseRoute(path,method,input,user){if(!path.startsWith('/api/taophacdo'))return undefined;if(user.role!=='owner')fail('Tích hợp dữ liệu chỉ dành cho chủ hệ thống.',403);
 if(path==='/api/taophacdo/connect'&&method==='POST'){
  let url;try{url=new URL(input.url);}catch{fail('URL Supabase không hợp lệ.');}if(url.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(url.hostname)||url.username||url.password||url.port)fail('Dùng URL dự án https://<project>.supabase.co.');
  const key=required(input.key,'Publishable / anon key',4000);if(key.startsWith('sb_secret_'))fail('Không dùng secret/service-role key.');if(key.startsWith('ey')){try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')fail('Chỉ nhận anon key.');}catch{fail('Anon key không hợp lệ.');}}
  if(!key.startsWith('sb_publishable_')&&!key.startsWith('ey'))fail('Dùng publishable hoặc legacy anon key.');
  const email=required(input.email,'Email',200);const c={url:url.origin,key,accessToken:''};const auth=await remote(c,'/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:required(input.password,'Mật khẩu',1000)})});c.accessToken=auth.access_token;
  const admins=await remote(c,'/rest/v1/admin_users?select=id,role,email&id=eq.'+encodeURIComponent(auth.user.id));if(!admins?.length||admins[0].role!=='super_admin')fail('Dùng tài khoản super_admin của taophacdo để nhập dữ liệu khách hàng về máy này. Quyền thực tế vẫn do RLS quyết định.',403);
  saveSecret('supabase:'+user.id,{...c,email,userId:auth.user.id,expiresAt:Date.now()+auth.expires_in*1000});audit(user.id,'supabase_connected');return {ok:true,mode:'read_only_import'};
 }
 if(path==='/api/taophacdo/disconnect'&&method==='POST'){saveSecret('supabase:'+user.id,{});return {ok:true};}
 if(path==='/api/taophacdo/preflight'&&method==='POST'){const c=config(user);const results=[];for(const [table,columns] of Object.entries(projections)){try{const rows=await remote(c,`/rest/v1/${table}?select=${columns}&limit=1`);results.push({table,ok:true,visibleSample:rows.length,note:rows.length?'Đọc được theo RLS':'Không có dòng nhìn thấy; chưa thể kết luận bảng trống hay bị RLS lọc'});}catch(e){results.push({table,ok:false,error:e.message});}}return {results,note:'Kiểm tra đọc và tên cột; không chứng minh chính sách RLS đầy đủ. Không sửa CSDL.'};}
 if(path==='/api/taophacdo/preview'&&method==='POST'){const c=config(user);const table=input.table;if(!projections[table])fail('Bảng không được phép.');let rows=[];for(let offset=0;offset<10000;){const batch=await remote(c,`/rest/v1/${table}?select=${projections[table]}&order=id.asc&offset=${offset}&limit=500`);if(!Array.isArray(batch))fail('Phản hồi bảng không hợp lệ.');rows.push(...batch);offset+=batch.length;if(!batch.length)break;if(offset>=10000)fail('Bảng vượt giới hạn nhập 10.000 dòng. Cần chia lô bằng công cụ migration.');}
  // Snapshot is encrypted and bound to the requesting local owner. No remote writes.
  saveSecret('supabase-preview:'+user.id,{table,rows,at:now()});return {table,count:rows.length,newCount:rows.filter(r=>!get(table,r.id)).length,updateCount:rows.filter(r=>get(table,r.id)).length,sample:rows.slice(0,5).map(r=>({id:r.id,name:r.customer_name||r.ten_sp||r.name||r.title||r.customer_id})),note:'Chỉ cập nhật bản sao localhost. Không xóa dòng cũ, không sửa Supabase.'};
 }
 if(path==='/api/taophacdo/import'&&method==='POST'){const preview=secret('supabase-preview:'+user.id);if(!preview.table||Date.now()-Date.parse(preview.at)>600000)fail('Xem trước lại dữ liệu (hết hạn sau 10 phút).');const result=importRows(user,preview.table,preview.rows);saveSecret('supabase-preview:'+user.id,{});return result;}
 if(path==='/api/taophacdo/import-json'&&method==='POST'){if(!projections[input.table]||!Array.isArray(input.rows)||input.rows.length>10000)fail('File phải có table và rows (tối đa 10.000 dòng).');if(input.preview!==false)return {table:input.table,count:input.rows.length,validated:input.rows.map(r=>mapRow(input.table,r)).length};return importRows(user,input.table,input.rows);}
 return undefined;
}
export function importRows(user,table,rows){return transaction(()=>{let imported=0;for(const row of rows){const prev=get(table,row.id);if(prev&&prev.origin!=='taophacdo')fail('Xung đột ID với dữ liệu localhost.');put(table,mapRow(table,row,prev||{}));imported++;if(table==='courses'){const id='course-product-'+row.id;const p=get('products',id);put('products',{...p,id,courseId:row.id,id_sp:'COURSE:'+row.id,sku:'COURSE:'+row.id,name:row.name,price:Number(row.fee||0),cost:0,stock:0,reserved:0,weight:0,productType:'course',active:row.status===1,origin:'taophacdo_course'});}}const run=put('sync_runs',{table,count:imported,mode:'read_only_import',actor:user.id});audit(user.id,'taophacdo_import',table,{count:imported});return run;});}
