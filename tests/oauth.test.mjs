import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';

process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'oauth-'));
process.env.OAUTH_BASE_URL='https://hub.example.test';
process.env.META_APP_ID='meta-client';
process.env.META_APP_SECRET='meta-secret';
process.env.THREADS_APP_ID='threads-client';
process.env.THREADS_APP_SECRET='threads-secret';
process.env.X_CLIENT_ID='x-client';
process.env.X_CLIENT_SECRET='x-secret';
process.env.GOOGLE_CLIENT_ID='google-client';
process.env.GOOGLE_CLIENT_SECRET='google-secret';
process.env.TIKTOK_CLIENT_KEY='tiktok-client';
process.env.TIKTOK_CLIENT_SECRET='tiktok-secret';
for(const provider of ['FACEBOOK','INSTAGRAM','THREADS','X','YOUTUBE','BLOGGER','TIKTOK'])delete process.env[provider+'_REDIRECT_URI'];

const {startOAuth,supportsOAuth,metaAccounts,oauthMode}=await import('../server/oauth.mjs');
const {deletePublication,publish,updatePublication}=await import('../server/connectors.mjs');
const {get,saveSecret}=await import('../server/store.mjs');
const req={headers:{host:'127.0.0.1:4317'}};
const user={id:'owner'};

test('OAuth providers generate state-bound official authorization URLs',()=>{
 const expected={
  facebook:'www.facebook.com',instagram:'www.facebook.com',threads:'threads.net',x:'x.com',youtube:'accounts.google.com',blogger:'accounts.google.com',tiktok:'www.tiktok.com'
 };
 for(const [provider,host] of Object.entries(expected)){
  assert.equal(supportsOAuth(provider),true);
  const result=startOAuth(user,{id:`connection-${provider}`,provider},req);
  const url=new URL(result.url),state=url.searchParams.get('state');
  assert.equal(url.hostname,host);
  assert.ok(state);
  assert.equal(get('oauth_states',state).connectionId,`connection-${provider}`);
  assert.equal(result.redirectUri,`https://hub.example.test/api/oauth/${provider}/callback`);
  if(provider==='x'){
   assert.equal(url.searchParams.get('code_challenge_method'),'S256');
   assert.ok(url.searchParams.get('code_challenge'));
  }
  if(provider==='threads')assert.ok(url.searchParams.get('scope').split(',').includes('threads_delete'));
  if(provider==='instagram')assert.ok(url.searchParams.get('scope').split(',').includes('instagram_manage_comments'));
 }
});

test('unsupported providers cannot start OAuth',()=>{
 assert.equal(supportsOAuth('reddit'),false);
 assert.throws(()=>startOAuth(user,{id:'reddit',provider:'reddit'},req),/chưa hỗ trợ OAuth/);
});

test('Meta keeps every authorized Facebook Page and linked Instagram account',()=>{
 const pages=[
  {id:'page-1',name:'Trang Một',access_token:'token-1'},
  {id:'page-2',name:'Trang Hai',access_token:'token-2',instagram_business_account:{id:'ig-2',username:'tranghai'}},
 ];
 assert.deepEqual(metaAccounts('facebook',pages).map(account=>account.accountId),['page-1','page-2']);
 assert.deepEqual(metaAccounts('instagram',pages).map(account=>account.accountId),['ig-2']);
});

test('OAuth upgrades publishing platforms out of demo mode',()=>{
 for(const provider of ['facebook','instagram','threads','x','blogger','youtube','tiktok'])assert.equal(oauthMode(provider,'demo'),'api');
});

test('Instagram publishing with Facebook Login uses the Facebook Graph host',async()=>{
 const original=globalThis.fetch,calls=[];saveSecret('instagram-publish',{token:'page-token'});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});if(String(url)==='https://media.example.test/photo.jpg')return new Response('',{status:206,headers:{'Content-Type':'image/jpeg'}});return Response.json({id:'ig-container'});};
  const result=await publish({id:'instagram-publish',provider:'instagram',accountId:'ig-user',apiVersion:'v25.0'},{type:'image',caption:'Caption',mediaUrl:'https://media.example.test/photo.jpg'});
  assert.equal(result.containerId,'ig-container');assert.equal(calls.length,2);assert.equal(calls[1].url,'https://graph.facebook.com/v25.0/ig-user/media');
 }finally{globalThis.fetch=original;}
});

test('Blogger deletion targets the published post and requires API success',async()=>{
 const original=globalThis.fetch,calls=[];saveSecret('blog-delete',{token:'blog-token',expiresAt:Date.now()+60000});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(null,{status:204});};
  await deletePublication({id:'blog-delete',provider:'blogger',mode:'api',status:'connected',accountId:'123',name:'Blog'},{externalId:'456'});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://www.googleapis.com/blogger/v3/blogs/123/posts/456');assert.equal(calls[0].options.method,'DELETE');assert.equal(calls[0].options.headers.Authorization,'Bearer blog-token');
  globalThis.fetch=async()=>Response.json({error:{message:'Post not found'}},{status:404});
  await assert.rejects(deletePublication({id:'blog-delete',provider:'blogger',mode:'api',status:'connected',accountId:'123',name:'Blog'},{externalId:'missing'}),/Post not found/);
 }finally{globalThis.fetch=original;}
});

