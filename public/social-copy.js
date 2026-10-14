import {jobControls,renderJobsTable,jobIconButton,filterCopyJobs} from './copy-job-table.js';
let H,post=null,jobs=[],drive=null,busy=false,sourceInput='' ,copyUser='',previewGeneration=0;
const jobView={search:'',filter:'all',sort:'newest',sortKey:'createdAt',platforms:[],selected:new Set()};
let deleteIds=[];
async function waitImport(jobId,contentId){while(document.querySelector('#drive-import-progress')){const rows=await H.api('/copy/jobs'),job=rows.find(j=>j.id===jobId);if(job?.status==='done'){await H.refresh(false);if(document.querySelector('#drive-import-progress'))H.openContent(contentId);return;}if(job?.status==='failed')throw new Error(job.error);const status=document.querySelector('#drive-import-progress');if(status)status.textContent=labels[job?.status]||'Đang tải…';await new Promise(r=>setTimeout(r,3000));}}
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={queued:'Chờ tải',downloading:'Đang tải bài gốc',uploading:'Đang lưu Google Drive',done:'Hoàn tất',failed:'Lỗi'};
const button=(text,action,id='',primary=false)=>`<button type="button" class="btn ${primary?'primary':''}" data-copy-action="${action}" data-id="${e(id)}">${text}</button>`;
export function copyPage(){return `<section class="panel"><div class="panel-body"><h2>Sao chép bài viết</h2><p class="help-text">Dán link bài viết để xem nội dung và media trước khi tải hoặc đăng lại.</p><form id="copy-preview-form" class="row"><input class="input" name="url" type="url" required placeholder="https://www.facebook.com/… hoặc TikTok, Instagram, YouTube…" aria-label="Link bài viết cần Reup" value="${e(sourceInput||post?.url)}"><button class="btn primary" ${busy?'disabled':''}>${busy?'Đang xem trước…':'Xem trước'}</button></form><div id="copy-preview">${preview()}</div></div></section><section class="panel" style="margin-top:20px"><div class="panel-body"><h2>Các bài đã tải</h2>${jobControls(jobView)}<div id="copy-jobs">${jobRows()}</div></div></section>`;}
function preview(){
 if(!post)return '';
 const media=post.media.map((m,i)=>{const url='/api/copy/media/'+e(post.id)+'/'+i;return m.type==='video'?`<video controls preload="metadata" ${m.poster?`poster="${url}?poster=1"`:''} ${m.url?`src="${url}"`:''}></video>`:`<img loading="lazy" src="${url}" alt="Ảnh trong bài viết">`;}).join('');
 return `<article style="max-width:760px;margin:24px auto"><div class="row between"><strong>${e(post.author||post.provider)}</strong><div class="row"><a href="${e(post.url)}" target="_blank" rel="noopener">Mở bài gốc ↗</a>${jobIconButton('Xóa link và nội dung xem trước','clear-preview','','trash',true)}</div></div><div style="white-space:pre-wrap;margin:16px 0">${e(post.caption)}</div><div class="copy-media">${media}</div><p class="help-text">${post.media.length} ảnh/video · Giữ nguyên nội dung, emoji và hashtag nguồn. Chất lượng tải theo bản cao nhất nền tảng cung cấp.</p><div class="row">${button('Tải','download',post.id,true)}${button('Reup','reup',post.id)}${button('Thoát','exit')}</div></article>`;
}
function jobRows(){return renderJobsTable(jobs,jobView);}
export function driveSettings(){return `<section class="panel"><div class="panel-body"><h2>Google Drive — Kho bài đăng đa nền tảng</h2><div id="drive-state">Đang kiểm tra kết nối…</div><p class="help-text">Mỗi bài lưu trong một thư mục riêng. Khi tạo bài đăng, chọn “Từ Google Drive” và chọn thư mục bài để tự nạp nội dung cùng ảnh/video.</p>${H?.state?.user?.role==='owner'?`<form id="drive-config-form"><h3>Cấu hình ứng dụng Google OAuth</h3><label>Địa chỉ ứng dụng công khai<input class="input" name="publicOrigin" type="url" value="${e(location.origin)}" required></label><label>Google OAuth Client ID<input class="input" name="clientId" placeholder="Nhập để thay đổi; để trống giữ cấu hình cũ"></label><label>Google OAuth Client Secret<input class="input" name="clientSecret" type="password" autocomplete="new-password" placeholder="Để trống giữ secret đã lưu"></label><label>Google Picker API key (nếu dự án yêu cầu)<input class="input" name="pickerKey" placeholder="Để trống giữ key đã lưu"></label><p class="help-text">Bật Google Drive API và Google Picker API, tạo OAuth client loại Web application. Authorized redirect URI: <code>${e(location.origin)}/api/drive/callback</code>. Mỗi người dùng kết nối Drive của mình bên dưới.</p><button class="btn primary">Lưu cấu hình</button></form>`:''}<div class="row" style="margin-top:20px">${button('Kết nối Google Drive','connect')}${button('Ngắt kết nối','disconnect')}</div>${button('Chọn thư mục từ Google Drive','pick-folder')}<p class="help-text">Thư mục có sẵn cần chọn qua Google để cấp quyền cho ứng dụng. Dán ID chỉ dùng được với thư mục đã được cấp quyền. Để trống để tự tạo kho khi tải bài đầu tiên.</p><form id="drive-folder-form" style="margin-top:20px"><label>ID thư mục kho (để trống để hệ thống tự tạo)<input class="input" name="folderId" placeholder="ID trong link drive.google.com/drive/folders/…"></label><button class="btn">Lưu thư mục</button></form></div></section>`;}
async function refreshJobs(){jobs=await H.api('/copy/jobs');for(const id of jobView.selected)if(!jobs.some(j=>j.id===id))jobView.selected.delete(id);const el=document.querySelector('#copy-jobs');if(el)el.innerHTML=jobRows();}
export function openDriveSettings(){H.modal('Kết nối Google Drive',driveSettings());void refreshDrive().catch(error=>H.toast(error.message,true));}
function updateDriveCards(){
 const connected=document.querySelector('#drive-connected-slot'),available=document.querySelector('#drive-available-slot');
 if(connected)connected.innerHTML=drive?.connected?`<div class="connection-card"><div class="row between"><span class="social large" style="background:#4285f4;color:white" aria-hidden="true">△</span><span class="badge success">Đã kết nối</span></div><h3>Google Drive</h3><p>Kho bài đăng đa nền tảng của bạn</p><p class="help-text">${drive.folderId?'Thư mục kho: '+e(drive.folderId):'Tự tạo thư mục kho khi tải bài đầu tiên'}</p><div class="row">${button('Cấu hình','settings')}${button('Ngắt kết nối','disconnect')}</div></div>`:'';
 if(available)available.innerHTML=drive?.connected?'':`<button type="button" class="connection-card row" style="text-align:left;border:1px dashed var(--line);gap:12px" data-copy-action="settings" aria-label="Google Drive"><span class="social large" style="background:#4285f4;color:white" aria-hidden="true">△</span><span><strong>Google Drive</strong><span class="help-text" style="display:block">Nhấn để kết nối kho bài đăng</span></span></button>`;
 const empty=document.querySelector('#channels-empty');if(empty)empty.hidden=!!drive?.connected;
}
async function refreshDrive(){drive=await H.api('/drive/config');updateDriveCards();const el=document.querySelector('#drive-state');if(el)el.innerHTML=`<p>${drive.connected?'✓ Đã kết nối Google Drive':drive.configured?'Chưa kết nối Drive của bạn':'Chưa cấu hình ứng dụng Google OAuth'}</p>`;const input=document.querySelector('#drive-folder-form [name=folderId]');if(input&&document.activeElement!==input)input.value=drive.folderId;}
export function enhanceCopy(){if(copyUser!==H?.state?.user?.id){copyUser=H?.state?.user?.id;post=null;jobs=[];sourceInput='';drive=null;Object.assign(jobView,{search:'',filter:'all',sort:'newest',sortKey:'createdAt',platforms:[],selected:new Set()});}if(document.querySelector('#copy-jobs'))void refreshJobs().catch(()=>{});if(document.querySelector('#drive-state,#drive-connected-slot')){updateDriveCards();void refreshDrive().catch(e=>H.toast(e.message,true));}}
export function initCopy(host){H=host;document.addEventListener('input',event=>{if(event.target.matches('#copy-preview-form [name=url]'))sourceInput=event.target.value;if(event.target.id==='copy-job-search'){jobView.search=event.target.value;document.querySelector('#copy-jobs').innerHTML=jobRows();}});document.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='copy-job-filter')jobView.filter=el.value;
 else if(el.dataset.copySelect){if(el.checked)jobView.selected.add(el.dataset.copySelect);else jobView.selected.delete(el.dataset.copySelect);}
 else if(el.id==='copy-select-all'){for(const j of filterCopyJobs(jobs,jobView).filter(j=>!['queued','downloading','uploading'].includes(j.status))){if(el.checked)jobView.selected.add(j.id);else jobView.selected.delete(j.id);}}
 else if(el.id==='copy-platform-all'){jobView.platforms=[];document.querySelectorAll('[data-copy-platform]').forEach(c=>c.checked=false);el.checked=true;}
 else if(el.dataset.copyPlatform){jobView.platforms=[...document.querySelectorAll('[data-copy-platform]:checked')].map(c=>c.dataset.copyPlatform);document.querySelector('#copy-platform-all').checked=!jobView.platforms.length;}
 else return;
 const count=document.querySelector('#copy-platform-count');if(count)count.textContent=jobView.platforms.length?`(${jobView.platforms.length})`:'(Tất cả)';
 document.querySelector('#copy-jobs').innerHTML=jobRows();
 });document.addEventListener('submit',async event=>{const form=event.target;if(!['copy-preview-form','drive-config-form','drive-folder-form'].includes(form.id))return;event.preventDefault();event.stopImmediatePropagation();const input=Object.fromEntries(new FormData(form));const submit=form.querySelector('button'),submitText=submit.textContent;submit.disabled=true;if(form.id==='copy-preview-form')submit.textContent='Đang xem trước…';try{if(form.id==='copy-preview-form'){busy=true;const generation=++previewGeneration;const result=await H.api('/copy/preview',{method:'POST',body:input});if(generation===previewGeneration){post=result;const el=document.querySelector('#copy-preview');if(el)el.innerHTML=preview();}}else{await H.api(form.id==='drive-config-form'?'/drive/config':'/drive/folder',{method:'POST',body:input});if(form.id==='drive-config-form')form.elements.clientSecret.value='';await refreshDrive();H.toast('Đã lưu cấu hình Google Drive.');}}catch(error){H.toast(error.message,true);}finally{busy=false;submit.disabled=false;submit.textContent=submitText;const current=document.querySelector('#copy-preview-form button');if(current){current.disabled=false;current.textContent='Xem trước';}}},true);
 document.addEventListener('click',async event=>{const el=event.target.closest('[data-copy-action]');if(!el)return;event.preventDefault();const action=el.dataset.copyAction;el.disabled=true;try{
  if(action==='settings')openDriveSettings();
  if(['zip-options','save-drive-confirm'].includes(action)){const j=jobs.find(j=>j.id===el.dataset.id);H.modal('Lưu bài vào Google Drive',`<p>Bạn muốn lưu toàn bộ bài đã tải vào Google Drive để sẵn sàng Reup?</p><div class="row">${j?.driveSaved?'<p>Bài đã có trên Google Drive.</p>':button('Lưu Google Drive','save-drive',el.dataset.id,true)}${action==='zip-options'?`<a class="btn" href="/api/copy/archive/${e(el.dataset.id)}">Tải ZIP</a>`:''}${button('Đóng','close-copy-modal')}</div>`);}
  if(action==='save-drive'){await H.api('/copy/save-drive',{method:'POST',body:{jobId:el.dataset.id}});H.closeModal();await refreshJobs();H.toast('Đang lưu gói bài đã tải vào Google Drive.');}
  if(action==='reup-job'){const c=await H.api('/copy/reup-job',{method:'POST',body:{jobId:el.dataset.id}});await H.refresh(false);H.openContent(c.id);}
  if(action==='sort'){jobView.sort=jobView.sortKey===el.dataset.id&&jobView.sort==='newest'?'oldest':'newest';jobView.sortKey=el.dataset.id;document.querySelector('#copy-jobs').innerHTML=jobRows();}
  if(action==='cancel-selection'){jobView.selected.clear();document.querySelector('#copy-jobs').innerHTML=jobRows();}
  if(action==='hide-confirm'||action==='delete-selected'){
   deleteIds=action==='hide-confirm'?[el.dataset.id]:[...jobView.selected];
   H.modal('Xóa bài trong kho',`<p>Xóa ${deleteIds.length} bài khỏi danh sách và chuyển thư mục bài tương ứng trên Google Drive vào thùng rác?</p><p>Bài đã đăng trên mạng xã hội được giữ nguyên.</p><div class="row">${button('Xóa','hide-job','',true)}${button('Hủy','close-copy-modal')}</div>`);
  }
  if(action==='hide-job'){
   const result=await H.api('/copy/delete',{method:'POST',body:{jobIds:deleteIds}});for(const r of result.results)if(r.ok)jobView.selected.delete(r.id);
   H.closeModal();await refreshJobs();const failed=result.results.filter(r=>!r.ok);H.toast(failed.length?`Không xóa được ${failed.length} bài: ${failed[0].error}`:'Đã xóa các bài đã chọn.',!!failed.length);
  }
  if(action==='close-copy-modal')H.closeModal();
  if(action==='exit'||action==='clear-preview'){previewGeneration++;post=null;sourceInput='';const input=document.querySelector('#copy-preview-form [name=url]');if(input)input.value='';document.querySelector('#copy-preview').innerHTML='';}
  if(action==='download')H.modal('Tải bài viết',`<p>Chọn nơi lưu toàn bộ nội dung và media của bài viết.</p><div class="row">${button('Thiết bị hiện tại (ZIP)','device',el.dataset.id,true)}${button('Kho Google Drive','drive',el.dataset.id)}</div>`);
  if(['device','drive'].includes(action)){await H.api('/copy/download',{method:'POST',body:{postId:el.dataset.id,target:action}});H.closeModal();await refreshJobs();H.toast('Đã bắt đầu tải ở nền. Theo dõi trong Các bài đã tải.');}
  if(action==='reup'){const c=await H.api('/copy/reup',{method:'POST',body:{postId:el.dataset.id}});await H.refresh(false);H.closeModal();H.openContent(c.id);}
  if(action==='retry'){await H.api('/copy/retry',{method:'POST',body:{jobId:el.dataset.id}});await refreshJobs();}
  if(action==='connect'){const r=await H.api('/drive/connect',{method:'POST',body:{}});window.open(r.url,'_blank','noopener');}
  if(action==='disconnect'){await H.api('/drive/disconnect',{method:'POST',body:{}});await refreshDrive();}
  if(action==='pick-folder')await chooseDriveFolder();
  if(action==='folders')await folderPicker();
  if(action==='browse-folder')await folderPicker(el.dataset.id);
  if(action==='folder-next')await folderPicker(el.dataset.parent,el.dataset.pageToken);
  if(action==='import-folder'){H.toast('Đang nạp gói bài từ Google Drive…');const result=await H.api('/drive/import',{method:'POST',body:{folderId:el.dataset.id}});H.modal('Đang nạp bài từ Google Drive','<p>Nội dung và ảnh/video đang được nạp ở nền. Khi hoàn tất, màn hình soạn bài sẽ mở tự động.</p><p id="drive-import-progress" role="status">Đang tải…</p>');await waitImport(result.job.id,result.contentId);}
 }catch(error){H.toast(error.message,true);}finally{el.disabled=false;}});
 setInterval(()=>{if(document.querySelector('#copy-jobs'))void refreshJobs().catch(()=>{});if(document.querySelector('#drive-state,#drive-connected-slot'))void refreshDrive().catch(()=>{});},3000);
}
async function folderPicker(parent='',pageToken=''){
 const r=await H.api('/drive/folders?'+new URLSearchParams({...(parent?{parent}:{}),...(pageToken?{pageToken}:{})}));
 const next=r.nextPageToken?`<button class="btn" data-copy-action="folder-next" data-parent="${e(parent)}" data-page-token="${e(r.nextPageToken)}">Trang tiếp theo</button>`:'';
 H.modal('Chọn thư mục bài từ Google Drive',`<p>Chọn thư mục được tạo bởi chức năng Sao chép. Nội dung và media sẽ tự nạp.</p>${parent?button('Về kho','folders'):''}${r.files.map(f=>`<div class="row between" style="padding:12px;border-bottom:1px solid var(--line)"><strong>${e(f.name)}</strong><div class="row">${button('Mở','browse-folder',f.id)}${button('Dùng bài này','import-folder',f.id,true)}</div></div>`).join('')||'<p>Chưa có thư mục trong kho. Tải một bài lên Drive trước.</p>'}${next}`);
}

