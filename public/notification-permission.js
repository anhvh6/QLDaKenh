export function requestWebNotificationPermission(api=globalThis.Notification){
 if(!api)return Promise.resolve('unsupported');
 if(api.permission==='granted')return Promise.resolve('granted');
 // Invoke immediately from the click; support both callback and Promise browsers.
 return new Promise((resolve,reject)=>{let timer;const done=value=>{clearTimeout(timer);resolve(value||api.permission||'default');};
  timer=setTimeout(()=>done(api.permission),15000);
  try{const result=api.requestPermission(done);if(result?.then)result.then(done,error=>{clearTimeout(timer);reject(error);});else if(typeof result==='string')done(result);}catch(error){clearTimeout(timer);reject(error);}
 });
}
export async function pushPermission(registration){
 try{return await registration.pushManager.permissionState({userVisibleOnly:true});}catch{return 'unknown';}
}
export function permissionHelp(permission){
 return permission==='denied'?'Website đang bị chặn thông báo. Mở quanlydakenh.vercel.app trong trình duyệt đã cài ứng dụng → Cài đặt trang web → Thông báo → Cho phép. Quyền của ứng dụng trong Cài đặt Android là một quyền riêng.':
 'Trình duyệt chưa xác nhận quyền thông báo cho website. Mở quanlydakenh.vercel.app trong Chrome hoặc trình duyệt đã cài ứng dụng → biểu tượng cạnh địa chỉ → Quyền / Cài đặt trang web → Thông báo → Cho phép; sau đó mở lại ứng dụng và nhấn Bật thông báo.';
}
