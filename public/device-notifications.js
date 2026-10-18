import {requestWebNotificationPermission,pushPermission,permissionHelp} from './notification-permission.js';
let H,audio,syncing=false,lastSync=0,lastUser='',connectionStatus=null,permissionInfo='';
const escapeStatus=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=()=> 'hub-device-notifications-'+H.getS()?.user?.id;
const workerReady=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chưa kết nối được dịch vụ thông báo. Hãy tải lại trang rồi thử lại.')),12000);navigator.serviceWorker.ready.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const preferences=()=>{try{return JSON.parse(localStorage.getItem(key())||'{}');}catch{return {};}};
async function ensureSubscription(registration,force=false){
 const config=await H.api('/push/config'),raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),publicKey=Uint8Array.from(raw,c=>c.charCodeAt(0));
 let sub=await registration.pushManager.getSubscription();const previous=sub?.options?.applicationServerKey;
 if(sub&&(force||previous&&Array.from(new Uint8Array(previous)).join(',')!==Array.from(publicKey).join(','))){await sub.unsubscribe();sub=null;}
 return sub||registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
}
async function inspectDevicePermission(registration){
 const push=await pushPermission(registration);let browser='unknown';try{browser=(await navigator.permissions.query({name:'notifications'})).state;}catch{}
 const web=globalThis.Notification?.permission||'unsupported';
 const info={web,push,browser,platform:/Android/i.test(navigator.userAgent||'')?'Android':/iPhone|iPad/i.test(navigator.userAgent||'')?'Apple':'other',standalone:globalThis.matchMedia?.('(display-mode: standalone)')?.matches===true||navigator.standalone===true};
 let id=localStorage.getItem(key()+'-device-id');if(!id){id=globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem(key()+'-device-id',id);}
 let code='';try{code=(await H.api('/push/diagnostics',{method:'POST',body:{...info,deviceId:id,build:'20261018-mobile-2'}})).code||'';}catch{}
 permissionInfo='Notification: '+web+' · Permissions API: '+browser+' · Push: '+push+(code?' · Mã kiểm tra: '+code:'');return push;
}
async function registerDevice(registration){
 let sub=await ensureSubscription(registration);
 const status=await H.api('/push/status',{method:'POST',body:{endpoint:sub.endpoint}});if(status.needsRenewal)sub=await ensureSubscription(registration,true);
 const result=await H.api('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON(),preferences:preferences()}});
 localStorage.setItem(key()+'-enabled','true');localStorage.removeItem(key()+'-disabled');connectionStatus={...result,registered:true};return sub;
}
async function testDevice(registration){
 const sub=await registerDevice(registration);let result;try{result=await H.api('/push/test',{method:'POST',body:{endpoint:sub.endpoint}});}catch(error){connectionStatus=await H.api('/push/status',{method:'POST',body:{endpoint:sub.endpoint}}).catch(()=>({registered:false}));throw error;}
 connectionStatus={...result,registered:true};H.toast('Dịch vụ Push đã nhận yêu cầu thử. Đang chờ thiết bị xác nhận hiển thị.');
}
export function initDeviceNotifications(h){H=h;document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-device-notifications]');if(!button)return;
 button.disabled=true;
 try{
  const action=button.dataset.deviceNotifications;
  if(action==='settings'){H.openSettings();return;}
  if(action==='enable'){
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Hãy cài ứng dụng / thêm vào Màn hình chính rồi mở lại để bật thông báo.');
   const allowed=await requestWebNotificationPermission();
   const registration=await workerReady(),push=await inspectDevicePermission(registration);
   if(allowed!=='granted'&&!(allowed!=='denied'&&push==='granted')){connectionStatus={registered:false,error:permissionHelp(allowed)};throw Error(connectionStatus.error);}
   await testDevice(registration);
  }else if(action==='disable'){
   await disableDeviceNotifications();H.toast('Đã tắt thông báo trên thiết bị này.');
  }else if(action==='save'){
   const form=document.querySelector('#device-notification-options'),p=Object.fromEntries(['sound','preview','messages','reminders','handoffs'].map(k=>[k,form.elements[k].checked]));
   const sub='PushManager' in window?await (await navigator.serviceWorker.ready).pushManager.getSubscription():null;
   if(sub&&localStorage.getItem(key()+'-enabled')==='true')await H.api('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON(),preferences:p}});
   localStorage.setItem(key(),JSON.stringify(p));H.toast('Đã lưu tùy chọn cho thiết bị này.');
  }else if(action==='test'){
   if(!('PushManager' in window))throw Error('Thiết bị chưa hỗ trợ thông báo đẩy.');
   const registration=await workerReady(),push=await inspectDevicePermission(registration);if(Notification.permission==='denied'||Notification.permission!=='granted'&&push!=='granted')throw Error(permissionHelp(Notification.permission));await testDevice(registration);
  }
  await syncDeviceNotifications(true);renderDeviceSettings();
 }catch(error){connectionStatus={...connectionStatus,error:error.message};renderDeviceSettings();H.toast(error.message);}finally{button.disabled=false;}
 });document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncDeviceNotifications(true).catch(()=>{});});document.addEventListener('pointerdown',()=>{if(!audio&&window.AudioContext){audio=new AudioContext();audio.resume().catch(()=>{});}}, {once:true});}
