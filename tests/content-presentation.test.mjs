import test from 'node:test';
import assert from 'node:assert/strict';
import {contentLabel,contentHasWarning,sourcePreviewImage} from '../public/content-presentation.js';
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
test('warning filter includes persisted reviews independently of publication outcome',()=>{
 const filters={statuses:['warning'],from:'2026-10-24',to:'2026-10-25',providers:null};
 for(const status of ['published','draft','failed','scheduled'])assert.equal(libraryMatches({status,warning:contentHasWarning({contentReview:{warnings:[{code:'absolute_claim'}]}}),at:'2026-10-25'},filters),true);
 assert.equal(libraryMatches({status:'failed',warning:false,at:'2026-10-25'},filters),false);
 assert.equal(contentHasWarning({contentReview:{warnings:[]},error:'network error'}),false);
});
