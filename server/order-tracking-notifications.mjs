import {all,get,put,db,now} from './store.mjs';
import {reply} from './domain.mjs';
export function trackingMessage(o,s){const money=n=>Number(n||0).toLocaleString('vi-VN')+' đ';return 'Đơn hàng '+o.code+' đã tạo vận đơn '+(s.carrierName||'Viettel Post')+': '+s.tracking+'.\n'+(o.paid>=o.total?'Tiền hàng '+money(o.total)+' đã được thanh toán. Không thu hộ tiền hàng.':'Tiền hàng cần thanh toán: '+money(Math.max(0,o.total-o.paid))+'.')+(o.freeShipping?' Cửa hàng thanh toán phí vận chuyển.':' Khi nhận hàng, khách thanh toán cước vận chuyển '+(Number(s.fee)>0?money(s.fee):'theo mức phí do hãng xác nhận')+' cho đơn vị giao hàng.');}
export function renderTrackingTemplate(template,o,s){
 if(/#\{(?:PHONE_NUMBER|FULL_ADDRESS|FULL_NAME)\}/.test(template)&&o.trackingNotification?.recipientDetailsConsent!==true)throw Error('Mẫu có thông tin nhận hàng. Cần bật riêng quyền dùng mẫu cho đơn này.');
 const values={PRODUCT_NO_ATTRIBUTE:(o.items||[]).map(i=>i.quantity+' x '+i.name).join(', '),TRACKING_ID:s.tracking,TRACKING_URL:s.trackingUrl,PARTNER_FEE:Number(s.fee)>0?Number(s.fee).toLocaleString('vi-VN')+' đ':undefined,PARTNER_NAME:s.carrierName,FULL_NAME:o.receiverName,PHONE_NUMBER:o.phone,FULL_ADDRESS:o.address,DELIVERY_TEL:s.courier?.phone};
 return template.replace(/#\{([^}]+)\}/g,(_,key)=>{if(!values[key])throw Error('Chưa có dữ liệu '+key+' từ vận đơn; chờ đồng bộ trước khi gửi.');return values[key];});
}
export function recoverTrackingNotifications(){for(const j of all('tracking_notifications').filter(j=>j.state==='sending'))put('tracking_notifications',{...j,state:'unknown',error:'Máy chủ khởi động lại khi gửi. Kiểm tra hội thoại trước khi gửi lại.'});}
let running=false;
export async function trackingNotificationTick(send=reply){if(running)return;running=true;try{
 for(const o of all('orders').filter(o=>o.trackingNotification?.enabled&&o.conversationId&&!o.deletedAt&&!['cancelled','draft'].includes(o.status))){
  const s=all('shipments').find(s=>s.orderId===o.id&&s.tracking&&s.trackingReady!==false&&s.status!=='cancelled');if(!s)continue;
  const id='tracking:'+o.id+':'+s.tracking;if(get('tracking_notifications',id))continue;
  const c=get('conversations',o.conversationId),ch=c&&get('connections',c.connectionId),u=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(o.trackingNotification.actor);
  if(!c||c.deletedAt||!u?.active||ch?.status!=='connected'||ch.mode!=='api')continue;
  const template=get('pos_accounts',o.fulfillmentTarget?.startsWith('pos:')?o.fulfillmentTarget.slice(4):'')?.trackingTemplate?.text;let configured;try{configured=template?renderTrackingTemplate(template,o,s):null;}catch{continue;}
  const corrected=all('tracking_notifications').some(n=>n.orderId===o.id&&n.state==='sent'&&n.tracking!==s.tracking),text=(corrected?'Cập nhật chính xác mã vận đơn và cước vận chuyển:\n':'')+(configured||trackingMessage(o,s)),j=put('tracking_notifications',{id,orderId:o.id,conversationId:c.id,tracking:s.tracking,text,state:'sending',startedAt:now()});
  try{const m=await send(u,c.id,{text,version:c.version});put('tracking_notifications',{...j,state:'sent',messageId:m.id,sentAt:now()});}
  catch(e){put('tracking_notifications',{...j,state:e.unknown?'unknown':'failed',error:e.message});}
 }
 }finally{running=false;}}
