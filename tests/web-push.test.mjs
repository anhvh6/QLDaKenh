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
put('connections',{id:'push-channel',status:'connected'});put('team_members',{userId:staff.id,teamId:'push-team'});put('channel_teams',{teamId:'push-team',connectionId:'push-channel'});put('conversations',{id:'push-chat',connectionId:'push-channel',title:'Private customer'});
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test-only',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}},prefs={messages:true,reminders:true,handoffs:true,sound:true};
test('message, receipt and SLA alert produce one meaningful customer push, not generic duplicates',()=>{
 const m=put('messages',{id:'dedupe-message',conversationId:'push-chat',direction:'incoming',text:'Khách gửi nội dung'});
 assert.equal(eventFor('messages',m,staff,prefs).body,m.text);
 assert.equal(eventFor('notifications',{id:'receipt',messageId:m.id,conversationId:'push-chat',route:'inbox'},staff,prefs),null);
 assert.equal(eventFor('notifications',{id:'sla',title:'Quá hạn phản hồi',route:'inbox'},staff,prefs),null);
 assert.equal(eventFor('notifications',{id:'comment-receipt',conversationId:'push-chat',title:'Bình luận mới trên Page',route:'comments'},staff,prefs),null);
 const content=eventFor('notifications',{id:'posting',title:'Cần xử lý bài đăng',body:'Kênh chưa kết nối',route:'content'},staff,prefs);assert.equal(content.title,'Cần xử lý bài đăng');assert.equal(content.body,'Kênh chưa kết nối');assert.equal(content.url,'/#content');
});
test('appointment pushes show call details only to the recipient and respect preview privacy without a duplicate task push',()=>{
 put('chat_reminders',{id:'qa',conversationId:'push-chat',status:'pending',assigneeIds:[staff.id]});
 const n={id:'chat-reminder:advance:qa',reminderId:'qa',recipientId:staff.id,conversationId:'push-chat',title:'Sắp đến giờ call cho khách',body:'Khách QA · Giờ call: 15:30'};
 assert.equal(eventFor('notifications',n,staff,prefs).body,n.body);assert.equal(eventFor('notifications',n,user,prefs),null);
 assert.ok(!eventFor('notifications',n,staff,{...prefs,preview:false}).body.includes('Khách QA'));
 assert.equal(eventFor('staff_handoffs',{...n,taskType:'appointment',assignedStaffId:staff.id,status:'open'},staff,prefs),null);
});

