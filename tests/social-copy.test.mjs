import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'social-copy-'));process.env.PLAN_REMOTE_CATALOG='0';
const {get,put,all,saveSecret,dataDir}=await import('../server/store.mjs');
const {sourceURL,privateIP,manifest,copyRoute,processCopyJob,copyArchive,publishMedia,publicCopyMedia,recoverCopyJobs,scheduleCopied}=await import('../server/social-copy.mjs');
const {editRecord,schedule}=await import('../server/domain.mjs');
const owner={id:'copy-owner',role:'owner'},peer={id:'copy-peer',role:'owner'},viewer={id:'viewer',role:'viewer'};
const route=(path,method,input={},user=owner,deps={})=>copyRoute(path,method,input,user,new URL('https://example.com'+path),deps);
test('recognizes social platforms and rejects hostile URLs',()=>{
 for(const [url,provider] of [['https://www.facebook.com/share/p/abc/','facebook'],['https://www.tiktok.com/@qa/video/123','tiktok'],['https://youtu.be/abc','youtube']])assert.equal(sourceURL(url).provider,provider);
 for(const url of ['file:///etc/passwd','https://facebook.com.evil.test/x','http://facebook.com/x','https://user:password@facebook.com/x','https://127.0.0.1/x'])assert.throws(()=>sourceURL(url));
 for(const ip of ['127.0.0.1','169.254.169.254','172.16.1.1','192.168.0.1','::1','::ffff:127.0.0.1'])assert.equal(privateIP(ip),true);
 assert.equal(privateIP('8.8.8.8'),false);
});
test('automatic Python discovery waits for subprocess result rather than resolving to interpreter path',async()=>{
 const {runExtractor}=await import('../server/social-copy.mjs'),previous=process.env.SOCIAL_COPY_PYTHON;delete process.env.SOCIAL_COPY_PYTHON;const folder=join(dataDir,'zip-check');mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'caption.txt'),'QA');
 try{const result=await runExtractor({action:'zip',folder});assert.equal(typeof result,'object');assert.equal(result.ok,true);}catch(error){assert.match(error.message,/Chưa cài bộ tải|not found|not recognized/);}finally{if(previous)process.env.SOCIAL_COPY_PYTHON=previous;}
});
let post;
test('preview and Reup preserve exact caption and order; Reup does not download until publishing',async()=>{
 const caption='💚 Xin chào\nNội dung nguyên bản  #hashtag';post=await route('/api/copy/preview','POST',{url:'https://www.facebook.com/reel/123'},owner,{extract:async()=>({title:'Bài gốc',caption,author:'Tác giả',engine:'gallery',media:[{url:'https://cdn.example/a.jpg',type:'image',ext:'jpg'},{url:'https://cdn.example/b.jpg',type:'image',ext:'jpg'}]})});
 assert.equal(post.caption,caption);const before=all('copy_jobs').length,c=await route('/api/copy/reup','POST',{postId:post.id});assert.equal(c.caption,caption);assert.equal(c.sourceCopyId,post.id);assert.deepEqual(c.assets,[]);assert.equal(all('copy_jobs').length,before);
 await assert.rejects(route('/api/copy/reup','POST',{postId:post.id},peer),{status:404});await assert.rejects(route('/api/copy/preview','POST',{url:post.url},viewer),{status:403});
 const m=manifest(post,[{name:'001.jpg',type:'image',mime:'image/jpeg',driveId:'first'},{name:'002.jpg',type:'image',mime:'image/jpeg',driveId:'second'}]);assert.equal(m.caption,caption);assert.deepEqual(m.media.map(x=>x.driveId),['first','second']);
});
test('device job finishes only after all files/ZIP exist, exposes archive to its owner, and keeps errors durable',async()=>{
 const job=put('copy_jobs',{id:'test-package',userId:owner.id,postId:post.id,target:'device',status:'queued'}),folder=join(dataDir,'social-copy',job.id);mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'001.jpg'),Buffer.from([255,216,255,217]));
 await processCopyJob(job,{packagePost:async()=>({folder,files:[{name:'001.jpg',type:'image',mime:'image/jpeg'}]}),extract:async()=>writeFileSync(folder+'.zip','test archive')});
 const done=get('copy_jobs',job.id);assert.equal(done.status,'done');assert.equal(done.assets.length,1);assert.equal(copyArchive(owner,job.id),folder+'.zip');assert.throws(()=>copyArchive(peer,job.id),{status:404});
 const bad=put('copy_jobs',{id:'failed-package',userId:owner.id,postId:post.id,target:'device',status:'queued'});await processCopyJob(bad,{packagePost:async()=>{throw new Error('Nguồn chặn tải');}});assert.equal(get('copy_jobs',bad.id).status,'failed');assert.equal(get('copy_jobs',bad.id).error,'Nguồn chặn tải');
 const interrupted=put('copy_jobs',{id:'interrupted',userId:owner.id,status:'uploading'});recoverCopyJobs();assert.equal(get('copy_jobs',interrupted.id).status,'failed');
});
test('Drive credentials never returned; requires owner configuration and personal connection',async()=>{
 await assert.rejects(route('/api/drive/config','POST',{publicOrigin:'https://example.com'}, {id:'editor',role:'editor'}),{status:403});
 await route('/api/drive/config','POST',{publicOrigin:'https://example.com',clientId:'client',clientSecret:'secret-value'});const state=await route('/api/drive/config','GET');assert.equal(state.configured,true);assert.equal(state.connected,false);assert.equal(JSON.stringify(state).includes('secret-value'),false);
 await assert.rejects(route('/api/copy/download','POST',{postId:post.id,target:'drive'}),/Kết nối Google Drive/);
 const c=await route('/api/copy/reup','POST',{postId:post.id});put('connections',{id:'copy-demo',name:'QA',mode:'demo',provider:'facebook',status:'connected'});const ready=put('contents',{...c,channels:['copy-demo']});await assert.rejects(scheduleCopied(owner,ready.id,{version:ready.version,immediate:true}),/Kết nối Google Drive/);assert.equal(all('copy_jobs').filter(j=>j.contentId===c.id).length,0);
});
test('signed media only grants exact source asset until expiration; publishing preserves ordered album URLs',()=>{
 const a=put('assets',{id:'signed-copy',url:'/uploads/signed.jpg',copyJobId:'job',type:'image'}),b=put('assets',{id:'signed-copy-2',url:'/uploads/signed2.jpg',copyJobId:'job',type:'image'});const url=new URL(publishMedia(a)),expiry=url.searchParams.get('expires'),token=url.searchParams.get('token');assert.equal(publicCopyMedia(a.id,expiry,token),join(dataDir,'uploads','signed.jpg'));assert.throws(()=>publicCopyMedia(b.id,expiry,token),{status:403});assert.throws(()=>publicCopyMedia(a.id,'1',token),{status:403});
 const c=put('contents',{id:'ready-copy',title:'QA',caption:post.caption,channels:['copy-demo'],copyReady:true,assets:[a.id,b.id],type:'image'}),jobs=schedule(owner,c.id,{version:c.version,immediate:true});assert.equal(jobs[0].caption,post.caption);assert.deepEqual(jobs[0].mediaItems.map(m=>new URL(m.url).pathname),['/api/copy/public-media/signed-copy','/api/copy/public-media/signed-copy-2']);
 const edited=editRecord(owner,'contents',c.id,{title:'Edited',version:get('contents',c.id).version,copyReady:false,sourceCopyId:'forged'});assert.equal(edited.copyReady,true);assert.equal(edited.sourceCopyId,undefined);
});
test('Drive job uploads ordered media and reusable manifest before announcing completion',async()=>{
 saveSecret('drive-'+owner.id,{refreshToken:'qa-refresh',folderId:'qa-root'});const job=put('copy_jobs',{id:'drive-test',userId:owner.id,role:owner.role,postId:post.id,target:'drive',status:'queued'}),folder=join(dataDir,'social-copy',job.id);mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'001.jpg'),'first');writeFileSync(join(folder,'002.jpg'),'second');writeFileSync(join(folder,'caption.txt'),post.caption);let session=0;const uploaded=[],originalFetch=global.fetch;
 global.fetch=async(url,options={})=>{url=String(url);if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'qa-access'});if(url.includes('uploadType=resumable')){uploaded.push(JSON.parse(options.body).name);return new Response('',{status:200,headers:{location:'https://www.googleapis.com/upload/session/'+(++session)}});}if(url.includes('/upload/session/')){for await(const chunk of options.body){}return Response.json({id:'file-'+session});}if(url.includes('/drive/v3/files?fields='))return Response.json({id:'post-folder'});throw new Error('Unexpected URL '+url);};
 try{await processCopyJob(job,{packagePost:async()=>({folder,files:[{name:'001.jpg',type:'image',mime:'image/jpeg'},{name:'002.jpg',type:'image',mime:'image/jpeg'}]}),extract:async()=>writeFileSync(folder+'.zip','zip')});assert.equal(get('copy_jobs',job.id).status,'done');assert.deepEqual(uploaded,['001.jpg','002.jpg','caption.txt','post.json']);const m=JSON.parse(readFileSync(join(folder,'post.json')));assert.equal(m.caption,post.caption);assert.deepEqual(m.media.map(m=>m.driveId),['file-1','file-2']);}finally{global.fetch=originalFetch;}
});
test('selecting a Drive package loads caption and ordered media in background without uploading it again',async()=>{
 const original=global.fetch;let uploads=0;const m=manifest(post,[{name:'001.jpg',type:'image',mime:'image/jpeg',driveId:'d-one'},{name:'002.jpg',type:'image',mime:'image/jpeg',driveId:'d-two'}]);m.media.reverse();
 global.fetch=async(url)=>{url=String(url);if(url.includes('/upload/')){uploads++;throw new Error('Import must not reupload');}if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'qa-access'});if(url.includes('alt=media'))return Response.json(m);return Response.json({files:[{id:'manifest-file',name:'post.json'},{id:'d-one',name:'001.jpg'},{id:'d-two',name:'002.jpg'}]});};
 try{const result=await route('/api/drive/import','POST',{folderId:'post-folder'},owner,{packagePost:async(p,j)=>{assert.deepEqual(p.media.map(m=>m.driveId),['d-one','d-two']);const folder=join(dataDir,'social-copy',j.id);mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'001.jpg'),'one');writeFileSync(join(folder,'002.jpg'),'two');return {folder,files:p.media};},extract:async req=>writeFileSync(req.folder+'.zip','zip')});assert.equal(result.preparing,true);for(let i=0;i<30&&get('copy_jobs',result.job.id).status!=='done';i++)await new Promise(r=>setTimeout(r,10));const c=get('contents',result.contentId);assert.equal(c.caption,post.caption);assert.equal(c.copyReady,true);assert.equal(c.assets.length,2);assert.equal(c.driveFolderId,'post-folder');assert.equal(uploads,0);}finally{global.fetch=original;}
});
test('carousel waits for child processing, persists parent, then publishes; Facebook album keeps every image',async()=>{
 const {publish,continuePublish}=await import('../server/connectors.mjs');const original=global.fetch,requests=[];let childrenReady=false;
 saveSecret('carousel-ig',{token:'qa-ig'});saveSecret('album-fb',{token:'qa-fb'});
 global.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;requests.push({url:String(url),body});if(String(url).includes('?fields=status_code'))return Response.json({status_code:childrenReady?'FINISHED':'IN_PROGRESS'});if(String(url).includes('media_publish'))return Response.json({id:'published'});if(String(url).includes('?fields=permalink'))return Response.json({permalink:'https://www.instagram.com/p/published/'});return Response.json({id:'container-'+requests.length});};
 try{const ig={id:'carousel-ig',accountId:'ig-account',provider:'instagram',apiVersion:'v25.0'},postData={type:'image',caption:post.caption,mediaItems:[{type:'image',url:'https://cdn.test/1.jpg'},{type:'image',url:'https://cdn.test/2.jpg'}]};const child=await publish(ig,postData);assert.equal(child.carouselPending,true);assert.equal(child.childContainerIds.length,2);assert.equal(requests.filter(r=>r.body?.media_type==='CAROUSEL').length,0);assert.equal(await continuePublish(ig,{...postData,...child}),null);childrenReady=true;const parent=await continuePublish(ig,{...postData,...child});assert.equal(parent.processing,true);assert.equal(parent.carouselPending,false);assert.deepEqual(requests.find(r=>r.body?.media_type==='CAROUSEL').body.children,child.childContainerIds.join(','));const done=await continuePublish(ig,{...postData,...parent});assert.equal(done.externalId,'published');requests.length=0;await publish({id:'album-fb',provider:'facebook',accountId:'page',apiVersion:'v25.0'},postData);assert.equal(requests.length,3);assert.equal(requests[2].body.attached_media.length,2);assert.equal(requests[2].body.message,post.caption);}finally{global.fetch=original;}
});
test('Reup preserves long Unicode caption and accepted future schedule after background preparation',()=>{
 const caption='💚 Bài viết #nguyenban\n'.repeat(2000),c=editRecord(owner,'contents',null,{title:'Bài dài',caption,type:'text',channels:['copy-demo'],assets:[]});assert.equal(c.caption,caption);
 const scheduleAt=new Date(Date.now()+5*60000).toISOString();assert.throws(()=>schedule(owner,c.id,{version:c.version,scheduleAt}),/10 phút/);const [job]=schedule(owner,c.id,{version:c.version,scheduleAt},{prepared:true});assert.equal(job.caption,caption);assert.equal(job.scheduleAt,scheduleAt);
});
test('ZIP to Drive reuses saved files, keeps one library row, gates ownership, and tracks actual Reup',async()=>{
 const j=put('copy_jobs',{id:'promote-package',userId:owner.id,postId:post.id,title:post.title,target:'device',status:'done'}),folder=join(dataDir,'social-copy',j.id);
 mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'001.jpg'),'saved media');writeFileSync(join(folder,'post.json'),JSON.stringify(manifest(post,[{name:'001.jpg',type:'image',mime:'image/jpeg'}])));writeFileSync(folder+'.zip','saved zip');writeFileSync(join(folder,'caption.txt'),post.caption);
 await assert.rejects(route('/api/copy/save-drive','POST',{jobId:j.id},peer),{status:404});
 await assert.rejects(route('/api/copy/reup-job','POST',{jobId:j.id}),/Lưu bài/);
 const original=global.fetch;let uploads=0;
 global.fetch=async(url,options)=>{url=String(url);if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'qa-access'});if(url.includes('uploadType=resumable'))return new Response('',{headers:{location:'https://www.googleapis.com/upload/qa-session'}});if(url.includes('/upload/qa-session')){uploads++;return Response.json({id:'upload-'+uploads});}return Response.json({id:'promoted-folder'});};
 try{
  await route('/api/copy/save-drive','POST',{jobId:j.id},owner,{extract:async input=>{assert.equal(input.action,'zip');writeFileSync(input.folder+'.zip','new zip');}});
  for(let i=0;i<60&&get('copy_jobs',j.id).status!=='done';i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(get('copy_jobs',j.id).status,'done',get('copy_jobs',j.id).error);assert.equal(uploads,3);
  let row=(await route('/api/copy/jobs','GET')).find(x=>x.id===j.id);assert.equal(row.zipSaved,true);assert.equal(row.driveSaved,true);assert.equal(row.url,post.url);
  const c=await route('/api/copy/reup-job','POST',{jobId:j.id});assert.equal(c.copyReady,true);assert.equal(c.assets.length,1);
  assert.equal((await route('/api/copy/jobs','GET')).find(x=>x.id===j.id).reupPublished,false);
  put('publications',{id:'real-reup',contentId:c.id,status:'published'});assert.equal((await route('/api/copy/jobs','GET')).find(x=>x.id===j.id).reupPublished,true);
  await route('/api/copy/hide','POST',{jobId:j.id});assert.equal((await route('/api/copy/jobs','GET')).some(x=>x.id===j.id),false);assert.equal(get('contents',c.id).id,c.id);assert.equal(copyArchive(owner,j.id),folder+'.zip');
 }finally{global.fetch=original;}
});

