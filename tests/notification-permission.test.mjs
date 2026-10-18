import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWebNotificationPermission,pushPermission,permissionHelp} from '../public/notification-permission.js';

test('permission request supports Promise, legacy callback and already granted browsers',async()=>{
 assert.equal(await requestWebNotificationPermission({permission:'default',requestPermission:async()=> 'granted'}),'granted');
 assert.equal(await requestWebNotificationPermission({permission:'default',requestPermission:callback=>{queueMicrotask(()=>callback('granted'));}}),'granted');
 assert.equal(await requestWebNotificationPermission({permission:'granted',requestPermission:()=>{throw Error('must not request twice');}}),'granted');
 assert.equal(await requestWebNotificationPermission({permission:'default',requestPermission:async()=> 'default'}),'default');
 assert.match(permissionHelp('denied'),/Website đang bị chặn/);
 assert.match(permissionHelp('default'),/Trình duyệt chưa xác nhận/);
});

test('Push permission is checked separately and unsupported permissionState stays unknown',async()=>{
 assert.equal(await pushPermission({pushManager:{permissionState:async()=> 'granted'}}),'granted');
 assert.equal(await pushPermission({pushManager:{}}),'unknown');
});

test('enabled mobile device recovers a missing subscription without requesting permission again',async()=>{
 const storage=new Map([['hub-device-notifications-mobile-enabled','true']]);
 globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 globalThis.window={PushManager:function(){}};
 globalThis.Notification={permission:'granted'};
 const listeners={};globalThis.document={addEventListener:(k,v)=>listeners[k]=v,querySelector:()=>null};
 let subscribed=0,registered=0;const sub={endpoint:'https://fcm.googleapis.com/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/test'})};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{ready:Promise.resolve({pushManager:{permissionState:async()=> 'granted',getSubscription:async()=>null,subscribe:async()=>{subscribed++;return sub;}}})}}});
 const module=await import('../public/device-notifications.js?mobile-test');
 module.initDeviceNotifications({getS:()=>({user:{id:'mobile'}}),api:async path=>{if(path==='/push/config')return {publicKey:'AQ'};if(path==='/push/status')return {registered:false};if(path==='/push/subscribe'){registered++;return {ok:true};}throw Error(path);}});
 await module.syncDeviceNotifications(true);assert.equal(subscribed,1);assert.equal(registered,1);assert.match(module.deviceNotificationsPage(),/Đã bật thông báo/);
 Notification.permission='default';await module.syncDeviceNotifications(true);assert.equal(registered,2,'Push grant can remain valid when Notification API is stale');
 Notification.permission='denied';await module.syncDeviceNotifications(true);assert.equal(registered,2,'Denied site permission never gets bypassed');assert.match(module.deviceNotificationsPage(),/Website đang bị chặn/);
});