test('assigned reminders still notify when the social channel disconnects, retain chat links and stop after cancellation',()=>{
 const n={id:'chat-reminder:advance:offline',reminderId:'offline',recipientId:staff.id,conversationId:'push-chat',title:'Sắp đến giờ nhắc hẹn',body:'Tư vấn QA'};
 const reminder=put('chat_reminders',{id:'offline',conversationId:'push-chat',status:'pending',assigneeIds:[staff.id]});
 const channel=get('connections','push-channel');put('connections',{...channel,status:'disconnected'});
 const payload=eventFor('notifications',n,staff,prefs);assert.equal(payload.url,'/?conversation=push-chat#inbox');assert.equal(payload.body,n.body);
 assert.equal(eventFor('notifications',n,user,prefs),null);assert.equal(eventFor('notifications',{...n,recipientId:outsider.id},outsider,prefs),null);
 put('chat_reminders',{...reminder,status:'cancelled'});assert.equal(eventFor('notifications',n,staff,prefs),null);
 put('connections',channel);
});
test('subscription validation rejects private networks, credentials, lookalike domains and invalid keys',()=>{
 assert.equal(validSubscription(sub),true);
 for(const endpoint of ['http://fcm.googleapis.com/path','https://127.0.0.1/','https://fcm.googleapis.com.evil.invalid/','https://user@fcm.googleapis.com/','https://fcm.googleapis.com:444/'])assert.equal(validSubscription({...sub,endpoint}),false);
 assert.equal(validSubscription({...sub,keys:{...sub.keys,auth:'bad'}}),false);
 assert.equal(pushKeys().publicKey,pushKeys().publicKey);
});
test('events enforce recipient/channel scope and respect lock screen preview preference',()=>{
 const message={id:'sensitive',conversationId:'push-chat',direction:'incoming',text:'Private phone and content'};
 const hidden=eventFor('messages',message,staff,{...prefs,preview:false});assert.equal(hidden.title,'Có tin nhắn mới');assert.ok(!hidden.body.includes('Private'));
 const payload=eventFor('messages',message,staff,prefs);assert.equal(payload.title,'Private customer');assert.equal(payload.body,message.text);assert.equal(payload.url,'/?conversation=push-chat&message=sensitive#inbox');
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
 put('notifications',{id:'sla-push-duplicate',title:'Quá hạn phản hồi',body:'Khách · 3 phút',route:'inbox',read:false});
 put('notifications',{id:'message-push-receipt',messageId:'push-event1',conversationId:'push-chat',title:'Tin nhắn mới',route:'inbox',read:false});
 const delivered=[];await pushTick(async(s,p)=>delivered.push(p));assert.equal(delivered.length,1);const idleVersion=all('push_subscriptions')[0].version;await pushTick(async(s,p)=>delivered.push(p));assert.equal(delivered.length,1);assert.equal(all('push_subscriptions')[0].version,idleVersion,'Empty push polling must not emit state-change revisions');assert.ok(all('push_subscriptions')[0].lastDeliveredAt);
 await new Promise(r=>setTimeout(r,5));put('messages',{id:'push-event2',conversationId:'push-chat',direction:'incoming'});
 await pushTick(async()=>{throw Object.assign(Error('retry'),{statusCode:503});});let saved=all('push_subscriptions')[0];assert.ok(saved.retryAt>Date.now());assert.match((await pushRoute('/api/push/status','POST',{endpoint:sub.endpoint},user)).error,/503/);put('push_subscriptions',{...saved,retryAt:null});
 await pushTick(async(s,p)=>delivered.push(p));assert.equal(delivered.length,2);
 await new Promise(r=>setTimeout(r,5));put('messages',{id:'push-event3',conversationId:'push-chat',direction:'incoming'});
 await pushTick(async()=>{throw Object.assign(Error('gone'),{statusCode:410});});assert.equal(all('push_subscriptions')[0].invalid,true);assert.equal((await pushRoute('/api/push/status','POST',{endpoint:sub.endpoint},user)).needsRenewal,true);let retries=0;await pushTick(async()=>retries++);assert.equal(retries,0);
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
test('notification click focuses an existing app before navigation and opens a window if a stale client fails',async()=>{
 const listeners={},order=[],opened=[],url='https://hub.test/?conversation=push-chat&message=sensitive#inbox';let fail=false;
 const client={url:'https://hub.test/#dashboard',focus:async()=>{order.push('focus');return client;},navigate:async target=>{order.push('navigate');assert.equal(target,url);if(fail)throw Error('stale client');return client;}};
 const self={location:{origin:'https://hub.test'},addEventListener:(n,fn)=>listeners[n]=fn,clients:{matchAll:async()=>[client],openWindow:async u=>opened.push(u)}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL});let waiting;
 const click=()=>listeners.notificationclick({notification:{close(){},data:{url}},waitUntil:p=>waiting=p});click();await waiting;assert.deepEqual(order,['focus','navigate','focus']);assert.equal(opened.length,0);
 fail=true;click();await waiting;assert.deepEqual(opened,[url]);
});
test('current app acknowledges a notification deep link without reloading or opening a duplicate window',async()=>{
 const listeners={},messages=[],calls=[],url='https://hub.test/?conversation=push-chat#inbox';
 class Channel{constructor(){this.port1={close(){}};this.port2={reply:data=>queueMicrotask(()=>this.port1.onmessage({data}))};}}
 const client={url:'https://hub.test/#dashboard',focus:async()=>calls.push('focus'),navigate:async()=>{throw Error('must not reload');},postMessage:(message,ports)=>{messages.push(message);ports[0].reply({handled:true});}};
 const self={location:{origin:'https://hub.test'},addEventListener:(n,fn)=>listeners[n]=fn,clients:{matchAll:async()=>[client],openWindow:async()=>{throw Error('must reuse current app');}}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,MessageChannel:Channel,setTimeout,clearTimeout});let waiting;listeners.notificationclick({notification:{close(){},data:{url}},waitUntil:p=>waiting=p});await waiting;assert.deepEqual(calls,['focus']);assert.equal(messages[0].type,'hub-open-notification');assert.equal(messages[0].url,url);
});


