import {SUPABASE_URL} from './store.mjs';
export async function readLegacyAccessSource(headers,fetcher=fetch){
 if(process.env.PLAN_REMOTE_CATALOG==='0')return {};
 const tables=['roles?select=name,display_name','permissions?select=code,display_name','role_permissions?select=role_name,permission_code','admin_users?select=id,email,role'];
 const rows=await Promise.all(tables.map(async query=>{const r=await fetcher(SUPABASE_URL+'/rest/v1/'+query,{headers,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Object.assign(Error('Chưa đọc được phân quyền phác đồ. Cấu hình hiện có được giữ nguyên; hãy thử lại.'),{status:503});const data=await r.json();if(!Array.isArray(data))throw Object.assign(Error('Nguồn quyền chưa trả danh sách hợp lệ.'),{status:503});return data;}));
 return {roles:rows[0],permissions:rows[1],mappings:rows[2],users:rows[3]};
}
