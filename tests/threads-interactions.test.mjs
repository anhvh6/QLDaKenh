import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {threadsNotification,validThreadsSignature} from '../server/threads-webhook.mjs';
import {sendThreadsReply} from '../server/threads-replies.mjs';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'threads-interactions-'));
const {put,get,all,saveSecret}=await import('../server/store.mjs');
const {ingestThreadsNotification,commentAttachments}=await import('../server/comments.mjs');
const channel=put('connections',{id:'threads-webhook',provider:'threads',accountId:'owner',name:'business',mode:'api',status:'connected'});
const payload={app_id:'test-app',topic:'moderate',target_id:'post',time:1723226877,subscription_id:'subscription',values:{field:'replies',value:{id:'reply',username:'reader',text:'Hello',media_type:'IMAGE',media_url:'https://example.com/a.jpg',timestamp:'2026-10-25T01:00:00Z',root_post:{id:'post',owner_id:'owner'},replied_to:{id:'post'}}}};
test('official Threads envelope verifies signature, binds app and rejects tampering',()=>{
 const raw=JSON.stringify(payload),sig='sha256='+createHmac('sha256','threads-secret').update(raw).digest('hex');
 assert.equal(validThreadsSignature(raw,sig,['threads-secret']),true);
 assert.equal(validThreadsSignature(raw+' ',sig,['threads-secret']),false);
 assert.equal(validThreadsSignature(raw,sig,['meta-secret']),false);
 assert.equal(validThreadsSignature(raw,'sha256=bad',['threads-secret']),false);
 assert.equal(threadsNotification(payload,'another-app'),null);
 assert.equal(threadsNotification({...payload,values:{...payload.values,value:{id:'unroutable'}}}),null);
});
test('Threads live reply/album is channel-isolated, idempotent and deletion cannot resurrect it',()=>{
 assert.equal(ingestThreadsNotification({...channel,accountId:'other'},payload),false);
 assert.equal(ingestThreadsNotification({...channel,provider:'instagram'},payload),false);
 assert.equal(ingestThreadsNotification(channel,payload),true);
 const message=all('messages').find(m=>m.externalId==='reply');
 assert.equal(message.text,'Hello');assert.equal(message.attachments[0].type,'image');assert.equal(get('conversations',message.conversationId).unread,true);
 ingestThreadsNotification(channel,payload);assert.equal(all('messages').length,1);assert.equal(all('notifications').length,1);
 assert.equal(commentAttachments({children:{data:[{media_type:'IMAGE',media_url:'https://example.com/1.jpg'},{media_type:'IMAGE',media_url:'https://example.com/2.jpg'}]}}).length,2);
 ingestThreadsNotification(channel,{...payload,values:{field:'delete',value:{id:'reply',owner:{owner_id:'owner'},deleted_at:'2026-10-25T02:00:00Z'}}});
 assert.equal(get('messages',message.id).status,'deleted');assert.equal(get('conversations',message.conversationId).remoteDeleted,true);
 ingestThreadsNotification(channel,{...payload,time:1723226999});assert.ok(get('messages',message.id).deletedAt);
});
function api({status='FINISHED',publishError=false}={}){const calls=[];return {calls,request:async(url,options={})=>{const body=options.body&&JSON.parse(options.body);calls.push({url,body});if(!body)return {status};if(url.endsWith('/threads_publish')){if(publishError)throw Object.assign(Error('Unknown provider response'),{unknown:true});return {id:'receipt'};}return {id:'container-'+calls.length};}};}
const send=(request,assets=[],text='Reply')=>sendThreadsReply(channel,{externalCommentId:'selected'},text,assets,'test',request,a=>'https://example.com/'+a.id+'.jpg',async()=>{});
test('image-only reply waits for media and publishes once against selected comment',async()=>{
 const {calls,request}=api();assert.equal((await send(request,[{id:'a',type:'image'}],'')).id,'receipt');
 assert.deepEqual(calls[0].body,{media_type:'IMAGE',reply_to_id:'selected',image_url:'https://example.com/a.jpg'});
 assert.ok(calls[1].url.includes('fields=status'));assert.equal(calls.filter(c=>c.url.endsWith('/threads_publish')).length,1);
});
test('multiple images become one carousel reply, never separate replies',async()=>{
 const {calls,request}=api();await send(request,[{id:'a',type:'image'},{id:'b',type:'image'}]);
 const parent=calls.find(c=>c.body?.media_type==='CAROUSEL');assert.equal(parent.body.reply_to_id,'selected');assert.equal(parent.body.text,'Reply');assert.equal(parent.body.children.split(',').length,2);
 assert.equal(calls.filter(c=>c.body?.is_carousel_item).length,2);assert.equal(calls.filter(c=>c.url.endsWith('/threads_publish')).length,1);
});
test('invalid media, long text, unready media and ambiguous publish never send duplicate replies',async()=>{
 const a=api();await assert.rejects(send(a.request,[{type:'video'}]),/ảnh/);await assert.rejects(send(a.request,[],'a'.repeat(501)),/500/);assert.equal(a.calls.length,0);
 for(const status of ['ERROR','IN_PROGRESS','UNRECOGNIZED']){const b=api({status});await assert.rejects(send(b.request,[{id:'a',type:'image'}]));assert.equal(b.calls.filter(c=>c.url.endsWith('/threads_publish')).length,0);}
 const c=api({publishError:true});await assert.rejects(send(c.request,[{id:'a',type:'image'}]),e=>e.unknown===true);assert.equal(c.calls.filter(c=>c.url.endsWith('/threads_publish')).length,1);
});
test('domain permits image replies on Threads while continuing to block Threads DMs',async()=>{
 const {reply}=await import('../server/domain.mjs');saveSecret(channel.id,{token:'test'});process.env.OAUTH_BASE_URL='https://example.com';
 const asset=put('assets',{id:'thread-image',name:'Photo',type:'image',url:'/uploads/asset_thread-image.jpg',scopes:['chat']});
 const conv=put('conversations',{connectionId:channel.id,kind:'comment',externalCommentId:'selected',mode:'api',status:'open'}),previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>Response.json(options.method==='POST'?{id:'confirmed'}:{status:'FINISHED'});
 try{const msg=await reply({id:'owner',role:'owner'},conv.id,{version:conv.version,text:'Photo',assetIds:[asset.id]});assert.equal(msg.attachments.length,1);assert.notEqual(msg.status,'failed');}finally{globalThis.fetch=previous;}
 const dm=put('conversations',{connectionId:channel.id,kind:'message',externalUserId:'reader',mode:'api',status:'open'});
 await assert.rejects(reply({id:'owner',role:'owner'},dm.id,{version:dm.version,text:'Hi',assetIds:[asset.id]}),/chưa hỗ trợ/);
});
test('shared HTTP webhook accepts only correctly signed Threads envelopes and imports replies',async()=>{
 const port=4498,base='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),THREADS_APP_ID:'test-app',THREADS_APP_SECRET:'threads-secret',META_APP_SECRET:'meta-secret',META_WEBHOOK_VERIFY_TOKEN:'test-verify'},stdio:'pipe',windowsHide:true});
 let output='';server.stderr.on('data',b=>output+=b);server.stdout.on('data',b=>output+=b);
 try{
  let healthy=false;for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/health');healthy=r.ok;if(healthy)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(healthy,output);
  const raw=JSON.stringify({...payload,values:{...payload.values,value:{...payload.values.value,id:'http-reply'}}}),sign=key=>'sha256='+createHmac('sha256',key).update(raw).digest('hex');
  const send=signature=>fetch(base+'/api/webhooks/meta',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signature},body:raw});
  assert.equal((await send(sign('meta-secret'))).status,403);
  assert.equal((await send(sign('threads-secret'))).status,200);
  assert.equal((await send(sign('threads-secret'))).status,200);
  assert.equal(all('messages').filter(m=>m.externalId==='http-reply').length,1);
  assert.equal(await (await fetch(base+'/api/webhooks/meta?hub.verify_token=test-verify&hub.challenge=challenge')).text(),'challenge');
 }finally{server.kill();}
});
