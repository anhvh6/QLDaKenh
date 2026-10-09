import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'push-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,get,all,db,now}=await import('../server/store.mjs');
const {validSubscription,pushRoute,pushTick,eventFor,pushKeys}=await import('../server/web-push.mjs');
const user={id:'push-owner',role:'owner'},staff={id:'push-staff',role:'support'},outsider={id:'push-outsider',role:'support'};
for(const u of [user,staff,outsider]){db.prepare('INSERT INTO users VALUES(?,?,?,?,?,1)').run(u.id,u.id+'@test.invalid',u.id,u.role,'unused');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(u.id,u.id,'unused',Date.now()+3600000);}
put('connections',{id:'push-channel'});put('team_members',{userId:staff.id,teamId:'push-team'});put('channel_teams',{teamId:'push-team',connectionId:'push-channel'});put('conversations',{id:'push-chat',connectionId:'push-channel',title:'Private customer'});
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test-only',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}},prefs={messages:true,reminders:true,handoffs:true,sound:true};
test('subscription validation rejects private networks, credentials, lookalike domains and invalid keys',()=>{
 assert.equal(validSubscription(sub),true);
 for(const endpoint of ['http://fcm.googleapis.com/path','https://127.0.0.1/','https://fcm.googleapis.com.evil.invalid/','https://user@fcm.googleapis.com/','https://fcm.googleapis.com:444/'])assert.equal(validSubscription({...sub,endpoint}),false);
 assert.equal(validSubscription({...sub,keys:{...sub.keys,auth:'bad'}}),false);
 assert.equal(pushKeys().publicKey,pushKeys().publicKey);
});
test('events enforce recipient/channel scope and respect lock screen preview preference',()=>{
 const message={id:'sensitive',conversationId:'push-chat',direction:'incoming',text:'Private phone and content'};
 const hidden=eventFor('messages',message,staff,{...prefs,preview:false});assert.equal(hidden.title,'Có tin nhắn mới');assert.ok(!hidden.body.includes('Private'));
 const payload=eventFor('messages',message,staff,prefs);assert.equal(payload.title,'Private customer');assert.equal(payload.body,message.text);assert.equal(payload.url,'/?conversation=push-chat#inbox');
 const group=put('conversations',{id:'group-push',connectionId:'push-channel',threadType:1,title:'QA nhóm'});const grouped=eventFor('messages',{...message,conversationId:group.id,senderName:'QA nick'},staff,prefs);assert.equal(grouped.title,'QA nick · QA nhóm');
 assert.equal(eventFor('messages',{...message,history:true},staff,prefs),null);
 assert.equal(eventFor('messages',message,outsider,prefs),null);
 assert.equal(eventFor('messages',message,user,{...prefs,messages:false}),null);
 assert.equal(eventFor('staff_handoffs',{...message,assignedStaffId:staff.id,status:'open'},user,prefs),null);
 assert.equal(eventFor('staff_handoffs',{...message,assignedStaffId:staff.id,status:'resolved'},staff,prefs),null);
 assert.equal(eventFor('notifications',{id:'chat-reminder:one',recipientId:user.id},staff,prefs),null);
 assert.equal(eventFor('notifications',{id:'chat-reminder:one'},user,{...prefs,reminders:false}),null);
});
test('worker sends new events once, persists retry cursor and removes expired subscriptions',async()=>{
 await pushRoute('/api/push/subscribe','POST',{subscription:sub},user);
 await new Promise(r=>setTimeout(r,5));
 put('messages',{id:'push-event1',conversationId:'push-chat',direction:'incoming',text:'Secret',createdAt:'2020-01-01T00:00:00.000Z'});
 const delivered=[];await pushTick(async(s,p)=>delivered.push(p));assert.equal(delivered.length,1);await pushTick(async(s,p)=>delivered.push(p));assert.equal(delivered.length,1);assert.ok(all('push_subscriptions')[0].lastDeliveredAt);
 await new Promise(r=>setTimeout(r,5));put('messages',{id:'push-event2',conversationId:'push-chat',direction:'incoming'});
 await pushTick(async()=>{throw Object.assign(Error('retry'),{statusCode:503});});let saved=all('push_subscriptions')[0];assert.ok(saved.retryAt>Date.now());assert.match((await pushRoute('/api/push/status','POST',{endpoint:sub.endpoint},user)).error,/503/);put('push_subscriptions',{...saved,retryAt:null});
 await pushTick(async(s,p)=>delivered.push(p));assert.equal(delivered.length,2);
 await new Promise(r=>setTimeout(r,5));put('messages',{id:'push-event3',conversationId:'push-chat',direction:'incoming'});
 await pushTick(async()=>{throw Object.assign(Error('gone'),{statusCode:410});});assert.equal(all('push_subscriptions').length,0);
});
test('another account cannot unsubscribe this device and outgoing messages do not notify',async()=>{
 await pushRoute('/api/push/subscribe','POST',{subscription:sub},user);
 await pushRoute('/api/push/unsubscribe','POST',{endpoint:sub.endpoint},staff);assert.equal(all('push_subscriptions').length,1);
 assert.equal(eventFor('messages',{id:'out',direction:'outgoing'},user,prefs),null);
 await pushRoute('/api/push/unsubscribe','POST',{endpoint:sub.endpoint},user);assert.equal(all('push_subscriptions').length,0);
});
test('service worker shows system alert, sound preference and badge; click rejects foreign URL',async()=>{
 const listeners={},shown=[],badges=[],opened=[],self={location:{origin:'https://hub.test'},addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},navigator:{setAppBadge:async count=>badges.push(count)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},skipWaiting(){}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL});
 let waiting;listeners.push({data:{json:()=>({title:'Test',silent:true,badge:3,url:'/#inbox'})},waitUntil:p=>waiting=p});await waiting;
 assert.equal(shown[0][1].silent,true);assert.deepEqual(badges,[3]);
 listeners.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>waiting=p});await waiting;assert.equal(opened.length,0);
 listeners.notificationclick({notification:{close(){},data:{url:'/#inbox'}},waitUntil:p=>waiting=p});await waiting;assert.deepEqual(opened,['https://hub.test/#inbox']);
});
