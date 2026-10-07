import {randomBytes,randomUUID} from 'node:crypto';
const fields=['customer_name','sdt','email','dia_chi','san_pham','gia_tien','trang_thai','ma_vd','note','chewing_status','start_date','end_date','duration_days','video_date','status','sidebar_blocks_json','app_title','app_slogan','require_google_auth','require_device_limit','is_consultation','is_deposit','deposit_amount','is_customized'];
export async function publishPlan(request,customer,tasks=[],options={}){
 const id=customer.customer_id,filter='customer_id=eq.'+encodeURIComponent(id),path='/rest/v1/customers?'+filter;
 const existing=(await request(path+'&select=*'))[0];
 if(existing&&options.expectedUpdatedAt!==existing.updated_at)throw Object.assign(new Error('Phác đồ đã được cập nhật trong QL Phác đồ. Mở lại hồ sơ trước khi lưu.'),{status:409});
 const token=existing?.token||randomBytes(24).toString('hex'),at=new Date(Math.max(Date.now(),Date.parse(existing?.updated_at||0)+1||0)).toISOString();
 const body=Object.fromEntries(fields.filter(k=>customer[k]!==undefined).map(k=>[k,customer[k]]));
 Object.assign(body,{customer_id:id,token,link:'https://phacdo.com/client/'+encodeURIComponent(id)+'?t='+encodeURIComponent(token),updated_at:at,trang_thai_gan:customer.is_customized?'1':'0'});
 for(const k of ['video_date','start_date','end_date'])if(body[k]==='')body[k]=null;
 if(!existing){body.created_at=options.createdAt||at;body.raw_backup={creator_email:options.creatorEmail||''};}
 const oldTasks=await request('/rest/v1/customer_tasks?'+filter+'&select=id');
 const rows=customer.is_customized?tasks.map(t=>({id:randomUUID(),customer_id:id,day:t.day,type:t.type,title:t.title,detail:t.detail||'',link:t.link||'',nhom:t.nhom||'',sort_order:t.sort_order||0,is_deleted:!!t.is_deleted})):[];
 let saved,staged=false;
 try{
  saved=await request(existing?path+'&updated_at=eq.'+encodeURIComponent(existing.updated_at):'/rest/v1/customers',{method:existing?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});
  if(!saved?.length)throw Object.assign(new Error('Phác đồ vừa thay đổi. Mở lại để cập nhật.'),{status:409});
  if(rows.length){await request('/rest/v1/customer_tasks',{method:'POST',body:JSON.stringify(rows)});staged=true;}
  if(oldTasks.length)await request('/rest/v1/customer_tasks?'+filter+'&id=in.('+oldTasks.map(t=>t.id).join(',')+')',{method:'DELETE'});
  return saved[0];
 }catch(error){
  if(saved?.length)try{
   if(staged)await request('/rest/v1/customer_tasks?'+filter+'&id=in.('+rows.map(t=>t.id).join(',')+')',{method:'DELETE'});
   if(existing){const rollback=Object.fromEntries([...fields,'token','link','trang_thai_gan'].filter(k=>existing[k]!==undefined).map(k=>[k,existing[k]]));rollback.updated_at=new Date().toISOString();await request(path+'&updated_at=eq.'+encodeURIComponent(saved[0].updated_at),{method:'PATCH',body:JSON.stringify(rollback)});}
   else await request(path+'&updated_at=eq.'+encodeURIComponent(saved[0].updated_at),{method:'DELETE'});
  }catch{throw Object.assign(new Error('Chưa hoàn tất lưu phác đồ. Tải lại để kiểm tra dữ liệu trước khi thử lại.'),{status:422});}
  throw error;
 }
}
