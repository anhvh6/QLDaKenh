import {defaultFilters,filterThreads,assignedIds,normalize,safeLink} from './inbox-model.js';
let H,F=structuredClone(defaultFilters),selected=new Set(),searchIn='',lastConv='',mediaTab='all';
const drafts=new Map();let skipCapture=false;
function paint(){skipCapture=true;try{H.render();}finally{skipCapture=false;}}
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const b=(label,action,id='',extra='')=>`<button type="button" class="btn small" data-chat="${action}" data-id="${e(id)}" ${extra}>${label}</button>`;
const sel=(label,name,items,value)=>`<label>${label}<select name="${name}" class="input">${items.map(([v,t])=>`<option value="${e(v)}" ${String(v)===String(value)?'selected':''}>${e(t)}</option>`).join('')}</select></label>`;
const active=()=>H.state.conversations.find(c=>c.id===$('#reply-form')?.dataset.id);
const date=v=>v?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
const storageKey=()=>`chat-drafts:${H?.state.user.id}`;
const freshDraft=()=>({text:'',note:false,quoteId:'',assetIds:[]});
function draft(id){if(!drafts.has(id))drafts.set(id,freshDraft());return drafts.get(id);}
function saveDrafts(){try{sessionStorage.setItem(storageKey(),JSON.stringify([...drafts]));}catch{}}
export function rememberInboxDraft(){const form=$('#reply-form');if(skipCapture||!H||H.route()!=='inbox'||!form)return;const d=draft(form.dataset.id);d.text=form.elements.text.value;d.note=form.elements.note.checked;saveDrafts();}
export function inboxThreads(S,q,status){return filterThreads(S,q,status,F);}
export function chatMessages(messages,conv,S){
 let lastDay='';return messages.map(m=>{
  const day=new Date(m.createdAt).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),header=day!==lastDay?`<div class="chat-day">${e(day)}</div>`:'';lastDay=day;
  const quote=S.messages.find(x=>x.id===m.quoteId),attachments=(m.attachments||[]).map(a=>{const url=safeLink(a.url);if(!url)return '';return `<a class="chat-attachment" href="${e(url)}" target="_blank" rel="noopener noreferrer">${a.type==='image'?`<img src="${e(url)}" alt="${e(a.name||'Ảnh')}" loading="lazy" referrerpolicy="no-referrer">`:a.type==='video'?`<span>▶ ${e(a.name||'Video')}</span>`:`<span>📎 ${e(a.name||'Tệp')}</span>`}</a>`;}).join('');
  const state={internal:'Ghi chú nội bộ',accepted:'API đã nhận',received:'Đã nhận',sent:'Đã gửi',sending:'Đang gửi',failed:'Gửi lỗi',unknown:'Cần kiểm tra trên Zalo',demo:'Mô phỏng'}[m.status]||m.status;
  return header+`<div class="bubble-wrap ${e(m.direction)}" data-message="${e(m.id)}" ${searchIn&&!normalize(m.text).includes(normalize(searchIn))?'hidden':''}>
  ${conv.threadType===1?`<strong class="message-sender">${e(m.senderName||S.users.find(u=>u.id===m.actor)?.name||(m.direction==='incoming'?'Thành viên':'Bạn'))}</strong>`:''}
  <div class="bubble">${quote?`<button type="button" class="quote-block" data-chat="jump" data-id="${e(quote.id)}">↪ ${e(quote.text?.slice(0,200))}</button>`:''}<span>${e(m.text)}</span>${attachments}</div>
  <small>${e(date(m.createdAt))} · ${e(state)}${m.error?' · '+e(m.error):''}${m.pinned?' · 📌 Ghim nội bộ':''}</small>
  <div class="message-tools">${m.direction!=='note'?b('↩ Trả lời','quote',m.id)+b('Chuyển tiếp','forward',m.id):''}${b('Sao chép','copy',m.id)}${b(m.pinned?'Bỏ ghim':'Ghim','pin-message',m.id)}${b('Nhắc việc','remind-message',m.id)}</div></div>`;
 }).join('');
}
function filterDialog(){const S=H.state;H.modal('Lọc hội thoại',`<form id="chat-filter-form"><div class="chat-filter-grid">
 ${sel('Loại hội thoại','type',[['all','Tất cả'],['personal','Cá nhân'],['group','Nhóm'],['stranger','Người lạ (đã xác định)']],F.type)}
 ${sel('Kênh','connectionId',[['','Tất cả kênh'],...S.connections.map(c=>[c.id,c.name])],F.connectionId)}
 ${sel('Số điện thoại','phone',[['all','Tất cả'],['yes','Có số điện thoại'],['no','Chưa có số điện thoại']],F.phone)}
 ${sel('Phản hồi','reply',[['all','Tất cả'],['waiting','Chưa trả lời'],['read-waiting','Đã đọc, chưa trả lời']],F.reply)}
 ${sel('Lưu trữ','archive',[['active','Đang hoạt động'],['archived','Đã lưu trữ nội bộ'],['all','Tất cả']],F.archive)}
 ${sel('Sắp xếp','sort',[['newest','Tin mới nhất'],['oldest','Tin cũ nhất'],['waiting','Chờ phản hồi lâu nhất']],F.sort)}
 ${sel('Lọc ngày theo','dateField',[['lastAt','Tin nhắn cuối'],['createdAt','Ngày tạo hội thoại']],F.dateField)}
 <label>Từ ngày<input class="input" type="date" name="from" value="${e(F.from)}"></label><label>Đến ngày<input class="input" type="date" name="to" value="${e(F.to)}"></label>
 </div><div class="row wrap">${b('Hôm nay','date-preset','0')}${b('7 ngày','date-preset','7')}${b('30 ngày','date-preset','30')}${b('90 ngày','date-preset','90')}</div>
 <label class="check-label"><input type="checkbox" name="pinned" ${F.pinned?'checked':''}>Chỉ hội thoại đã ghim</label>
 <fieldset><legend>Thẻ hội thoại</legend>${sel('Kết hợp thẻ','tagMode',[['any','Có ít nhất một thẻ'],['all','Có tất cả thẻ']],F.tagMode)}<div class="chat-check-grid">${[['__none__','Không gắn thẻ'],...S.tags.map(t=>[t.name,t.name])].map(([id,name])=>`<label><input name="tags" type="checkbox" value="${e(id)}" ${F.tags.includes(id)?'checked':''}>${e(name)}</label>`).join('')}</div></fieldset>
 <fieldset><legend>Nhân viên phụ trách</legend>${sel('Kết hợp nhân viên','assigneeMode',[['any','Nhân viên A hoặc B'],['all','Nhân viên A và B']],F.assigneeMode)}<div class="chat-check-grid">${[['__none__','Chưa phân công'],...S.users.filter(u=>u.active).map(u=>[u.id,u.name])].map(([id,name])=>`<label><input name="assignees" type="checkbox" value="${e(id)}" ${F.assignees.includes(id)?'checked':''}>${e(name)}</label>`).join('')}</div></fieldset>
 <p class="help-text">Các nhóm điều kiện được kết hợp đồng thời. Ghim và lưu trữ chỉ áp dụng trong QL đa kênh.</p><button class="btn primary" type="submit">Áp dụng bộ lọc</button> ${b('Xóa bộ lọc','reset')}</form>`,'',true);}
