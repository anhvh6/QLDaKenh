import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {copyStateSummary} from '../server/copy-state-summary.mjs';
import {stateRequests} from '../public/state-request.js';

test('calendar of 2700 videos reads each collection once and isolates owners',()=>{
 const records={copy_plans:[{id:'plan',userId:'owner',name:'My plan',channels:['fb']},{id:'other',userId:'other',name:'Private'}],copy_videos:[],copy_plan_items:[]};
 for(let i=0;i<2700;i++){records.copy_videos.push({id:'v'+i,userId:'owner',title:'Video '+i});records.copy_plan_items.push({id:'i'+i,userId:'owner',planId:'plan',videoId:'v'+i,scheduleAt:'2026-10-24',state:'scheduled'});}
 records.copy_plan_items.push({id:'foreign',userId:'other',planId:'other',scheduleAt:'2026-10-24',state:'scheduled'},{id:'bad-reference',userId:'owner',planId:'other',scheduleAt:'2026-10-24',state:'scheduled'});
 const reads=[];const start=performance.now(),result=copyStateSummary('owner',kind=>{reads.push(kind);return records[kind];});
 console.log('Calendar:',Math.round(performance.now()-start)+'ms,',reads.length,'collection reads');
 assert.equal(reads.length,3);assert.equal(result.copyPlanCalendar.length,2700);assert.equal(result.copyPlanSummaries.length,1);assert.equal(result.copyPlanCalendar[2699].title,'Video 2699');assert.deepEqual(result.copyPlanCalendar[0].channels,['fb']);
});

test('simultaneous refreshes share a request, release errors, and isolate sessions/views',async()=>{
 let calls=0,release;const request=stateRequests(()=>{calls++;return new Promise(r=>release=r);});
 const params=new URLSearchParams({view:'workspace'}),a=request(params,'user'),b=request(params,'user');assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);release({ok:true});await a;
 const next=request(params,'user');assert.notEqual(next,a);await Promise.resolve();release({ok:true});await next;
 const other=request(params,'other'),full=request(new URLSearchParams({view:'full'}),'user');assert.notEqual(other,full);
 let errors=0;const failing=stateRequests(()=>{errors++;throw Error('offline');});await assert.rejects(failing(params));await assert.rejects(failing(params));assert.equal(errors,2);
});

test('notification opens cached conversation immediately without waiting for workspace refresh',()=>{
 const source=readFileSync('public/app.js','utf8'),start=source.indexOf("navigator.serviceWorker.addEventListener('message',event=>"),end=source.indexOf('\n });',start);
 let handler,rendered=0,background=0,ack=0,full=0;
 const context={navigator:{serviceWorker:{addEventListener:(_,fn)=>handler=fn}},URL,location:{origin:'https://app.test',assign:()=>assert.fail('Must not reload')},S:{user:{id:'owner'},conversations:[{id:'chat'}]},rememberInboxDraft:()=>{},closeModal:()=>{},history:{pushState:()=>{}},render:()=>rendered++,refreshBackground:()=>{background++;return new Promise(()=>{});},refresh:()=>{full++;return Promise.resolve();},toast:()=>{},$:()=>null};
 vm.runInNewContext(source.slice(start,end)+'\n });',context);
 handler({data:{type:'hub-open-notification',url:'https://app.test/?conversation=chat&message=message-1#inbox'},ports:[{postMessage:r=>{assert.equal(r.handled,true);ack++;}}]});
 assert.equal(ack,1);assert.equal(rendered,1);assert.equal(background,1);assert.equal(full,0);assert.equal(context.selectedConversation,'chat');assert.equal(context.notificationMessage,'message-1');
 handler({data:{type:'hub-open-notification',url:'https://foreign.test/'},ports:[{postMessage:()=>assert.fail('Foreign URL')} ]});assert.equal(rendered,1);
});

test('cold notification includes its conversation and message in the first inbox snapshot request',()=>{
 const source=readFileSync('public/app.js','utf8'),start=source.indexOf('function stateParams('),end=source.indexOf('\n',start);
 const context={URLSearchParams,location:{search:'?conversation=chat-2&message=message-2'}};vm.runInNewContext(source.slice(start,end)+';result=stateParams("inbox")',context);
 assert.equal(context.result.get('view'),'inbox');assert.equal(context.result.get('conversation'),'chat-2');assert.equal(context.result.get('message'),'message-2');
});

test('notification boot paints the selected chat before the application snapshot finishes',async()=>{
 const source=readFileSync('public/notification-chat-boot.js','utf8'),calls=[];
 const app={dataset:{},innerHTML:'',querySelector:()=>null};
 const context={URLSearchParams,location:{search:'?conversation=chat%2Ffast&message=message-3',hash:'#inbox'},document:{getElementById:id=>id==='app'?app:null},requestAnimationFrame:fn=>fn(),fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({conversation:{id:'chat/fast',title:'Khách nhanh'},messages:[{id:'message-3',text:'<script>alert(1)</script>',direction:'incoming',createdAt:'2026-10-31T08:00:00.000Z'}]})};}};
 context.window=context;vm.runInNewContext(source,context);const result=await context.__notificationChatWindowPromise;
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/chat/conversations/chat%2Ffast/live?limit=60');assert.equal(calls[0].options.headers['ngrok-skip-browser-warning'],'true');
 assert.equal(result.conversation.id,'chat/fast');assert.equal(context.__notificationChatWindow.conversationId,'chat/fast');assert.match(app.innerHTML,/Khách nhanh/);assert.match(app.innerHTML,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(app.innerHTML,/<script>/);
});

test('notification boot is loaded before the main application bundle',()=>{
 const html=readFileSync('public/index.html','utf8'),fast=html.indexOf('/notification-chat-boot.js'),bundle=html.indexOf('/app.bundle.js');
 assert.ok(fast>=0);assert.ok(bundle>fast);
});