export async function disableDeviceNotifications(){localStorage.setItem(key()+'-disabled','true');localStorage.removeItem(key()+'-enabled');connectionStatus={registered:false};if(!('PushManager' in window))return;const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(sub){await H.api('/push/unsubscribe',{method:'POST',body:{endpoint:sub.endpoint}});await sub.unsubscribe();}await navigator.clearAppBadge?.().catch(()=>{});}
export function deviceNotificationsPage(){const p=preferences(),on=connectionStatus?.registered===true&&localStorage.getItem(key()+'-enabled')==='true';return `<div class="panel"><div class="panel-body"><h2>Thông báo trên thiết bị này</h2><p data-device-notification-state>${on?'Đã bật thông báo':'Chưa bật thông báo'}</p><p>Nhận tin nhắn, bình luận mới, nhắc hẹn và yêu cầu AI chuyển nhân viên khi web đang đóng. Âm thanh, dấu báo trên icon và màn hình khóa phụ thuộc cài đặt thiết bị.</p><div class="row" style="flex-wrap:wrap"><button class="btn primary" data-device-notifications="enable">Bật thông báo</button><button class="btn" data-device-notifications="disable">Tắt trên thiết bị này</button><button class="btn" data-device-notifications="test">Gửi thông báo thử</button></div><form id="device-notification-options">${[['sound','Âm thanh'],['preview','Hiện tên khách và nội dung tin nhắn trên màn hình khóa'],['messages','Tin nhắn và bình luận khách hàng mới'],['reminders','Nhắc việc và lịch hẹn'],['handoffs','AI chuyển nhân viên / yêu cầu xử lý']].map(([k,label])=>`<label style="display:flex;gap:8px;margin:16px 0"><input type="checkbox" name="${k}" ${p[k]!==false?'checked':''}>${label}</label>`).join('')}<button type="button" class="btn primary" data-device-notifications="save">Lưu tùy chọn</button></form><p id="device-push-status">${escapeStatus(pushStatusText())}</p><p>${escapeStatus(permissionInfo)}</p><p>Tắt tùy chọn hiện nội dung nếu muốn thông báo chung trên màn hình khóa.</p><p>iPhone/iPad: mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính, mở ứng dụng từ icon rồi bật thông báo. Trong Cài đặt thiết bị → Thông báo, bật Âm thanh, Biểu tượng và Màn hình khóa theo nhu cầu.</p></div></div>`;}
function renderDeviceSettings(){const form=document.querySelector('#device-notification-options');if(form)form.closest('.panel').outerHTML=deviceNotificationsPage();}
export function updateDeviceBadge(count){syncDeviceNotifications().catch(()=>{});if(localStorage.getItem(key()+'-enabled')==='true')Promise.resolve(count?navigator.setAppBadge?.(count):navigator.clearAppBadge?.()).catch(()=>{});}
export function deviceNotificationPrompt(){return connectionStatus?.registered===true&&localStorage.getItem(key()+'-enabled')==='true'?'':'<button class="btn" style="font-size:11px;padding:6px" data-device-notifications="enable" title="Bật thông báo trên thiết bị này">Bật thông báo</button>';}
export async function syncDeviceNotifications(force=false){
 const user=H.getS()?.user?.id;if(!user||syncing||(!force&&user===lastUser&&Date.now()-lastSync<60000))return;
 syncing=true;lastSync=Date.now();if(user!==lastUser)connectionStatus=null;lastUser=user;
 try{
  if(localStorage.getItem(key()+'-disabled')==='true'||!('PushManager' in window)){connectionStatus={registered:false};return;}
  const permission=globalThis.Notification?.permission,registration=await workerReady(),push=await pushPermission(registration);
  if(permission==='denied'||permission!=='granted'&&push!=='granted'){connectionStatus={registered:false,error:permissionHelp(permission)};return;}
  let sub=await registration.pushManager.getSubscription();
  if(!sub&&localStorage.getItem(key()+'-enabled')!=='true'){connectionStatus={registered:false};return;}
  sub=await ensureSubscription(registration);
  let status=await H.api('/push/status',{method:'POST',body:{endpoint:sub.endpoint}});if(H.getS()?.user?.id!==user)return;
  if(!status.registered){if(status.needsRenewal)sub=await ensureSubscription(registration,true);const result=await H.api('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON(),preferences:preferences()}});status={...result,registered:true};}
  connectionStatus=status;localStorage.setItem(key()+'-enabled','true');
 }catch(error){connectionStatus={registered:false,error:error.message};}finally{syncing=false;const node=document.querySelector('#device-push-status');if(node)node.textContent=pushStatusText();const state=document.querySelector('[data-device-notification-state]');if(state)state.textContent=connectionStatus?.registered?'Đã bật thông báo':'Chưa bật thông báo';}
}
function pushStatusText(){const device=connectionStatus?.deviceId?' · Mã thiết bị: '+connectionStatus.deviceId+' · '+connectionStatus.pushService:'';const receipt=connectionStatus?.lastTestDisplayedAt?' · Thiết bị đã xác nhận xử lý hiển thị tin thử lúc '+new Date(connectionStatus.lastTestDisplayedAt).toLocaleString('vi-VN'):connectionStatus?.lastTestAcceptedAt?' · Dịch vụ Push đã nhận tin thử, chưa có xác nhận hiển thị từ thiết bị.':'';if(connectionStatus?.error)return connectionStatus.error;return connectionStatus?.registered?'Thiết bị đã đăng ký với máy chủ'+device+receipt+(connectionStatus.lastDeliveredAt?' · Lần gửi thành công: '+new Date(connectionStatus.lastDeliveredAt).toLocaleString('vi-VN'):''):'Thiết bị chưa đăng ký với máy chủ. Nhấn Bật thông báo và cấp quyền để nhận tin.';}
export function notificationSound(){if(preferences().sound===false||document.visibilityState!=='visible'||!audio)return;audio.resume().catch(()=>{});const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=660;gain.gain.setValueAtTime(.08,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.18);oscillator.start();oscillator.stop(audio.currentTime+.18);}
