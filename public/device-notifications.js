let H,audio;
const key=()=> 'hub-device-notifications-'+H.getS()?.user?.id;
const preferences=()=>{try{return JSON.parse(localStorage.getItem(key())||'{}');}catch{return {};}};
export function initDeviceNotifications(h){H=h;document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-device-notifications]');if(!button)return;
 button.disabled=true;
 try{
  const action=button.dataset.deviceNotifications;
  if(action==='settings'){H.openSettings();return;}
  if(action==='enable'){
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Hãy cài ứng dụng / thêm vào Màn hình chính rồi mở lại để bật thông báo.');
   const allowed=await Notification.requestPermission();if(allowed!=='granted')throw Error('Chưa được cấp quyền. Hãy cho phép thông báo trong cài đặt trình duyệt/thiết bị.');
   const registration=await navigator.serviceWorker.ready,config=await H.api('/push/config');
   let sub=await registration.pushManager.getSubscription();
   if(!sub){const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
   await H.api('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON(),preferences:preferences()}});localStorage.setItem(key()+'-enabled','true');H.toast('Đã bật thông báo trên thiết bị này.');
  }else if(action==='disable'){
   await disableDeviceNotifications();H.toast('Đã tắt thông báo trên thiết bị này.');
  }else if(action==='save'){
   const form=document.querySelector('#device-notification-options'),p=Object.fromEntries(['sound','messages','reminders','handoffs'].map(k=>[k,form.elements[k].checked]));
   const sub='PushManager' in window?await (await navigator.serviceWorker.ready).pushManager.getSubscription():null;
   if(sub&&localStorage.getItem(key()+'-enabled')==='true')await H.api('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON(),preferences:p}});
   localStorage.setItem(key(),JSON.stringify(p));H.toast('Đã lưu tùy chọn cho thiết bị này.');
  }else if(action==='test'){
   if(!('PushManager' in window))throw Error('Thiết bị chưa hỗ trợ thông báo đẩy.');
   const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(!sub)throw Error('Hãy bật thông báo trước.');await H.api('/push/test',{method:'POST',body:{endpoint:sub.endpoint}});H.toast('Đã gửi thông báo thử.');
  }
  renderDeviceSettings();
 }catch(error){H.toast(error.message);}finally{button.disabled=false;}
 });document.addEventListener('pointerdown',()=>{if(!audio&&window.AudioContext){audio=new AudioContext();audio.resume().catch(()=>{});}}, {once:true});}
export async function disableDeviceNotifications(){if(!('PushManager' in window))return;const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(sub){await H.api('/push/unsubscribe',{method:'POST',body:{endpoint:sub.endpoint}});await sub.unsubscribe();}localStorage.removeItem(key()+'-enabled');await navigator.clearAppBadge?.().catch(()=>{});}
export function deviceNotificationsPage(){const p=preferences(),on=localStorage.getItem(key()+'-enabled')==='true'&&globalThis.Notification?.permission==='granted';return `<div class="panel"><div class="panel-body"><h2>Thông báo trên thiết bị này</h2><p>${on?'Đã bật thông báo':'Chưa bật thông báo'}</p><p>Nhận tin nhắn mới, nhắc hẹn và yêu cầu AI chuyển nhân viên khi web đang đóng. Âm thanh, dấu báo trên icon và màn hình khóa phụ thuộc cài đặt thiết bị.</p><div class="row" style="flex-wrap:wrap"><button class="btn primary" data-device-notifications="enable">Bật thông báo</button><button class="btn" data-device-notifications="disable">Tắt trên thiết bị này</button><button class="btn" data-device-notifications="test">Gửi thông báo thử</button></div><form id="device-notification-options">${[['sound','Âm thanh'],['messages','Tin nhắn khách hàng mới'],['reminders','Nhắc việc và lịch hẹn'],['handoffs','AI chuyển nhân viên / yêu cầu xử lý']].map(([k,label])=>`<label style="display:flex;gap:8px;margin:16px 0"><input type="checkbox" name="${k}" ${p[k]!==false?'checked':''}>${label}</label>`).join('')}<button type="button" class="btn primary" data-device-notifications="save">Lưu tùy chọn</button></form><p>Thông báo ngoài ứng dụng chỉ hiển thị nội dung chung. Mở ứng dụng để xem chi tiết.</p><p>iPhone/iPad: mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính, mở ứng dụng từ icon rồi bật thông báo. Trong Cài đặt thiết bị → Thông báo, bật Âm thanh, Biểu tượng và Màn hình khóa theo nhu cầu.</p></div></div>`;}
function renderDeviceSettings(){const form=document.querySelector('#device-notification-options');if(form)form.closest('.panel').outerHTML=deviceNotificationsPage();}
export function updateDeviceBadge(count){if(localStorage.getItem(key()+'-enabled')==='true')Promise.resolve(count?navigator.setAppBadge?.(count):navigator.clearAppBadge?.()).catch(()=>{});}
export function notificationSound(){if(preferences().sound===false||localStorage.getItem(key()+'-enabled')==='true'||document.visibilityState!=='visible'||!audio)return;const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=660;gain.gain.setValueAtTime(.08,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.18);oscillator.start();oscillator.stop(audio.currentTime+.18);}