test('video download handles extractor switching to direct gallery media',async()=>{
 const {packagePost}=await import('../server/social-copy.mjs');const original=global.fetch;global.fetch=async()=>new Response(new Uint8Array([1,2,3]));
 try{const pack=await packagePost({url:'https://www.tiktok.com/@qa/video/123',engine:'video',caption:'Exact #caption',media:[{type:'video'}]},{id:'switched-extractor'},{validate:async()=>({ok:true}),extract:async()=>({engine:'gallery',media:[{url:'https://8.8.8.8/video.mp4',ext:'mp4',type:'video'}]})});assert.equal(pack.files.length,1);assert.equal(pack.files[0].type,'video');assert.equal(readFileSync(join(pack.folder,'001.mp4')).length,3);assert.equal(JSON.parse(readFileSync(join(pack.folder,'post.json'))).caption,'Exact #caption');}finally{global.fetch=original;}
});

test('bulk delete trashes Drive folders once, keeps publications, checks ownership and preserves failed rows',async()=>{
 saveSecret('drive-'+owner.id,{refreshToken:'qa-refresh',folderId:'root-folder'});
 const rows=['delete-one','delete-two'].map(id=>put('copy_jobs',{id,userId:owner.id,postId:post.id,status:'done',folderId:'shared-folder',driveSaved:true}));put('publications',{id:'keep-published',contentId:'published-content',status:'published'});
 await assert.rejects(route('/api/copy/delete','POST',{jobIds:rows.map(j=>j.id)},peer),{status:404});
 const original=global.fetch;let trash=0;global.fetch=async(url,options)=>{if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'qa'});assert.equal(options.method,'PATCH');assert.deepEqual(JSON.parse(options.body),{trashed:true});trash++;return Response.json({id:'shared-folder'});};
 try{const result=await route('/api/copy/delete','POST',{jobIds:rows.map(j=>j.id)});assert.equal(result.results.every(r=>r.ok),true);assert.equal(trash,1);assert.ok(get('copy_jobs',rows[0].id).hiddenAt);assert.equal(get('publications','keep-published').status,'published');
 put('copy_jobs',{id:'denied-delete',userId:owner.id,status:'done',folderId:'denied-folder'});global.fetch=async url=>String(url).includes('oauth2.googleapis.com')?Response.json({access_token:'qa'}):Response.json({error:{message:'Denied'}},{status:403});const denied=await route('/api/copy/delete','POST',{jobIds:['denied-delete']});assert.equal(denied.results[0].ok,false);assert.equal(get('copy_jobs','denied-delete').hiddenAt,undefined);
 put('copy_jobs',{id:'busy-delete',userId:owner.id,status:'downloading'});await assert.rejects(route('/api/copy/delete','POST',{jobIds:['busy-delete']}),{status:409});await assert.rejects(route('/api/copy/delete','POST',{jobIds:'bad'}));
 }finally{global.fetch=original;}
});

