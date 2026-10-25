import test from 'node:test';
import assert from 'node:assert/strict';
import {contentLabel,contentHasWarning,contentWarnings,sourcePreviewImage} from '../public/content-presentation.js';
import {libraryMatches} from '../public/content-library-model.js';
test('caption replaces placeholder title without mutating published records',()=>{
 const c={id:'c',title:'.',caption:'Combo mặt lệch + Há miệng'},before=structuredClone(c);
 assert.equal(contentLabel(c),c.caption);assert.deepEqual(c,before);
 assert.equal(contentLabel({...c,caption:'.'},[{contentId:'c',copySourceCaption:'Nội dung nguồn',caption:'Nội dung riêng'}]),'Nội dung nguồn');
 assert.equal(contentLabel({title:'…',sourcePreview:{caption:'Nguồn đã lưu'}}),'Nguồn đã lưu');
 assert.equal(contentLabel({title:'.',caption:'.'}),'Bài viết chưa có nội dung văn bản');
});
test('source thumbnail never points to a video stream or unsafe URL',()=>{
 for(const url of ['javascript:alert(1)','http://example.test/cover.jpg','https://example.test/a.mp4?token=1','https://example.test/a.m3u8'])assert.equal(sourcePreviewImage({sourcePreview:{thumbnail:url}}),'');
 assert.equal(sourcePreviewImage({sourcePreview:{thumbnail:'https://example.test/cover.jpg'}}),'https://example.test/cover.jpg');
});
test('Warning filter only accepts draft status with a concrete current warning',()=>{
 const filters={statuses:['warning'],from:'2026-10-24',to:'2026-10-25',providers:null};
 for(const status of ['published','failed','scheduled','blocked','unknown','processing','awaiting_manual','demo_published'])assert.equal(libraryMatches({status,warning:true,at:'2026-10-25'},filters),false,status);
 assert.equal(libraryMatches({status:'draft',warning:true,at:'2026-10-25'},filters),true);
 assert.equal(libraryMatches({status:'draft',warning:false,at:'2026-10-25'},filters),false);
});
test('draft warnings are computed before opening the editor, respect channels and clear after editing',()=>{
 const channels=[{id:'th',provider:'threads',name:'Threads'},{id:'fb',provider:'facebook'}],c={id:'draft',channels:['th','fb'],title:'.',caption:'a'.repeat(929),sourceCopyId:'source'};
 assert.match(contentWarnings(c,channels)[0].message,/929\/500/);
 assert.equal(contentWarnings(c,[channels[1]]).length,0);
 assert.equal(contentWarnings({...c,caption:'Caption đã sửa'},channels).length,0);
 assert.equal(libraryMatches({status:'draft',warning:contentWarnings(c,channels).length>0,at:'2026-10-25'},{statuses:['warning'],providers:null,from:'2026-10-24',to:'2026-10-26'}),true);
 assert.ok(contentWarnings({...c,caption:'Cam kết giảm vĩnh viễn'},channels).some(w=>w.code==='absolute_claim'));
});
test('non-drafts never acquire a Warning status from text limits or historical reviews',()=>{
 const channels=[{id:'th',provider:'threads'}],c={id:'c',status:'draft',channels:['th'],caption:'x'.repeat(700)};
 for(const status of ['scheduled','dispatching','processing','awaiting_manual','published','manually_confirmed','demo_published','failed','blocked','unknown']){
  const pub={contentId:'c',connectionId:'th',status,caption:c.caption,textRuleBlocked:true,contentReview:{warnings:[{message:'Old warning'}]}};
  assert.deepEqual(contentWarnings(c,channels,[pub]),[],status);
 }
 for(const status of ['scheduled','published','failed'])assert.deepEqual(contentWarnings({...c,status},channels),[]);
});
test('valid drafts ignore generic errors, missing thumbnails, unprepared sources and stale reviews',()=>{
 const channels=[{id:'th',provider:'threads'}],c={id:'c',channels:['th'],status:'draft',caption:'Nội dung hợp lệ',sourceCopyId:'source',copyReady:false,assets:[],error:'fetch failed',textRuleBlocked:true,contentReview:{warnings:[{message:'Old warning'}]}};
 assert.deepEqual(contentWarnings(c,channels),[]);
 const cancelled={contentId:'c',connectionId:'th',status:'cancelled',caption:'x'.repeat(700),contentReview:{warnings:[{message:'Old warning'}]}};
 assert.deepEqual(contentWarnings(c,channels,[cancelled]),[]);
 assert.equal(contentWarnings({...c,caption:'x'.repeat(501)},channels,[cancelled]).length,1);
 assert.deepEqual(contentWarnings({...c,channels:[],caption:'x'.repeat(501)},channels),[]);
});
