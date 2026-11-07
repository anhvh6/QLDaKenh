self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{await self.clients.claim();try{for(const name of await caches.keys())if(name.startsWith('hub-assets-')&&name!=='hub-assets-v1')await caches.delete(name);}catch{}})()));
// Private API responses, media, HTML and CSS are deliberately not cached. Only the content-hashed app bundle and boot script
// (URL carries ?v=<hash> that changes with every build) are kept, so a phone launch does not re-download ~900 KB of JavaScript.
const hashedAsset=url=>/^\/(?:app\.bundle|notification-chat-boot)\.js$/.test(url.pathname)&&!!url.searchParams.get('v');
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 let url;try{url=new URL(request.url);}catch{return;}if(url.origin!==self.location.origin||!hashedAsset(url))return;
 event.respondWith((async()=>{
  let cache;try{cache=await caches.open('hub-assets-v1');const hit=await cache.match(request);if(hit)return hit;}catch{}
  const response=await fetch(request);
  if(cache&&response.ok&&response.type==='basic')event.waitUntil((async()=>{try{await cache.put(request,response.clone());for(const old of await cache.keys()){const u=new URL(old.url);if(u.pathname===url.pathname&&u.search!==url.search)await cache.delete(old);}}catch{}})());
  return response;
 })());
});
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 await self.registration.showNotification(payload.title||'Có thông báo mới',{body:payload.body||'Mở ứng dụng để xem nội dung.',icon:'/icons/app-192.png',badge:'/icons/badge-96.png',tag:payload.tag||'hub-notification',renotify:true,silent:payload.silent===true,data:{url:payload.url||'/#inbox'}});
 if(payload.testId&&typeof fetch==='function')try{const session=await (await fetch('/api/bootstrap',{credentials:'same-origin'})).json();if(session.user?.csrf)await fetch('/api/push/receipt',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.user.csrf},body:JSON.stringify({testId:payload.testId})});}catch{}
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
