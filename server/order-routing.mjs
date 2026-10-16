import {all,get,put} from './store.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function orderRoutingState(){
 const targets=[...all('shipping_accounts').filter(a=>a.active&&a.status==='connected').map(a=>({id:'vtp:'+a.id,type:'vtp',accountId:a.id,name:'Viettel Post · '+a.name,warehouse:a.sender?.name||'',preferred:a.isDefault})),...all('pos_accounts').filter(a=>a.active&&a.status==='connected'&&a.warehouseId).map(a=>({id:'pos:'+a.id,type:'pos',accountId:a.id,name:'Pancake POS · '+(a.shopName||a.name),warehouse:a.warehouseName||a.warehouseId}))];
 const config=get('settings','order-routing');return {version:config?.version||0,defaultTarget:config?.defaultTarget||targets.find(t=>t.preferred)?.id||targets[0]?.id||'',targets};
}
export function validateOrderTarget(target){if(!target)return '';if(!orderRoutingState().targets.some(t=>t.id===target))fail('Kết nối xử lý đơn hàng không còn hoạt động. Chọn lại kết nối.',409);return target;}
export function saveOrderRouting(user,input){if(user.role!=='owner')fail('Chỉ chủ hệ thống được đặt nơi xử lý đơn mặc định.',403);return put('settings',{id:'order-routing',defaultTarget:validateOrderTarget(String(input.defaultTarget||''))},get('settings','order-routing')?input.version:undefined);}