test('audio-only extractor failure falls back to playable preview video and rejects audio responses',async()=>{
 const {packagePost}=await import('../server/social-copy.mjs'),original=global.fetch;
 const p={url:'https://www.tiktok.com/@qa/video/123',engine:'video',caption:'Caption',media:[{type:'video',ext:'mp3',url:'https://8.8.8.8/video.mp4'}]};
 try{global.fetch=async()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'video/mp4'}});const pack=await packagePost(p,{id:'preview-video-fallback'},{validate:async()=>({ok:true}),extract:async()=>{throw new Error('Only audio available');}});assert.equal(pack.files[0].name,'001.mp4');
 global.fetch=async()=>new Response('audio',{headers:{'Content-Type':'audio/mpeg'}});await assert.rejects(packagePost(p,{id:'reject-audio-fallback'},{validate:async()=>({ok:true}),extract:async()=>{throw new Error('Only audio');}}),/hợp lệ/);
 }finally{global.fetch=original;}
});

test('copy library reports active publication and publication failures independently from download status',async()=>{
 const source=put('copy_posts',{id:'publication-state-source',userId:owner.id,caption:'Isolated status fixture',media:[]});const j=put('copy_jobs',{id:'publication-state-library',userId:owner.id,postId:source.id,status:'done'});const c=put('contents',{id:'publication-state-content',copyJobId:j.id});put('publications',{id:'publication-state-pub',contentId:c.id,status:'processing',connectionId:'copy-demo'});let row=(await route('/api/copy/jobs','GET')).find(r=>r.id===j.id);assert.equal(row.reupPublishing,true);assert.equal(row.reupError,'');
 put('publications',{id:'publication-state-pub',contentId:c.id,status:'failed',error:'Provider rejected',connectionId:'copy-demo'});row=(await route('/api/copy/jobs','GET')).find(r=>r.id===j.id);assert.equal(row.reupPublishing,false);assert.equal(row.reupError,'Provider rejected');assert.equal(row.reupPublished,false);
});

