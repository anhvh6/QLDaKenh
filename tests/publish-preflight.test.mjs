import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
mkdirSync('test-data', { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(resolve('test-data'), 'preflight-'));
process.env.PLAN_REMOTE_CATALOG = '0';
const { put, all, get } = await import('../server/store.mjs');
const { publicationPreflight } = await import('../server/publish-preflight.mjs');
const {assertPublicationPreflight}=await import('../server/publish-preflight.mjs');
const {publishReviewHTML}=await import('../public/publish-review.js');
const { schedule } = await import('../server/domain.mjs');
const { scheduleCopied } = await import('../server/social-copy.mjs');
const owner = { id: 'qa', role: 'owner' };
for (const provider of ['threads','instagram','youtube','tiktok','facebook']) put('connections', { id: provider, name: provider, provider, mode: 'api', status: 'connected' });
const content = (extra = {}) => ({ id: 'qa-content', title: 'QA', caption: 'Nội dung 💚', type: 'text', channels: ['threads'], assets: [], ...extra });
test('manual composer text rules become explicit warnings but require acknowledgement',()=>{
 const c=content({id:'advisory-test',caption:'a'.repeat(501)}),input={immediate:true,reviewWarnings:true,advisoryRules:true};
 const review=publicationPreflight(owner,c,input);assert.equal(review.ok,true);assert.equal(review.requiresAcknowledgement,true);assert.ok(review.warnings.some(w=>w.code==='text_caption'));
 assert.throws(()=>assertPublicationPreflight(owner,c,input));assert.doesNotThrow(()=>assertPublicationPreflight(owner,c,{...input,warningAcknowledgement:review.reviewToken}));
 assert.equal(publicationPreflight(owner,{...c,caption:'b'.repeat(502)},{...input,warningAcknowledgement:review.reviewToken}).requiresAcknowledgement,true);
 const stored=put('contents',c),jobs=schedule(owner,c.id,{...input,version:stored.version,warningAcknowledgement:review.reviewToken});assert.ok(jobs.length);assert.equal(jobs[0].contentReview.advisoryRules,true);assert.equal(jobs[0].contentReview.acknowledgedBy,owner.id);
});
test('advisory rules cannot bypass missing media, duplicate posts or disconnected channels',()=>{
 const review=publicationPreflight(owner,content({channels:['youtube'],type:'video'}),{immediate:true,advisoryRules:true});assert.equal(review.ok,false);assert.ok(review.issues.some(i=>i.message.includes('media')||i.message.includes('video')));
 put('connections',{id:'lost',provider:'threads',mode:'api',status:'disconnected'});assert.equal(publicationPreflight(owner,content({channels:['lost']}),{immediate:true,advisoryRules:true}).ok,false);
});

test('aggregates every destination error and respects channel-specific caption without mutating records', () => {
 const before = all('publications').length;
 const c = content({ caption: 'a'.repeat(2201), channels: ['threads','instagram'], variants: { threads: { caption: 'Ngắn' } } });
 const result = publicationPreflight(owner, c, { immediate: true });
 assert.equal(result.ok, false);assert.ok(result.issues.every(i => i.channelId === 'instagram'));
 assert.ok(result.issues.some(i => i.message.includes('2201/2200')));
 assert.ok(result.issues.some(i => i.channelId==='instagram'&&i.message.includes('cần ảnh hoặc video')));
 assert.equal(all('publications').length, before);
 assert.equal(publicationPreflight(owner, content({caption:'💚'.repeat(500)}), {immediate:true}).ok, true);
});

test('checks YouTube UTF-8 bytes and TikTok UTF-16 rather than silently cutting captions', () => {
 const video = put('assets', { type: 'video', active: true });
 const result = publicationPreflight(owner, content({type:'video',assets:[video.id],channels:['youtube','tiktok'],title:'t'.repeat(101),caption:'💚'.repeat(1300)}), {immediate:true});
 assert.ok(result.issues.some(i => i.channelId === 'youtube' && i.message.includes('101/100')));
 assert.ok(result.issues.some(i => i.channelId === 'youtube' && i.message.includes('5200/5000')));
 assert.ok(result.issues.some(i => i.channelId === 'tiktok' && i.message.includes('2600/2200')));
});

test('source Reup is rejected before Drive download and scheduling also checks server-side', async () => {
 const source = put('copy_posts',{userId:owner.id,media:[{type:'video',url:'https://example.com/v.mp4'}]});
 const c = put('contents',content({caption:'a'.repeat(501),type:'video',sourceCopyId:source.id}));
 const beforeJobs = all('copy_jobs').length, beforePubs = all('publications').length;
 await assert.rejects(scheduleCopied(owner,c.id,{version:c.version,immediate:true}), /501\/500/);
 assert.equal(all('copy_jobs').length,beforeJobs);assert.equal(all('publications').length,beforePubs);
 assert.throws(()=>schedule(owner,c.id,{version:c.version,immediate:true}), /501\/500/);
 assert.equal(get('contents',c.id).status,undefined);
 assert.equal(publicationPreflight(owner,c,{scheduleAt:new Date(Date.now()+1000).toISOString()}).issues.some(i=>i.message.includes('10 phút')),true);
});

test('source media is checked before import; valid future source can proceed to download', () => {
 const source = put('copy_posts',{userId:owner.id,media:[{type:'image'},{type:'video'}]});
 const c=content({type:'video',channels:['facebook'],sourceCopyId:source.id});
 assert.ok(publicationPreflight(owner,c,{immediate:true}).issues.some(i=>i.message.includes('album ảnh')));
 assert.equal(publicationPreflight(owner,{...c,channels:['threads']},{scheduleAt:new Date(Date.now()+3600000).toISOString()}).ok,true);
});

test('pending source video supports Instagram and YouTube before download; per-channel text ignores source album',()=>{
 const post=put('copy_posts',{id:'format-source',userId:owner.id,media:[{type:'video'}]});const c=content({sourceCopyId:post.id,type:'video',channels:['instagram','youtube']});assert.equal(publicationPreflight(owner,c,{immediate:true}).ok,true);
 const imagePost=put('copy_posts',{id:'format-images',userId:owner.id,media:[{type:'image'},{type:'image'}]});const textOnly=content({sourceCopyId:imagePost.id,type:'image',channels:['threads','youtube'],variants:{threads:{type:'text'},youtube:{type:'video'}}});const review=publicationPreflight(owner,textOnly,{immediate:true});assert.equal(review.issues.some(i=>i.channelId==='threads'),false);assert.ok(review.issues.some(i=>i.channelId==='youtube'&&/Thiếu media/.test(i.message)));
 const bad=publicationPreflight(owner,content({channels:['instagram','youtube']}),{immediate:true});assert.ok(bad.issues.some(i=>/Instagram cần ảnh hoặc video/.test(i.message)));assert.ok(bad.issues.some(i=>/YouTube cần video/.test(i.message)));
});

test('manual immediate and scheduled posts pause for warnings and store explicit review acknowledgement',()=>{
 for(const immediate of [true,false]){
  const c=put('contents',content({id:'warning-'+immediate,channels:['facebook'],caption:'Cam kết hiệu quả 100% cho mọi người.'})),input={version:c.version,immediate,reviewWarnings:true,scheduleAt:new Date(Date.now()+3600000).toISOString()},before=all('publications').length;
  const review=publicationPreflight(owner,c,input);assert.equal(review.ok,true);assert.ok(review.warnings.some(w=>w.code==='absolute_claim'));assert.equal(review.requiresAcknowledgement,true);
  assert.throws(()=>schedule(owner,c.id,input),/cảnh báo/);assert.equal(all('publications').length,before);
  const publications=schedule(owner,c.id,{...input,warningAcknowledgement:review.reviewToken});assert.equal(publications.length,1);assert.equal(publications[0].contentReview.acknowledgedBy,owner.id);assert.equal(publications[0].contentReview.reviewToken,review.reviewToken);
 }
});
test('reviews destination variants and actual reup title/body, invalidates changed text and never overrides hard errors',()=>{
 const c=content({id:'review-variants',channels:['youtube','facebook'],sourceURL:'https://source.example/post',caption:'Cam kết hiệu quả 100%\nNội dung thường',type:'video',variants:{facebook:{caption:'Bài bình thường'}}}),video=put('assets',{type:'video',active:true});c.assets=[video.id];
 const review=publicationPreflight(owner,c,{immediate:true});assert.ok(review.warnings.some(w=>w.channelId==='youtube'&&w.field==='title'&&w.code==='absolute_claim'));assert.equal(review.warnings.some(w=>w.channelId==='facebook'&&w.code==='absolute_claim'),false);assert.equal(review.warnings.some(w=>w.code==='reup_rights'),false);
 const edited={...c,variants:{...c.variants,facebook:{caption:'Cam kết hiệu quả 100%'}}};assert.throws(()=>assertPublicationPreflight(owner,edited,{immediate:true,reviewWarnings:true,warningAcknowledgement:review.reviewToken}),/cảnh báo/);
 const invalid={...c,title:'t'.repeat(101),sourceURL:null,caption:'Mô tả',variants:{}};const errors=publicationPreflight(owner,invalid,{immediate:true});assert.throws(()=>assertPublicationPreflight(owner,invalid,{immediate:true,reviewWarnings:true,warningAcknowledgement:errors.reviewToken}),/101\/100/);
});
test('manual reup blocks download before warning acknowledgement and acknowledgement survives preparation',async()=>{
 const source=put('copy_posts',{userId:owner.id,media:[{type:'video',url:'https://example.com/v.mp4'}]}),c=put('contents',content({id:'review-reup',type:'video',caption:'Cam kết hiệu quả 100%',channels:['facebook'],sourceCopyId:source.id})),input={version:c.version,immediate:true,reviewWarnings:true},before=all('copy_jobs').length,review=publicationPreflight(owner,c,input);
 await assert.rejects(()=>scheduleCopied(owner,c.id,input),/cảnh báo/);assert.equal(all('copy_jobs').length,before);
 const asset=put('assets',{type:'video',active:true}),ready={...c,version:c.version+1,copyReady:true,assets:[asset.id]};assert.doesNotThrow(()=>assertPublicationPreflight(owner,ready,{...input,warningAcknowledgement:review.reviewToken},{prepared:true}));
});
test('review UI escapes excerpts, offers both choices for warnings, and forbids continuing on errors',()=>{
 const review={issues:[],warnings:[{channel:'Facebook',field:'caption',message:'Kiểm tra',excerpt:'<script>alert(1)</script>'}]},html=publishReviewHTML(review,'now');assert.ok(html.includes('Quay lại sửa'));assert.ok(html.includes('Vẫn đăng ngay'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 assert.ok(publishReviewHTML(review,'schedule').includes('Vẫn lên lịch'));assert.ok(!publishReviewHTML({...review,issues:[{channel:'YouTube',message:'Thiếu video'}]},'now').includes('data-publish-continue'));
});

test('reup alone creates no rights accusation or acknowledgement gate',()=>{
 const asset=put('assets',{type:'video',active:true});
 const review=publicationPreflight(owner,content({id:'ordinary-reup',sourceURL:'https://example.test/reup/ordinary',channels:['facebook'],type:'video',assets:[asset.id],caption:'Một buổi sáng bình yên.'}),{immediate:true,reviewWarnings:true});
 assert.equal(review.ok,true);assert.deepEqual(review.warnings,[]);assert.equal(review.requiresAcknowledgement,false);
});

test('same-content and source-history duplicate checks emit one blocking issue per channel',()=>{
 const c=put('contents',content({id:'history-reup',sourceURL:'https://www.youtube.com/watch?v=preflight-history-qa',channels:['facebook','facebook']}));
 put('publications',{contentId:c.id,connectionId:'facebook',status:'published'});
 const review=publicationPreflight(owner,c,{immediate:true});
 assert.equal(review.issues.filter(i=>i.code==='publication_history').length,1);assert.equal(review.issues.length,1);assert.equal(review.ok,false);
});

test('pending publication on one channel does not block other selected channels',()=>{
 const c=content({id:'pending-scoped',channels:['threads','facebook']});put('publications',{contentId:c.id,connectionId:'threads',status:'processing'});
 const review=publicationPreflight(owner,c,{immediate:true});assert.equal(review.issues.filter(i=>i.channelId==='facebook').length,0);assert.equal(review.issues.filter(i=>i.channelId==='threads').length,1);
});

test('identical warning messages are shown once with affected account names',()=>{
 const item={code:'absolute_claim',field:'caption',message:'Kiểm tra cam kết',excerpt:'100%'};
 const html=publishReviewHTML({issues:[],warnings:[{...item,channel:'Page A'},{...item,channel:'Page B'},{...item,channel:'Page A'}]},'now');
 assert.equal((html.match(/Kiểm tra cam kết/g)||[]).length,1);assert.ok(html.includes('Page A, Page B'));assert.ok(html.includes('data-publish-continue'));
});