test('YouTube and Threads deletion target the original remote publication',async()=>{
 const original=globalThis.fetch,calls=[];
 saveSecret('youtube-delete',{token:'youtube-token',expiresAt:Date.now()+60000});
 saveSecret('threads-delete',{token:'threads-token',expiresAt:Date.now()+60000});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(null,{status:204});};
  await deletePublication({id:'youtube-delete',provider:'youtube',mode:'assisted',status:'connected',name:'YouTube'},{externalId:'video-1'});
  await deletePublication({id:'threads-delete',provider:'threads',mode:'api',status:'connected',name:'Threads'},{externalId:'thread-1'});
  assert.equal(calls[0].url,'https://www.googleapis.com/youtube/v3/videos?id=video-1');
  assert.equal(calls[0].options.headers.Authorization,'Bearer youtube-token');
  assert.equal(calls[1].url,'https://graph.threads.net/v1.0/thread-1');
  assert.equal(calls[1].options.headers.Authorization,'Bearer threads-token');
 }finally{globalThis.fetch=original;}
});

test('YouTube update preserves required metadata and edits title and description',async()=>{
 const original=globalThis.fetch,calls=[];saveSecret('youtube-update',{token:'youtube-token',expiresAt:Date.now()+60000});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});if((options?.method||'GET')==='GET')return Response.json({items:[{snippet:{title:'Old',description:'Old body',categoryId:'22',tags:['tag']}}]});return Response.json({id:'video-1'});};
  const result=await updatePublication({id:'youtube-update',provider:'youtube',mode:'assisted',status:'connected',name:'YouTube'},{externalId:'video-1'},{title:'Tên mới',caption:'Mô tả mới'});
  assert.equal(calls[0].url,'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=video-1');
  assert.equal(calls[1].url,'https://www.googleapis.com/youtube/v3/videos?part=snippet');
  assert.equal(calls[1].options.method,'PUT');
  assert.deepEqual(JSON.parse(calls[1].options.body),{id:'video-1',snippet:{title:'Tên mới',description:'Mô tả mới',categoryId:'22',tags:['tag']}});
  assert.equal(result.url,'https://www.youtube.com/watch?v=video-1');
 }finally{globalThis.fetch=original;}
});

test('Blogger refuses to publish broken external media instead of creating a post with a broken image',async()=>{
 const original=globalThis.fetch,calls=[];saveSecret('blog-media',{token:'blog-token',expiresAt:Date.now()+60000});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response('missing',{status:404,headers:{'Content-Type':'text/html'}});};
  await assert.rejects(publish({id:'blog-media',provider:'blogger',accountId:'123'},{type:'image',title:'Ảnh',caption:'Nội dung',mediaUrl:'https://media.example.test/image.png'}),/trả về 404/);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://media.example.test/image.png');
 }finally{globalThis.fetch=original;}
});

test('Blogger update edits the original post ID instead of creating a duplicate',async()=>{
 const original=globalThis.fetch,calls=[];saveSecret('blog-update',{token:'blog-token',expiresAt:Date.now()+60000});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return Response.json({id:'456',url:'https://blog.example/post'});};
  await updatePublication({id:'blog-update',provider:'blogger',mode:'api',status:'connected',accountId:'123',name:'Blog'},{externalId:'456',url:'https://blog.example/post'},{type:'text',title:'Tên mới',caption:'Nội dung mới',mediaUrl:''});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://www.googleapis.com/blogger/v3/blogs/123/posts/456');assert.equal(calls[0].options.method,'PATCH');const body=JSON.parse(calls[0].options.body);assert.equal(body.id,'456');assert.equal(body.title,'Tên mới');assert.match(body.content,/Nội dung mới/);
 }finally{globalThis.fetch=original;}
});

test('DEV.to update edits the original article instead of scheduling a duplicate',async()=>{
 const original=globalThis.fetch,calls=[];saveSecret('devto-update',{token:'devto-key'});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return Response.json({id:789,url:'https://dev.to/example/article'});};
  const result=await updatePublication({id:'devto-update',provider:'devto',mode:'api',status:'connected',name:'DEV.to'},{externalId:'789',url:'https://dev.to/example/article'},{type:'text',title:'Tên mới',caption:'Nội dung mới',mediaUrl:''});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://dev.to/api/articles/789');assert.equal(calls[0].options.method,'PUT');assert.equal(calls[0].options.headers['api-key'],'devto-key');const body=JSON.parse(calls[0].options.body);assert.equal(body.article.title,'Tên mới');assert.equal(body.article.body_markdown,'Nội dung mới');assert.equal(result.url,'https://dev.to/example/article');
 }finally{globalThis.fetch=original;}
});

test('DEV.to removal unpublishes the article because author API cannot delete it',async()=>{
 const original=globalThis.fetch,calls=[];saveSecret('devto-delete',{token:'devto-key'});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return Response.json({id:789,published:false});};
  const result=await deletePublication({id:'devto-delete',provider:'devto',mode:'api',status:'connected',name:'DEV.to'},{externalId:'789'});
  assert.equal(calls[0].url,'https://dev.to/api/articles/789');assert.equal(calls[0].options.method,'PUT');assert.equal(calls[0].options.headers['api-key'],'devto-key');assert.deepEqual(JSON.parse(calls[0].options.body),{article:{published:false}});assert.equal(result.unpublished,true);
 }finally{globalThis.fetch=original;}
});

test('X refreshes an expired OAuth token before publishing',async()=>{
 const original=globalThis.fetch,calls=[];saveSecret('x-refresh',{token:'expired-token',refreshToken:'refresh-token',expiresAt:Date.now()-1000});
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fresh-token',refresh_token:'rotated-token',expires_in:7200});return Response.json({data:{id:'tweet-1'}});};
  const result=await publish({id:'x-refresh',provider:'x',accountId:'user-1'},{caption:'Nội dung X',type:'text'});
  assert.equal(result.externalId,'tweet-1');assert.equal(calls.length,2);assert.equal(calls[0].url,'https://api.x.com/2/oauth2/token');assert.equal(calls[1].options.headers.Authorization,'Bearer fresh-token');
 }finally{globalThis.fetch=original;}
});