test('failed-channel Reup preselects only that exact channel and rejects unrelated or successful publications',async()=>{
 const p=put('copy_posts',{id:'retry-platform-source',userId:owner.id,title:'Retry',caption:'Preserved text',media:[]}),j=put('copy_jobs',{id:'retry-platform-job',userId:owner.id,postId:p.id,status:'done',driveSaved:true,folderId:'drive-ready',assets:[]});put('connections',{id:'retry-threads-channel',provider:'threads',status:'connected',mode:'api'});put('connections',{id:'retry-facebook-channel',provider:'facebook',status:'connected',mode:'api'});const c=put('contents',{id:'retry-platform-original',sourceCopyId:p.id,copyJobId:j.id});put('publications',{id:'retry-platform-failed',connectionId:'retry-threads-channel',contentId:c.id,status:'failed',error:'Too long'});put('publications',{id:'retry-platform-success',connectionId:'retry-facebook-channel',contentId:c.id,status:'published',url:'https://facebook.com/existing'});
 const retry=await route('/api/copy/reup-job','POST',{jobId:j.id,publicationId:'retry-platform-failed'});assert.deepEqual(retry.channels,['retry-threads-channel']);assert.equal(retry.caption,'Preserved text');assert.equal(retry.copyRetryWarning,'Too long');assert.equal(all('publications').filter(x=>x.contentId===retry.id).length,0);
 await assert.rejects(route('/api/copy/reup-job','POST',{jobId:j.id,publicationId:'retry-platform-success'}),{status:409});await assert.rejects(route('/api/copy/reup-job','POST',{jobId:j.id,publicationId:'real-reup'}),{status:404});await assert.rejects(route('/api/copy/reup-job','POST',{jobId:j.id,publicationId:'retry-platform-failed'},peer),{status:404});assert.equal((await route('/api/copy/publication-url','POST',{jobId:j.id,publicationId:'retry-platform-success'})).url,'https://facebook.com/existing');
});

test('Threads container creation timeout is failed safely rather than an ambiguous visible publication',async()=>{
 const {publish}=await import('../server/connectors.mjs'),original=global.fetch;saveSecret('threads-timeout',{token:'qa-token'});global.fetch=async()=>{throw new Error('Network timeout');};try{await assert.rejects(publish({id:'threads-timeout',provider:'threads',accountId:'qa'},{type:'text',caption:'QA'}),e=>e.unknown===false&&/chưa được xuất bản/.test(e.message));}finally{global.fetch=original;}
});

test('Threads long caption fails synchronously before creating publication jobs',()=>{
 put('connections',{id:'threads-limit-check',provider:'threads',status:'connected',mode:'api'});const c=put('contents',{id:'threads-limit-content',title:'Long caption',caption:'a'.repeat(501),type:'text',channels:['threads-limit-check'],assets:[],status:'draft'}),before=all('publications').length;assert.throws(()=>schedule(owner,c.id,{version:c.version,immediate:true}),/500 ký tự/);assert.equal(all('publications').length,before);assert.equal(get('contents',c.id).status,'draft');
});
