import {posStatusOptions} from '../public/order-status-policy.js';
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
// Read back every write. An uncertain result must be reconciled without resending.
export async function updatePosOrderStatus({input,read,write,commit,journal,directCarrier=false}){
 const remote=await read();if(!remote)fail('Không tìm thấy đơn POS.',404);
 const status=Number(input.status);if(!Number.isInteger(status))fail('Trạng thái không hợp lệ.',422);
 const previous=journal.get();
 if(previous?.state==='unknown'){
  if(Number(remote.status)!==previous.target)fail('Chưa xác minh được lần đổi trạng thái trước. Kiểm tra POS trước khi gửi lại.');
  await commit(remote);journal.set({...previous,state:'done'});
  if(status===previous.target)return {status,reconciled:true};
 }
 if(Number(remote.status)===status){await commit(remote);return {status,unchanged:true};}
 if(input.expectedStatus!==Number(remote.status))fail('Trạng thái đã thay đổi trên POS. Mở lại bảng trạng thái.');
 const option=posStatusOptions(remote,{directCarrier}).find(o=>o.status===status);
 if(!option)fail('Không thể chuyển sang trạng thái này.');if(option.reason)fail(option.reason);
 const operation={state:'sending',from:Number(remote.status),target:status};journal.set(operation);
 let acknowledged=false;
 try{
  await write(status);acknowledged=true;
  const saved=await read();if(!saved||Number(saved.status)!==status)throw Object.assign(Error('POS chưa xác nhận trạng thái mới. Mở lại menu để đối soát; không tự gửi lại.'),{unknown:true});
  await commit(saved);journal.set({...operation,state:'done'});
  const p=saved.partner||{};
  return {status,carrierStatus:p.partner_status||null,carrierPending:status===6&&!!(p.extend_code||p.order_number_vtp)&&p.partner_status!=='canceled'};
 }catch(error){journal.set({...operation,state:acknowledged||error.unknown?'unknown':'failed',error:error.message});throw error;}
}
