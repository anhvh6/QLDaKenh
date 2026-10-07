export let context: any = null;
import {DEFAULT_CHEWING_INSTRUCTION,DEFAULT_SIDEBAR_BLOCKS} from '../constants';
function hydrate(data:any){if(!data.version){const c=data.customer;c.chewing_status=c.chewing_status||DEFAULT_CHEWING_INSTRUCTION;if(!c.sidebar_blocks_json?.length)c.sidebar_blocks_json=structuredClone(DEFAULT_SIDEBAR_BLOCKS);if(!c.san_pham?.length){const p=data.products.find((p:any)=>p.id_sp==='SP1768731546380')||data.products.find((p:any)=>p.productType==='course'||/khóa học|khoá học/i.test(p.ten_sp));if(p){c.san_pham=[{id_sp:p.id_sp,ten_sp:p.ten_sp,so_luong:1,don_gia:p.gia_ban,gia_nhap:p.gia_nhap,thanh_tien:p.gia_ban}];c.gia_tien=p.gia_ban;}}}return data;}
let csrf = '';
export const handoffId = new URLSearchParams(location.search).get('handoff') || '';
export async function call(action: string, body?: any) {
 const res = await fetch('/api/plans/' + encodeURIComponent(handoffId) + '/' + action, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'Content-Type':'application/json', 'X-CSRF-Token':csrf, ...(body?{'Idempotency-Key':crypto.randomUUID()}: {}) }, body: body ? JSON.stringify(body) : undefined });
 const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Không thể tải phác đồ'); return data;
}
export async function initialize() {const b=await fetch('/api/bootstrap').then(r=>r.json());if(!b.user)throw new Error('Đăng nhập workspace trước khi mở phác đồ.');csrf=b.user.csrf;context=hydrate(await call('editor'));return context;}
export async function saveCustomer(customer: any,tasks: any[]=[]) {const result=await call('save',{customer,tasks,version:context.version});context.version=result.planVersion;context.customer=result;context.tasks=tasks;window.parent.postMessage({type:'taophacdo:plan-saved',handoffId},location.origin);return result;}
export const api={
 getPlanEditorData:async()=>({...context,template:null,templateTasks:[]}),
 getPlan:async(_id: string,date:string,group?:string)=>call('master?date='+encodeURIComponent(date||'')+'&group='+encodeURIComponent(group||'')),
 getCustomers:async()=>call('sources'),
 getCopySource:async(id:string)=>call('source?id='+encodeURIComponent(id)),
 upsertCustomer:async()=>{throw new Error('Dùng nút Lưu của phác đồ. Không xóa/khôi phục hồ sơ gốc ở bước đồng bộ luồng.');}
};
export const customPlanService={getCustomPlan:async()=>context?.tasks||[]};
export const customerService={getDevices:async()=>[],updateDevice:async()=>{throw new Error('Thiết bị tiếp tục được quản lý ở taophacdo gốc.');},deleteDevice:async()=>{throw new Error('Thiết bị tiếp tục được quản lý ở taophacdo gốc.');}};
export const generateCustomerLink=()=>location.origin+'/#phacdo';