test('live comment import alerts once with comment deep link; history and own replies stay silent',async()=>{
 const {upsertComment}=await import('../server/comments.mjs');
 const channel=put('connections',{id:'push-comment-channel',provider:'facebook',accountId:'page',name:'Page QA',status:'connected',mode:'api'});
 await pushRoute('/api/push/subscribe','POST',{subscription:sub},user);
 await new Promise(r=>setTimeout(r,5));
 const item={id:'push-comment-live',message:'New customer comment',from:{id:'customer',name:'Comment customer'},created_time:'2020-01-01T00:00:00Z'};
 const m=upsertComment(channel,item,{id:'post'},true);
 upsertComment(channel,item,{id:'post'},true);
 const history=upsertComment(channel,{...item,id:'push-comment-history'},{id:'post'},false);
 upsertComment(channel,{id:'push-comment-own',message:'Staff reply',from:{id:'page'},parent:{id:item.id}},{id:'post'},true);
 assert.equal(history.history,true);assert.equal(history.pushReceivedAt,undefined);
 const receipts=all('notifications').filter(n=>n.messageId===m.id&&n.recipientId===user.id);
 assert.equal(receipts.length,1);assert.equal(receipts[0].route,'comments');assert.match(receipts[0].title,/Bình luận mới/);
 const delivered=[];await pushTick(async(s,p)=>delivered.push(p));await pushTick(async(s,p)=>delivered.push(p));
 assert.equal(delivered.length,1);assert.equal(delivered[0].body,item.message);
 assert.equal(delivered[0].url,'/?conversation='+m.conversationId+'&message='+m.id+'#comments');
 assert.equal(eventFor('messages',m,user,{...prefs,preview:false}).title,'Có bình luận mới');
 assert.equal(eventFor('messages',m,outsider,prefs),null);
 await pushRoute('/api/push/unsubscribe','POST',{endpoint:sub.endpoint},user);
});


test('test receipt is scoped to its user and idempotently acknowledges the selected device',async()=>{
 await pushRoute('/api/push/subscribe','POST',{subscription:sub},user);
 const s=all('push_subscriptions').find(s=>s.userId===user.id);put('push_subscriptions',{...s,lastTestId:'receipt-qa'});
 put('push_tests',{id:'receipt-qa',userId:user.id,subscriptionId:s.id});
 await assert.rejects(pushRoute('/api/push/receipt','POST',{testId:'receipt-qa'},staff),/Không tìm thấy/);
 await pushRoute('/api/push/receipt','POST',{testId:'receipt-qa'},user);
 const status=await pushRoute('/api/push/status','POST',{endpoint:sub.endpoint},user);assert.ok(status.lastTestDisplayedAt);assert.equal(status.deviceId,s.id.slice(0,12));assert.equal(status.pushService,'fcm.googleapis.com');
 const v=get('push_subscriptions',s.id).version;await pushRoute('/api/push/receipt','POST',{testId:'receipt-qa'},user);assert.equal(get('push_subscriptions',s.id).version,v);
 await pushRoute('/api/push/subscribe','POST',{subscription:sub},user);assert.equal((await pushRoute('/api/push/status','POST',{endpoint:sub.endpoint},user)).lastTestDisplayedAt,status.lastTestDisplayedAt);
});

