self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Private API responses and media are deliberately not cached by the service worker.
self.addEventListener('fetch',()=>{});
