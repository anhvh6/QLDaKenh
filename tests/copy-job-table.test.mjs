import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCopyJobs,renderJobsTable} from '../public/copy-job-table.js';
const jobs=[{id:'zip',createdAt:'2026-10-12',caption:'Bài ảnh khách hàng',status:'done',zipSaved:true},{id:'drive',createdAt:'2026-10-13',caption:'Bài video',url:'https://example.com/post',status:'done',driveSaved:true,folderId:'folder',reupPublished:true},{id:'pending',createdAt:'2026-10-14',caption:'Đang chờ',status:'queued'}];
test('download library combines content search, storage filters, publication and date sort',()=>{
 assert.deepEqual(filterCopyJobs(jobs).map(j=>j.id),['pending','drive','zip']);
 assert.deepEqual(filterCopyJobs(jobs,{sort:'oldest',filter:'not-reup'}).map(j=>j.id),['zip','pending']);
 assert.deepEqual(filterCopyJobs(jobs,{search:'ẢNH',filter:'zip'}).map(j=>j.id),['zip']);
 assert.deepEqual(filterCopyJobs(jobs,{search:'example.com',filter:'drive'}).map(j=>j.id),['drive']);
 assert.deepEqual(filterCopyJobs(jobs,{filter:'loading'}).map(j=>j.id),['pending']);
});
test('table uses saved storage state, gates Reup, escapes content, and highlights actual publication',()=>{
 const html=renderJobsTable([...jobs,{id:'bad',createdAt:'2026-10-11',status:'failed',caption:'<img onerror=alert(1)>',error:'<script>'}]);
 assert.match(html,/Đã Reup thành công/);assert.match(html,/Tải lỗi/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/data-copy-action="reup-job" data-id="zip"[^>]+disabled/);
 assert.match(html,/drive\.google\.com\/drive\/folders\/folder/);
});

test('platform filter uses OR across source and published platforms and supports published-only sorting',()=>{
 const rows=[{id:'a',createdAt:'2026-01-01',caption:'B',status:'done',provider:'tiktok',reupPlatforms:['facebook'],reupPublished:true},{id:'b',createdAt:'2026-01-02',caption:'A',status:'done',provider:'youtube'}];
 assert.deepEqual(filterCopyJobs(rows,{platforms:['facebook','youtube'],sortKey:'caption',sort:'oldest'}).map(j=>j.id),['b','a']);
 assert.deepEqual(filterCopyJobs(rows,{filter:'reup'}).map(j=>j.id),['a']);
 assert.equal(filterCopyJobs(rows,{platforms:['instagram']}).length,0);
 const html=renderJobsTable(rows,{selected:new Set(['a'])});assert.doesNotMatch(html,/>Link bài viết</);assert.match(html,/data-copy-select="a"[^>]+checked/);assert.match(html,/aria-label="Facebook"/);
});