test('service worker acknowledges test only after showNotification succeeds using session CSRF',async()=>{
 const listeners={},calls=[];let failure=false;
 const self={location:{origin:'https://hub.test'},addEventListener:(n,f)=>listeners[n]=f,registration:{showNotification:async()=>{calls.push('shown');if(failure)throw Error('OS rejected');}},navigator:{}};
 const fetch=async(url,options)=>{calls.push({url,options});return {json:async()=>({user:{csrf:'test-session-csrf'}})};};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,fetch});let waiting;
 const fire=()=>listeners.push({data:{json:()=>({testId:'receipt-qa',title:'Test'})},waitUntil:p=>waiting=p});fire();await waiting;
 assert.equal(calls[0],'shown');assert.equal(calls[1].url,'/api/bootstrap');assert.equal(calls[2].url,'/api/push/receipt');assert.equal(calls[2].options.headers['X-CSRF-Token'],'test-session-csrf');assert.equal(JSON.parse(calls[2].options.body).testId,'receipt-qa');
 calls.length=0;failure=true;fire();await assert.rejects(waiting,/OS rejected/);assert.equal(calls.length,1);
});


test('permission diagnostics keep only bounded states for the authenticated device',async()=>{
 const result=await pushRoute('/api/push/diagnostics','POST',{deviceId:'android-device-qa',web:'denied',browser:'denied',push:'prompt',platform:'Android',standalone:true,endpoint:'must-not-store'},user);
 const row=all('push_permission_checks').find(r=>r.id.startsWith(result.code));assert.equal(row.userId,user.id);assert.equal(row.web,'denied');assert.equal(row.endpoint,undefined);
 await assert.rejects(pushRoute('/api/push/diagnostics','POST',{deviceId:'bad<script>'},user),/không hợp lệ/);
});

test('staff-only appointment delivers advance and due push once to the assigned device with the same chat target',async()=>{
 const {createChatReminder,reminderTick}=await import('../server/chat-reminders.mjs');
 const staffSub={...sub,endpoint:'https://fcm.googleapis.com/fcm/send/assigned-reminder-qa'};
 await pushRoute('/api/push/subscribe','POST',{subscription:staffSub,preferences:prefs},staff);
 await pushRoute('/api/push/subscribe','POST',{subscription:sub,preferences:prefs},user);
 await new Promise(r=>setTimeout(r,5));
 const due=Date.now()+3600000,reminder=await createChatReminder(user,get('conversations','push-chat'),{title:'Appointment integration QA',dueAt:new Date(due).toISOString(),assigneeIds:[staff.id],customerReminder:false,platform:false});
 const received=[],send=async(device,payload)=>received.push({userId:device.userId,...payload});
 await pushTick(send);received.length=0;await new Promise(r=>setTimeout(r,5));
 reminderTick(due-330000);await pushTick(send);await pushTick(send);
 const advance=received.filter(p=>p.tag.includes(reminder.id));assert.equal(advance.length,1);assert.equal(advance[0].userId,staff.id);assert.match(advance[0].title,/Sắp đến giờ/);assert.equal(advance[0].url,'/?conversation=push-chat#inbox');
 await new Promise(r=>setTimeout(r,5));reminderTick(due);await pushTick(send);await pushTick(send);
 const both=received.filter(p=>p.tag.includes(reminder.id));assert.equal(both.length,2);assert.equal(both[1].title,'Đến giờ nhắc hẹn');assert.ok(both.every(p=>p.userId===staff.id&&p.url===advance[0].url));
 await pushRoute('/api/push/unsubscribe','POST',{endpoint:staffSub.endpoint},staff);
});
