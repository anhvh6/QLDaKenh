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

test('platform filter uses OR only across successful publication destinations and supports published-only sorting',()=>{
 const rows=[{id:'a',createdAt:'2026-01-01',caption:'B',status:'done',provider:'tiktok',reupPlatforms:['facebook'],reupPublished:true},{id:'b',createdAt:'2026-01-02',caption:'A',status:'done',provider:'youtube'}];
 assert.deepEqual(filterCopyJobs(rows,{platforms:['facebook','youtube'],sortKey:'caption',sort:'oldest'}).map(j=>j.id),['a']);
 assert.deepEqual(filterCopyJobs(rows,{filter:'reup'}).map(j=>j.id),['a']);
 assert.equal(filterCopyJobs(rows,{platforms:['instagram']}).length,0);
 const html=renderJobsTable(rows,{selecting:true,selected:new Set(['a'])});assert.doesNotMatch(html,/>Link bài viết</);assert.match(html,/data-copy-select="a"[^>]+checked/);assert.match(html,/aria-label="Facebook"/);
});

test('selection is hidden normally; platform filtering excludes source-only, failed and unpublished rows',()=>{
 const rows=[{id:'source',createdAt:'1',provider:'facebook',status:'done'},{id:'ok',createdAt:'2',status:'done',reupPlatforms:['facebook']},{id:'bad',createdAt:'3',status:'done',reupPlatforms:['facebook'],reupError:'Failed on another channel'},{id:'publishing',createdAt:'4',status:'done',reupPublishing:true}];
 assert.doesNotMatch(renderJobsTable(rows),/type="checkbox"/);assert.match(renderJobsTable(rows,{selecting:true}),/>Hủy</);assert.deepEqual(filterCopyJobs(rows,{platforms:['facebook']}).map(j=>j.id),['ok']);assert.equal(filterCopyJobs(rows,{platforms:[]}).length,0);assert.equal(filterCopyJobs(rows,{filter:'error'})[0].id,'bad');assert.equal(filterCopyJobs(rows,{filter:'publishing'})[0].id,'publishing');
});

test('connected platform picker checks every platform with select-all and offers no disconnected platforms',async()=>{
 const {jobControls}=await import('../public/copy-job-table.js');const html=jobControls({search:'',filter:'all',platforms:['facebook','threads'],connectedPlatforms:['facebook','threads']});assert.match(html,/id="copy-platform-all" checked/);assert.match(html,/data-copy-platform="facebook" checked/);assert.match(html,/data-copy-platform="threads" checked/);assert.doesNotMatch(html,/data-copy-platform="tiktok"/);assert.match(html,/>Lỗi</);assert.match(html,/>Đang đăng</);
});
