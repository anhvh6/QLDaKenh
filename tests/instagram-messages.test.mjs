import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});
process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'instagram-messages-'));
process.env.PLAN_REMOTE_CATALOG='0';
process.env.OAUTH_BASE_URL='https://hub.example.test';
const {put,get,db,dataDir,saveSecret}=await import('../server/store.mjs');
const {sendMessage}=await import('../server/connectors.mjs');
const {publicMediaFile}=await import('../server/public-media.mjs');
const channel=put('connections',{id:'ig',provider:'instagram',accountId:'ig-business',mode:'api',status:'connected'});
saveSecret(channel.id,{token:'test-token',pageId:'linked-facebook-page'});
const conv={externalUserId:'customer',lastInboundAt:new Date().toISOString()};
writeFileSync(join(dataDir,'uploads','asset_photo.png'),Buffer.from('89504e470d0a1a0a','hex'));
const photo=put('assets',{id:'photo',type:'image',mime:'image/png',url:'/uploads/asset_photo.png'});

test('Instagram sends text and image, signs retrievable media URL and keeps both receipts',async()=>{
 const before=global.fetch,bodies=[];
 try{
  global.fetch=async(url,options)=>{
   assert.match(url,/linked-facebook-page\/messages$/);
   const body=JSON.parse(options.body);bodies.push(body);
   assert.equal(body.recipient.id,'customer');
   if(body.message.attachment){
    const url=new URL(body.message.attachment.payload.url);
    assert.equal(url.origin,'https://hub.example.test');
    assert.equal(publicMediaFile(url.pathname),join(dataDir,'uploads','asset_photo.png'));
    assert.equal(body.message.attachment.type,'image');
   }
   return new Response(JSON.stringify({message_id:'receipt-'+bodies.length}));
  };
  const result=await sendMessage(channel,conv,'Ảnh của bạn',{assetRefs:[photo]});
  assert.equal(bodies.length,2);assert.equal(bodies[0].message.text,'Ảnh của bạn');
  assert.deepEqual(result.externalMessages,[{id:'receipt-1'},{id:'receipt-2'}]);
  bodies.length=0;
  assert.equal((await sendMessage(channel,conv,'',{assetRefs:[photo]})).externalMessages.length,1);
  assert.ok(bodies[0].message.attachment);
 }finally{global.fetch=before;}
});

test('invalid photos and expired reply window send no text or attachment',async()=>{
 const before=global.fetch;let calls=0;
 try{
  global.fetch=async()=>{calls++;throw Error('Unexpected request');};
  for(const invalid of [{...photo,mime:'video/mp4'},{...photo,url:'/uploads/../private.png'}]){
   await assert.rejects(sendMessage(channel,conv,'Do not partially send',{assetRefs:[invalid]}),/JPG|không hợp lệ/);
  }
  writeFileSync(join(dataDir,'uploads','asset_big.png'),Buffer.alloc(8*1024*1024+1));
  await assert.rejects(sendMessage(channel,conv,'text',{assetRefs:[{...photo,url:'/uploads/asset_big.png'}]}),/8 MB/);
  await assert.rejects(sendMessage(channel,{...conv,lastInboundAt:'2020-01-01'},'text',{assetRefs:[photo]}),/24 giờ/);
  assert.equal(calls,0);
 }finally{global.fetch=before;}
});

test('partial delivery and missing provider acknowledgement remain uncertain, never successful',async()=>{
 const before=global.fetch;let calls=0;
 try{
  global.fetch=async()=>++calls===1?new Response(JSON.stringify({message_id:'already-sent'})):new Response(JSON.stringify({error:{message:'Ảnh bị từ chối'}}),{status:400});
  await assert.rejects(sendMessage(channel,conv,'text',{assetRefs:[photo]}),e=>e.unknown===true&&e.externalMessages[0].id==='already-sent');
  global.fetch=async()=>new Response('{}');
  await assert.rejects(sendMessage(channel,conv,'',{assetRefs:[photo]}),e=>e.unknown===true);
 }finally{global.fetch=before;}
});