function redraw(){rememberInboxDraft();paint();}
function persistFilters(){try{sessionStorage.setItem('chat-filters:'+H.state.user.id,JSON.stringify(F));}catch{}}
function refreshLocal(result){const c=H.state.conversations.find(c=>c.id===result.id);if(c)Object.assign(c,result);}
async function patch(id,patch){const c=H.state.conversations.find(c=>c.id===id);const r=await H.api('/chat/conversations/'+id,{method:'PATCH',body:{...patch,version:c.version}});refreshLocal(r);redraw();}
function reminderForm(c,text=''){H.modal('Nhắc chăm sóc — nội bộ',`<form id="chat-reminder-form" data-id="${e(c.id)}"><label>Nội dung<textarea class="input" name="title" maxlength="500" required>${e(text.slice(0,500))}</textarea></label><label>Thời gian nhắc<input class="input" type="datetime-local" name="dueAt" required></label>${sel('Người nhận nhắc','assignee',H.state.users.filter(u=>u.active&&['owner','manager','support'].includes(u.role)).map(u=>[u.id,u.name]),H.state.user.id)}<p class="help-text">Nhắc trong QL đa kênh, không gửi tin nhắn hay tạo nhắc hẹn trên Zalo.</p><button class="btn primary">Lưu nhắc chăm sóc</button></form>`);}
function reminders(c){const rows=(H.state.chat_reminders||[]).filter(r=>(!c||r.conversationId===c.id)&&r.status==='pending').sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));H.modal(c?'Nhắc chăm sóc của hội thoại':'Nhắc chăm sóc',`${c?b('+ Tạo nhắc','reminder',c.id):''}<div class="chat-reminder-list">${rows.map(r=>`<article class="chat-reminder ${Date.parse(r.dueAt)<=Date.now()?'due':''}"><strong>${e(r.title)}</strong><p>${e(date(r.dueAt))} · ${e(H.state.users.find(u=>u.id===r.assignee)?.name)}</p><div class="row wrap"><button class="btn small" data-action="open-conversation" data-id="${e(r.conversationId)}">Mở hội thoại</button>${b('Hoàn tất','reminder-done',r.id)}${b('Hủy nhắc','reminder-cancel',r.id)}</div></article>`).join('')||'<p>Chưa có nhắc chăm sóc.</p>'}</div>`);}
function group(c){H.modal('Thông tin nhóm',`<h3>${e(c.title||c.group?.name||'Nhóm Zalo')}</h3><p>${e(c.group?.description||'')}</p><p>${c.group?.memberCount||0} thành viên · ${c.group?.syncedAt?'Cập nhật '+e(date(c.group.syncedAt)):'Chưa đồng bộ thành viên'}</p>${b('Đồng bộ thành viên từ Zalo','sync-group',c.id)}<input class="input" id="chat-member-search" aria-label="Tìm thành viên" placeholder="Tìm tên hoặc ID thành viên"><div class="chat-members">${(c.group?.members||[]).map(m=>`<article data-member="${e(normalize(m.name+' '+m.id))}"><strong>${e(m.name)}</strong><small>${e(m.id)} · ${{owner:'Trưởng nhóm',admin:'Quản trị viên',member:'Thành viên'}[m.role]||'Thành viên'}</small></article>`).join('')}</div><p class="help-text">Đây là thông tin chỉ đọc. Thêm/xóa thành viên, đổi tên, rời hoặc giải tán nhóm thực hiện trên Zalo gốc.</p>`);}
function files(c){const rows=H.state.messages.filter(m=>m.conversationId===c.id);const media=rows.flatMap(m=>(m.attachments||[]).map(a=>({...a,messageId:m.id,createdAt:m.createdAt})));const links=rows.flatMap(m=>(m.text.match(/https?:\/\/[^\s<>]+/g)||[]).map(url=>({url,name:url,type:'link',messageId:m.id,createdAt:m.createdAt})));H.modal('Ảnh, tệp và liên kết',`<div class="row wrap">${['all','image','video','file','link'].map((k,i)=>b(['Tất cả','Ảnh','Video','Tệp','Liên kết'][i],'media-tab',k,mediaTab===k?'aria-pressed="true"':'')).join('')}</div><div class="chat-media-grid">${[...media,...links].filter(a=>mediaTab==='all'||a.type===mediaTab).map(a=>{const url=safeLink(a.url);return url?`<article><a href="${e(url)}" target="_blank" rel="noopener noreferrer">${a.type==='image'?`<img src="${e(url)}" alt="${e(a.name)}" loading="lazy" referrerpolicy="no-referrer">`:''}${e(a.name)}</a><small>${e(date(a.createdAt))}</small>${b('Tới tin nhắn','jump',a.messageId)}</article>`:'';}).join('')||'<p>Chưa có dữ liệu trong phần lịch sử đã đồng bộ.</p>'}</div><p class="help-text">Liên kết media do nền tảng cung cấp có thể hết hạn.</p>`,'',true);}
function templates(){H.modal('Mẫu trả lời nhanh',`<input class="input" id="chat-template-search" aria-label="Tìm mẫu trả lời" placeholder="Tìm tên, phím tắt hoặc nội dung"><div>${H.state.templates.map(t=>`<article class="chat-template" data-template-search="${e(normalize(t.name+' '+t.shortcut+' '+t.text))}"><h3>${e(t.name)} <small>/${e(t.shortcut||'')}</small></h3><p>${e(t.text?.slice(0,250))}</p>${b('Chèn vào bản nháp','insert-template',t.id)} ${t.blocks?.length?`<button type="button" class="btn small" data-care="sequence-preview" data-id="${e(t.id)}">Xem trước chuỗi</button>`:''}</article>`).join('')}</div>`);}
function assignment(c,bulk=false){H.modal('Phân công chăm sóc',`<form id="chat-assign-form" data-id="${e(c?.id||'')}" data-bulk="${bulk}"><p>Nhân viên cần được cấp quyền truy cập kênh trước khi phân công.</p>${H.state.users.filter(u=>u.active&&['owner','manager','support'].includes(u.role)).map(u=>`<label class="check-label"><input type="checkbox" name="assigneeIds" value="${e(u.id)}" ${c&&assignedIds(c).includes(u.id)?'checked':''}>${e(u.name)}</label>`).join('')}<button class="btn primary">Lưu phân công</button></form>`);}
function composerExtras(c){const d=draft(c.id),q=H.state.messages.find(m=>m.id===d.quoteId);return `<div class="chat-draft-context">${q?`<div class="quote-block">Đang trả lời: ${e(q.text?.slice(0,180))}${b('×','clear-quote')}</div>`:''}${d.assetIds.map(id=>{const a=H.state.assets.find(a=>a.id===id);return a?`<span class="tag">📎 ${e(a.name)} ${b('×','remove-media',id)}</span>`:'';}).join('')}</div>`;}
export function enhanceInbox(){if(!H||H.route()!=='inbox')return;
 const root=$('.inbox-layout');if(!root)return;const S=H.state;
 const pending=(S.chat_reminders||[]).filter(r=>r.status==='pending'&&Date.parse(r.dueAt)<=Date.now()).length;
 const count=Object.entries(F).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(defaultFilters[k])).length;
 root.insertAdjacentHTML('beforebegin',`<div class="chat-toolbar">${b('☷ Bộ lọc'+(count?' · '+count:''),'filters')}${b('Xóa lọc','reset')}${b('Nhắc chăm sóc'+(pending?' · '+pending+' đến hạn':''),'all-reminders')}${b('Phím tắt','help')}<span class="muted small">${root.querySelectorAll('.conversation-item').length} hội thoại · ${selected.size} đã chọn</span>${selected.size?b('Phân công','bulk-assign')+b('Đã đọc','bulk-read')+b('Hoàn tất','bulk-resolve')+b('Lưu trữ','bulk-archive')+b('Bỏ chọn','clear-selection'):b('Chọn tất cả kết quả','select-all')}</div>`);
 root.querySelectorAll('.conversation-item').forEach(el=>{const c=S.conversations.find(c=>c.id===el.dataset.id);el.insertAdjacentHTML('afterbegin',`<input class="chat-select" type="checkbox" data-chat-select="${e(c.id)}" aria-label="Chọn hội thoại ${e(c.title||S.customers.find(p=>p.id===c.customerId)?.name)}" ${selected.has(c.id)?'checked':''}>`);el.querySelector('h3').insertAdjacentHTML('afterbegin',c.pinned?'📌 ':'');el.querySelector('.grow').insertAdjacentHTML('beforeend',`<div class="chat-list-meta"><span>${c.threadType===1?'Nhóm':'Cá nhân'}</span>${(c.tags||[]).slice(0,3).map(t=>`<span>${e(t)}</span>`).join('')}${draft(c.id).text?'<span>Bản nháp</span>':''}</div>`);});
 const c=active();if(!c)return;if(lastConv!==c.id){searchIn='';lastConv=c.id;}
 const form=$('#reply-form'),d=draft(c.id);form.elements.text.required=false;form.elements.text.value=d.text;form.elements.note.checked=d.note;
 form.insertAdjacentHTML('afterbegin',composerExtras(c));
 form.insertAdjacentHTML('beforeend',`<div class="chat-compose-tools">${b('Mẫu trả lời','templates')}${b('☺ Emoji','emoji')}${b('📎 Media','choose-media')}${b('Xóa nháp','clear-draft')}<label><input id="chat-enter-send" type="checkbox" ${sessionStorage.getItem('chat-enter-send')==='true'?'checked':''}>Enter để gửi</label></div>`);
 const head=$('.chat-head');head.insertAdjacentHTML('afterend',`<div class="chat-actions"><details><summary>Công cụ hội thoại</summary><div>${b(c.pinned?'Bỏ ghim':'Ghim hội thoại','pin',c.id)}${b(c.unread?'Đánh dấu đã đọc':'Đánh dấu chưa đọc','read',c.id)}${b('Phân công','assign',c.id)}${b('Nhắc hẹn','reminders',c.id)}${b('Ảnh / tệp / link','files',c.id)}${c.threadType===1?b('Thành viên nhóm','group',c.id):b('Lịch sử khách','customer-history',c.customerId)}${b(c.archived?'Bỏ lưu trữ':'Lưu trữ','archive',c.id)}</div></details><label class="chat-message-search">Tìm trong chat<input id="chat-message-search" class="input" value="${e(searchIn)}" placeholder="Nội dung tin nhắn…"></label></div>`);
 const pins=S.messages.filter(m=>m.conversationId===c.id&&m.pinned);if(pins.length)$('.chat-messages').insertAdjacentHTML('afterbegin',`<details class="chat-pins"><summary>📌 ${pins.length} tin ghim nội bộ</summary>${pins.map(m=>b(e(m.text.slice(0,100)||'Media'),'jump',m.id)).join('')}</details>`);
 const assignees=assignedIds(c).map(id=>S.users.find(u=>u.id===id)?.name).filter(Boolean);if(assignees.length)head.insertAdjacentHTML('beforeend',`<small class="chat-assigned">Phụ trách: ${e(assignees.join(', '))}</small>`);
 if(c.threadType===1)head.querySelector('h3').textContent=c.title||c.group?.name||S.customers.find(p=>p.id===c.customerId)?.name||'Nhóm';
 const side=$('.chat-side');side.insertAdjacentHTML('beforeend',`<div class="side-section"><h4>Ghi chú nội bộ</h4>${S.messages.filter(m=>m.conversationId===c.id&&m.direction==='note').slice(-5).map(m=>`<p class="small">${e(m.text)}<br><span class="muted">${e(date(m.createdAt))}</span></p>`).join('')||'<p class="muted">Chưa có ghi chú</p>'}${b('Viết ghi chú','note')}</div>`);
}
async function bulk(patch){const items=[...selected].map(id=>H.state.conversations.find(c=>c.id===id)).filter(Boolean).map(c=>({id:c.id,version:c.version}));await H.api('/chat/bulk',{method:'POST',body:{items,patch}});selected.clear();H.closeModal();await H.refresh();}
function insertText(text){const c=active(),d=draft(c.id);rememberInboxDraft();d.text+=(d.text?'\n':'')+text;H.closeModal();paint();$('#reply-form textarea').focus();}
export function initInbox(host){H=host;
 function load(){if(!H.state?.user)return;try{F={...structuredClone(defaultFilters),...JSON.parse(sessionStorage.getItem('chat-filters:'+H.state.user.id)||'{}')};for(const [id,d] of JSON.parse(sessionStorage.getItem(storageKey())||'[]'))drafts.set(id,{...freshDraft(),...d});}catch{F=structuredClone(defaultFilters);}}
 let loaded=false;H.load=()=>{if(!loaded&&H.state?.user){load();loaded=true;}};
 document.addEventListener('input',event=>{
  const el=event.target;if(el.closest('#reply-form'))rememberInboxDraft();
  if(el.id==='chat-message-search'){searchIn=el.value;document.querySelectorAll('[data-message]').forEach(row=>{const m=H.state.messages.find(m=>m.id===row.dataset.message);row.hidden=!normalize(m?.text).includes(normalize(searchIn));});}
  if(el.id==='chat-member-search')document.querySelectorAll('[data-member]').forEach(row=>row.hidden=!row.dataset.member.includes(normalize(el.value)));
  if(el.id==='chat-template-search')document.querySelectorAll('[data-template-search]').forEach(row=>row.hidden=!row.dataset.templateSearch.includes(normalize(el.value)));
 });
 document.addEventListener('change',event=>{if(event.target.id==='chat-enter-send')sessionStorage.setItem('chat-enter-send',String(event.target.checked));if(event.target.name==='note'&&event.target.closest('#reply-form'))rememberInboxDraft();});
 document.addEventListener('click',async event=>{
  const checkbox=event.target.closest('[data-chat-select]');if(checkbox){event.stopImmediatePropagation();checkbox.checked?selected.add(checkbox.dataset.chatSelect):selected.delete(checkbox.dataset.chatSelect);redraw();return;}
  const el=event.target.closest('[data-chat]');if(!el)return;event.preventDefault();event.stopImmediatePropagation();const {chat:action,id}=el.dataset;rememberInboxDraft();const c=active();
  try{
   if(action==='filters')return filterDialog();
   if(action==='reset'){F=structuredClone(defaultFilters);persistFilters();H.closeModal();return redraw();}
   if(action==='select-all'){for(const row of document.querySelectorAll('.conversation-item')){if(selected.size>=100)break;selected.add(row.dataset.id);}return redraw();}
   if(action==='clear-selection'){selected.clear();return redraw();}
   if(action==='bulk-assign')return assignment(null,true);
   if(action==='bulk-read')return await bulk({unread:false});
   if(action==='bulk-resolve')return await bulk({status:'resolved'});
   if(action==='bulk-archive')return await bulk({archived:true});
   if(action==='pin')return await patch(id,{pinned:!c.pinned});
   if(action==='read')return await patch(id,{unread:!c.unread});
   if(action==='archive')return await patch(id,{archived:!c.archived});
   if(action==='assign')return assignment(c);
   if(action==='customer-history'){F.customerId=id;persistFilters();return redraw();}
   if(action==='reminder')return reminderForm(c);
   if(action==='reminders')return reminders(c);
   if(action==='all-reminders')return reminders();
   if(action.startsWith('reminder-')){const r=H.state.chat_reminders.find(r=>r.id===id);await H.api('/chat/reminders/'+id,{method:'PATCH',body:{status:action==='reminder-done'?'done':'cancelled',version:r.version}});await H.refresh(false);return reminders(c);}
   if(action==='remind-message')return reminderForm(c,H.state.messages.find(m=>m.id===id)?.text||'');
   if(action==='group')return group(c);
   if(action==='sync-group'){el.disabled=true;const r=await H.api('/chat/conversations/'+id+'/group',{method:'POST'});refreshLocal(r);return group(r);}
   if(action==='files'){mediaTab='all';return files(c);}
   if(action==='media-tab'){mediaTab=id;return files(c);}
   if(action==='templates')return templates();
   if(action==='insert-template'){const t=H.state.templates.find(t=>t.id===id),p=H.state.customers.find(p=>p.id===c.customerId);return insertText(t.text.replaceAll('{{name}}',p?.name||'bạn'));}
   if(action==='note'){draft(c.id).note=true;paint();$('#reply-form textarea').focus();return;}
   if(action==='quote'){draft(c.id).quoteId=id;paint();$('#reply-form textarea').focus();return;}
   if(action==='clear-quote'){draft(c.id).quoteId='';return paint();}
   if(action==='clear-draft'){drafts.set(c.id,freshDraft());$('#reply-form textarea').value='';$('#reply-form [name=note]').checked=false;saveDrafts();return paint();}
   if(action==='copy'){const text=H.state.messages.find(m=>m.id===id)?.text||'';if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);H.toast('Đã sao chép');}else H.modal('Sao chép nội dung',`<textarea class="input" rows="8" readonly>${e(text)}</textarea><p>Chọn nội dung rồi nhấn Ctrl+C.</p>`);return;}
   if(action==='pin-message'){const m=H.state.messages.find(m=>m.id===id);const r=await H.api('/chat/messages/'+id,{method:'PATCH',body:{pinned:!m.pinned,version:m.version}});Object.assign(m,r);return redraw();}
   if(action==='jump'){H.closeModal();searchIn='';paint();const row=[...document.querySelectorAll('[data-message]')].find(r=>r.dataset.message===id);row?.scrollIntoView({block:'center'});row?.classList.add('chat-highlight');return;}
   if(action==='forward'){const m=H.state.messages.find(m=>m.id===id);return H.modal('Chuyển tiếp dưới dạng bản nháp',`<form id="chat-forward-form" data-id="${e(id)}">${sel('Hội thoại nhận','target',H.state.conversations.filter(x=>x.kind!=='comment'&&x.id!==c.id).map(x=>[x.id,x.title||H.state.customers.find(p=>p.id===x.customerId)?.name||x.id]),'')}<p>${e(m.text.slice(0,500))}</p><p class="help-text">Chỉ đưa văn bản vào bản nháp của hội thoại đích để bạn kiểm tra và bấm Gửi. Không chuyển tiếp ghi chú nội bộ hoặc tự gửi tệp.</p><button class="btn primary">Mở bản nháp</button></form>`);}
   if(action==='emoji')return H.modal('Chèn biểu tượng',`<div class="chat-emoji">${['😊','❤️','👍','🙏','🎉','🌷','✅','📌','💬','😍','👋','💛'].map(x=>b(x,'insert-emoji',x)).join('')}</div>`);
   if(action==='insert-emoji')return insertText(id);
   if(action==='choose-media'){const ch=H.state.connections.find(x=>x.id===c.connectionId);if(ch?.mode!=='demo'&&ch?.provider!=='zalo_personal')return H.toast('Gửi media hiện hỗ trợ Zalo cá nhân; kênh khác dùng nền tảng gốc.',true);return H.modal('Chọn media để gửi',`<p class="help-text">Chọn tối đa 10 ảnh/video từ thư viện. Chỉ gửi khi bạn bấm Gửi trong hội thoại.</p><div class="chat-media-grid">${H.state.assets.map(a=>`<article>${a.type==='image'?`<img src="${e(a.url)}" alt="${e(a.name)}">`:''}<p>${e(a.name)}</p>${b('Đính kèm','attach-media',a.id)}</article>`).join('')||'<p>Thư viện trống. Tải ảnh/video tại mục Thư viện trước.</p>'}</div>`,'',true);}
   if(action==='attach-media'){const d=draft(c.id);if(d.assetIds.length>=10)throw Error('Tối đa 10 media.');if(!d.assetIds.includes(id))d.assetIds.push(id);H.closeModal();return paint();}
   if(action==='remove-media'){draft(c.id).assetIds=draft(c.id).assetIds.filter(x=>x!==id);return paint();}
   if(action==='date-preset'){const local=new Date(Date.now()+7*3600000),end=local.toISOString().slice(0,10);local.setUTCDate(local.getUTCDate()-Math.max(0,Number(id)-1));$('#chat-filter-form [name=from]').value=local.toISOString().slice(0,10);$('#chat-filter-form [name=to]').value=end;return;}
   if(action==='help')return H.modal('Phím tắt & phạm vi chức năng','<p><b>Enter:</b> gửi khi bật tùy chọn. <b>Shift+Enter:</b> xuống dòng. <b>Alt+↑/↓:</b> chuyển hội thoại. <b>Alt+I:</b> hồ sơ/đơn. <b>/:</b> gợi ý mẫu hiện có.</p><p>Ghim, lưu trữ, đánh dấu đọc và nhắc chăm sóc là dữ liệu nội bộ QL đa kênh. Gửi tin/ảnh và trích dẫn Zalo chỉ chạy khi kênh API đã kết nối. Quản trị nhóm, gọi điện, sticker, OCR và thu hồi tin vẫn dùng Zalo gốc.</p>');
  }catch(err){H.toast(err.message,true);}finally{el.disabled=false;}
 },true);
 document.addEventListener('submit',async event=>{
  const form=event.target;if(H.route()!=='inbox'||!(form.id.startsWith('chat-')||form.id==='reply-form'))return;
  event.preventDefault();event.stopImmediatePropagation();const submit=form.querySelector('[type=submit],button:not([type])');if(submit?.disabled)return;if(submit)submit.disabled=true;
  try{
   const data=Object.fromEntries(new FormData(form));
   if(form.id==='chat-filter-form'){if(data.from&&data.to&&data.from>data.to)throw Error('Ngày kết thúc phải sau ngày bắt đầu.');F={...F,...data,tags:new FormData(form).getAll('tags'),assignees:new FormData(form).getAll('assignees'),pinned:!!form.elements.pinned.checked};persistFilters();H.closeModal();redraw();}
   if(form.id==='chat-assign-form'){const patchData={assigneeIds:new FormData(form).getAll('assigneeIds')};if(form.dataset.bulk==='true')await bulk(patchData);else{await patch(form.dataset.id,patchData);H.closeModal();}}
   if(form.id==='chat-reminder-form'){await H.api('/chat/conversations/'+form.dataset.id+'/reminders',{method:'POST',body:{...data,dueAt:new Date(data.dueAt).toISOString()}});H.closeModal();await H.refresh();H.toast('Đã lưu nhắc chăm sóc nội bộ');}
   if(form.id==='chat-forward-form'){const m=H.state.messages.find(m=>m.id===form.dataset.id);if(!data.target)throw Error('Chọn hội thoại nhận.');const d=draft(data.target);d.text+=(d.text?'\n':'')+'[Chuyển tiếp]\n'+m.text;saveDrafts();H.closeModal();H.openConversation(data.target);}
   if(form.id==='reply-form'){
    rememberInboxDraft();const id=form.dataset.id,c=active(),d=draft(id);if(!d.text.trim()&&!d.assetIds.length)throw Error('Nhập nội dung hoặc chọn media.');
    await H.api('/conversations/'+id+'/messages',{method:'POST',body:{text:d.text,note:d.note,quoteId:d.note?'':d.quoteId,assetIds:d.assetIds,version:c.version}});
    drafts.set(id,freshDraft());form.elements.text.value='';form.elements.note.checked=false;saveDrafts();await H.refresh();
   }
  }catch(err){H.toast(err.message,true);}finally{if(submit)submit.disabled=false;}
 },true);
 document.addEventListener('keydown',event=>{if(H.route()!=='inbox'||$('.modal-backdrop')||event.isComposing)return;
  if(event.target.matches('#reply-form textarea')&&event.key==='Enter'&&!event.shiftKey&&$('#chat-enter-send')?.checked){event.preventDefault();$('#reply-form').requestSubmit();}
  if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const rows=[...document.querySelectorAll('.conversation-item')],index=rows.findIndex(r=>r.dataset.id===active()?.id);const next=rows[index+(event.key==='ArrowUp'?-1:1)];if(next)H.openConversation(next.dataset.id);}
  if(event.altKey&&event.key.toLowerCase()==='i'){event.preventDefault();$('.chat-side')?.classList.toggle('care-side-open');}
 });
 return ()=>H.load();
}
