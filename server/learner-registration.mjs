import {createHash,randomBytes} from 'node:crypto';

export const registrationId=customer=>customer.planCustomerId||customer.customer_id||'C-HUB-'+createHash('sha256').update(customer.id).digest('hex').slice(0,20).toUpperCase();
const fields=['customer_name','sdt','email','dia_chi','note','start_date','end_date','duration_days','ma_vd','trang_thai','is_consultation','is_deposit','deposit_amount','san_pham','gia_tien'];
export const hasAssignedPlan=data=>!!(data?.video_date||data?.is_customized);

// Registration shares the Add Student table, but never replaces exercises or security settings.
export async function saveRegistration(request,id,registration,{expectedUpdatedAt,creatorEmail='',customerId=''}={}){
 const path='/rest/v1/customers?customer_id=eq.'+encodeURIComponent(id);
 const existing=(await request(path+'&select=*'))[0];
 const patch=Object.fromEntries(fields.filter(k=>registration[k]!==undefined).map(k=>[k,registration[k]]));
 if(existing&&existing.updated_at!==expectedUpdatedAt){
  // Recover a completed insert whose HTTP response or local transaction was interrupted.
  if(!expectedUpdatedAt&&customerId&&existing.raw_backup?.social_customer_id===customerId&&fields.every(k=>patch[k]===undefined||JSON.stringify(existing[k])===JSON.stringify(patch[k])))return safe(existing);
  throw Object.assign(new Error('Hồ sơ học viên đã thay đổi trong QL Phác đồ. Mở lại trước khi lưu.'),{status:409});
 }
 if(!existing&&expectedUpdatedAt)throw Object.assign(new Error('Học viên không còn trong QL Phác đồ. Mở lại hồ sơ.'),{status:409});
 const at=new Date(Math.max(Date.now(),Date.parse(existing?.updated_at||'')+1||0)).toISOString();
 const body={...patch,updated_at:at};
 if(!existing){const token=randomBytes(24).toString('hex');Object.assign(body,{customer_id:id,created_at:at,status:'ACTIVE',is_customized:false,video_date:null,trang_thai_gan:'0',require_google_auth:true,require_device_limit:true,token,link:'https://phacdo.com/client/'+encodeURIComponent(id)+'?t='+token,raw_backup:{creator_email:creatorEmail,social_customer_id:customerId}});}
 const rows=await request(existing?path+'&updated_at=eq.'+encodeURIComponent(existing.updated_at):'/rest/v1/customers',{method:existing?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});
 if(!rows?.length)throw Object.assign(new Error('Không lưu được học viên. Tải lại hồ sơ trước khi thử lại.'),{status:409});
 return safe(rows[0]);
}
function safe(row){return Object.fromEntries([...fields,'customer_id','status','is_customized','video_date','require_google_auth','require_device_limit','link','updated_at'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));}
