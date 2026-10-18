self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Private API responses and media are deliberately not cached by the service worker.
self.addEventListener('fetch',()=>{});
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 await self.registration.showNotification(payload.title||'Có thông báo mới',{body:payload.body||'Mở ứng dụng để xem nội dung.',icon:'/icons/app-192.png',badge:'/icons/badge-96.png',tag:payload.tag||'hub-notification',renotify:true,silent:payload.silent===true,data:{url:payload.url||'/#inbox'}});
 if(self.navigator.setAppBadge)await self.navigator.setAppBadge(Math.max(1,Number(payload.badge)||1)).catch(()=>{});
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const target=new URL(event.notification.data?.url||'/#inbox',self.location.origin);if(target.origin!==self.location.origin||target.username||target.password)return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 windows.sort((a,b)=>Number(b.focused)-Number(a.focused));
 for(const client of windows){if(new URL(client.url).origin!==target.origin)continue;
  // Android requires focus while notification-click activation is still available.
  try{await client.focus();}catch{}
  if(typeof MessageChannel!=='undefined'&&client.postMessage){
   const channel=new MessageChannel();const handled=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),800);channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data?.handled===true);};client.postMessage({type:'hub-open-notification',url:target.href},[channel.port2]);}).catch(()=>false);channel.port1.close();if(handled)return;
  }
  try{const opened=await client.navigate(target.href);if(opened){try{await opened.focus();}catch{}return;}}catch{}
 }
 await self.clients.openWindow(target.href);
})());});
