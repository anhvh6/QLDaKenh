import {all,get,put,db,now} from './store.mjs';
import {reply} from './domain.mjs';
export function trackingMessage(o,s){const money=n=>Number(n||0).toLocaleString('vi-VN')+' đ';return 'Đơn hàng '+o.code+' đã tạo vận đơn '+(s.carrierName||'Viettel Post')+': '+s.tracking+'.\n'+(o.paid>=o.total?'Tiền hàng '+money(o.total)+' đã được thanh toán. Không thu hộ tiền hàng.':'Tiền hàng cần thanh toán: '+money(Math.max(0,o.total-o.paid))+'.')+(o.freeShipping?' Cửa hàng thanh toán phí vận chuyển.':' Khi nhận hàng, khách thanh toán cước vận chuyển '+(Number(s.fee)>0?money(s.fee):'theo mức phí do hãng xác nhận')+' cho đơn vị giao hàng.');}
export function recoverTrackingNotifications(){for(const j of all('tracking_notifications').filter(j=>j.state==='sending'))put('tracking_notifications',{...j,state:'unknown',error:'Máy chủ khởi động lại khi gửi. Kiểm tra hội thoại trước khi gửi lại.'});}
let running=false;
export async function trackingNotificationTick(send=reply){if(running)return;running=true;try{
 for(const o of all('orders').filter(o=>o.trackingNotification?.enabled&&o.conversationId&&!o.deletedAt&&!['cancelled','draft'].includes(o.status))){
  const s=all('shipments').find(s=>s.orderId===o.id&&s.tracking&&s.trackingReady!==false&&s.status!=='cancelled');if(!s)continue;
  const id='tracking:'+o.id+':'+s.tracking;if(get('tracking_notifications',id))continue;
  const c=get('conversations',o.conversationId),ch=c&&get('connections',c.connectionId),u=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(o.trackingNotification.actor);
  if(!c||c.deletedAt||!u?.active||ch?.status!=='connected'||ch.mode!=='api')continue;
  const corrected=all('tracking_notifications').some(n=>n.orderId===o.id&&n.state==='sent'&&n.tracking!==s.tracking),text=(corrected?'Cập nhật chính xác mã vận đơn và cước vận chuyển:\n':'')+trackingMessage(o,s),j=put('tracking_notifications',{id,orderId:o.id,conversationId:c.id,tracking:s.tracking,text,state:'sending',startedAt:now()});
  try{const m=await send(u,c.id,{text,version:c.version});put('tracking_notifications',{...j,state:'sent',messageId:m.id,sentAt:now()});}
  catch(e){put('tracking_notifications',{...j,state:e.unknown?'unknown':'failed',error:e.message});}
 }
 }finally{running=false;}}