test('normal inbox reply permits Instagram images and persists their provider receipt',async()=>{
 const {reply}=await import('../server/domain.mjs');
 db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run('owner','owner@example.test','Owner','owner','test');
 const user={id:'owner',role:'owner'},customer=put('customers',{name:'Test peer'});
 const thread=put('conversations',{connectionId:channel.id,customerId:customer.id,kind:'message',status:'open',...conv});
 const before=global.fetch;let calls=0;
 try{
  global.fetch=async()=>{calls++;return new Response(JSON.stringify({message_id:'domain-image'}));};
  const sent=await reply(user,thread.id,{text:'',assetIds:[photo.id],version:thread.version});
  assert.equal(sent.status,'accepted');assert.equal(sent.externalId,'domain-image');
  assert.equal(sent.attachments[0].assetId,photo.id);assert.equal(get('conversations',thread.id).sending,false);
  const comment=put('conversations',{connectionId:channel.id,customerId:customer.id,kind:'comment',...conv});
  await assert.rejects(reply(user,comment.id,{text:'',assetIds:[photo.id],version:comment.version}),/Bình luận Instagram/);
  assert.equal(calls,1);
 }finally{global.fetch=before;}
});

test('quick reply 36 accepts an image downloaded without MIME metadata and keeps sequence receipts',async()=>{
 const {runTemplate}=await import('../server/taophacdo.mjs');
 const legacyPhoto=put('assets',{...photo,id:'legacy-photo',mime:undefined});
 const customer=put('customers',{name:'Test peer'}),thread=put('conversations',{connectionId:channel.id,customerId:customer.id,kind:'message',status:'open',...conv});
 const template=put('templates',{shortcut:'36',name:'Ảnh mẫu 36',blocks:[{text:'Ảnh mẫu',assetIds:[legacyPhoto.id]},{text:'Khối tiếp theo'}]});
 const before=global.fetch,bodies=[];
 try{
  global.fetch=async(url,options)=>{
   // Fail just as Meta would if the Instagram business ID is used as a Facebook Page.
   assert.equal(new URL(url).pathname,'/v25.0/linked-facebook-page/messages');
   const body=JSON.parse(options.body);assert.equal(body.messaging_type,'RESPONSE');bodies.push(body);
   return new Response(JSON.stringify({message_id:'quick-'+bodies.length}));
  };
  const run=await runTemplate({id:'owner',role:'owner'},thread.id,{templateId:template.id,requestId:'ig-quick-36'});
  assert.equal(run.status,'done');assert.equal(bodies.length,3);assert.equal(run.messages.length,2);
  assert.equal(run.messages[0].externalMessages.length,2);assert.equal(bodies[1].message.attachment.type,'image');
  await runTemplate({id:'owner',role:'owner'},thread.id,{templateId:template.id,requestId:'ig-quick-36'});
  assert.equal(bodies.length,3);
  const invalid=put('assets',{...photo,id:'unsupported',mime:'image/webp'});
  const bad=put('templates',{blocks:[{text:'Must not be sent first'},{assetIds:[invalid.id]}]});
  await assert.rejects(runTemplate({id:'owner',role:'owner'},thread.id,{templateId:bad.id}),/JPG|PNG/);
  assert.equal(bodies.length,3);
 }finally{global.fetch=before;}
});

test('missing linked Page never falls back to Instagram business ID',async()=>{
 const before=global.fetch;let requests=0;
 try{
  saveSecret('without-page',{token:'test-token'});
  global.fetch=async()=>{requests++;return new Response('{}');};
  await assert.rejects(sendMessage({...channel,id:'without-page'},conv,'text',{assetRefs:[photo]}),/Facebook Page liên kết/);
  assert.equal(requests,0);
 }finally{global.fetch=before;}
});
test('one send with several images creates a single carousel, not independent image messages',async()=>{
 const before=global.fetch,bodies=[];try{global.fetch=async(url,options)=>{const body=JSON.parse(options.body);bodies.push(body);assert.match(url,/linked-facebook-page\/messages$/);return new Response(JSON.stringify({message_id:'group-'+bodies.length}));};
 const result=await sendMessage(channel,conv,'',{assetRefs:[photo,photo,photo]});assert.equal(bodies.length,1);assert.equal(result.externalMessages.length,1);
 const attachment=bodies[0].message.attachment;assert.equal(attachment.type,'template');assert.equal(attachment.payload.template_type,'generic');assert.equal(attachment.payload.elements.length,3);for(const e of attachment.payload.elements){assert.ok(e.title);const url=new URL(e.image_url);assert.equal(publicMediaFile(url.pathname),join(dataDir,'uploads','asset_photo.png'));}
 bodies.length=0;await sendMessage(channel,conv,'Nội dung nguyên vẹn',{assetRefs:[photo,photo]});assert.equal(bodies.length,2);assert.equal(bodies[0].message.text,'Nội dung nguyên vẹn');assert.equal(bodies[1].message.attachment.payload.elements.length,2);
 bodies.length=0;await assert.rejects(sendMessage(channel,conv,'Do not send',{assetRefs:Array(11).fill(photo)}),/10 ảnh/);assert.equal(bodies.length,0);
 }finally{global.fetch=before;}
});
