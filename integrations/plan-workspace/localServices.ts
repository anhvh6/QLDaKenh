export let context: any = null;
let csrf = '';
export const handoffId = new URLSearchParams(location.search).get('handoff') || '';
export async function call(action: string, body?: any) {
 const res = await fetch('/api/plans/' + encodeURIComponent(handoffId) + '/' + action, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'Content-Type':'application/json', 'X-CSRF-Token':csrf, ...(body?{'Idempotency-Key':crypto.randomUUID()}: {}) }, body: body ? JSON.stringify(body) : undefined });
 const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Không thể tải phác đồ'); return data;
}
export async function initialize() {const b=await fetch('/api/bootstrap').then(r=>r.json());if(!b.user)throw new Error('Đăng nhập workspace trước khi mở phác đồ.');csrf=b.user.csrf;context=await call('editor');return context;}
export async function saveCustomer(customer: any,tasks: any[]=[]) {const result=await call('save',{customer,tasks,version:context.version});context.version=result.planVersion;context.customer=result;context.tasks=tasks;window.parent.postMessage({type:'taophacdo:plan-saved',handoffId},location.origin);return result;}
export const api={
 getPlanEditorData:async()=>{context=await call('editor');return {...context,template:null,templateTasks:[]};},
 getPlan:async(_id: string,date:string,group?:string)=>call('master?date='+encodeURIComponent(date||'')+'&group='+encodeURIComponent(group||'')),
 getCustomers:async()=>context?[context.customer]:[],
 upsertCustomer:async()=>{throw new Error('Dùng nút Lưu của phác đồ. Không xóa/khôi phục hồ sơ gốc ở bước đồng bộ luồng.');}
};
export const customPlanService={getCustomPlan:async()=>context?.tasks||[]};
export const customerService={getDevices:async()=>[],updateDevice:async()=>{throw new Error('Thiết bị tiếp tục được quản lý ở taophacdo gốc.');},deleteDevice:async()=>{throw new Error('Thiết bị tiếp tục được quản lý ở taophacdo gốc.');}};
export const generateCustomerLink=()=>location.origin+'/#phacdo';