let pickerLoading;
async function loadDrivePicker(){
 if(window.google?.picker)return;
 if(!pickerLoading)pickerLoading=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pickerLoading=null;reject(new Error('Không tải được bộ chọn Google Drive. Kiểm tra kết nối rồi thử lại.'));},20000);
  const loaded=()=>window.gapi.load('picker',{callback:()=>{clearTimeout(timeout);resolve();},onerror:()=>{clearTimeout(timeout);pickerLoading=null;reject(new Error('Không tải được Google Picker.'));}});
  if(window.gapi)return loaded();
  const script=document.createElement('script');script.src='https://apis.google.com/js/api.js';script.onload=loaded;script.onerror=()=>{clearTimeout(timeout);pickerLoading=null;script.remove();reject(new Error('Không tải được bộ chọn Google Drive.'));};document.head.append(script);
 });
 return pickerLoading;
}
async function chooseDriveFolder(){
 await loadDrivePicker();
 const config=await H.api('/drive/picker',{method:'POST',body:{}}),p=window.google.picker;
 const view=new p.DocsView(p.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMode(p.DocsViewMode.LIST);
 await new Promise((resolve,reject)=>{
  let picker;
  const builder=new p.PickerBuilder().addView(view).setOAuthToken(config.accessToken).setAppId(config.appId).setOrigin(location.origin).setLocale('vi').setTitle('Chọn thư mục kho bài đăng').setCallback(async data=>{
   if(data.action===p.Action.CANCEL){picker?.dispose();return resolve();}
   if(data.action!==p.Action.PICKED)return;
   picker?.dispose();
   try{const folderId=data.docs?.[0]?.id;if(!folderId)throw new Error('Google chưa trả về thư mục đã chọn.');await H.api('/drive/folder',{method:'POST',body:{folderId}});await refreshDrive();H.toast('Đã lưu thư mục kho Google Drive.');resolve();}catch(error){reject(error);}
  });
  if(config.developerKey)builder.setDeveloperKey(config.developerKey);
  picker=builder.build();picker.setVisible(true);
 });
}
