import {commentPostMedia} from './comment-post-media.js';
import {icon} from './icons.js';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=v=>Number.isFinite(v)?Number(v).toLocaleString('vi-VN'):'—';
const stamp=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):'Chưa có thời gian đăng';};
const stat=(name,label,n)=>`<span class="comment-stat" title="${e(label)}${n==null?' · Nền tảng chưa cung cấp dữ liệu':''}">${icon(name,14)}<span>${count(n)}</span></span>`;
const mediaURL=v=>{if(typeof v==='string'&&/^\/uploads\/[a-zA-Z0-9_.%?=&/-]+$/.test(v)&&!v.includes('..'))return v;try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
export function commentPostText(text=''){text=String(text);const short=[...text].slice(0,220).join('');return text.length>short.length?`<details class="comment-post-text"><summary><span class="comment-post-short">${e(short)}… </span><span class="comment-expand">Xem thêm</span><span class="comment-collapse">Thu gọn</span></summary><p>${e(text)}</p></details>`:`<p class="comment-post-excerpt">${e(text||'Bài viết không có nội dung văn bản hoặc chưa đọc được nội dung.')}</p>`;}
export function commentVideoHTML(m){
 const url=mediaURL(m.url);if(!url)return '';let poster=mediaURL(m.poster);
 if(m.type==='embed'){const u=new URL(url);if(!(u.hostname==='www.youtube-nocookie.com'&&u.pathname.startsWith('/embed/'))&&!(u.hostname==='www.facebook.com'&&u.pathname==='/plugins/video.php'))return '';if(!poster&&u.hostname==='www.youtube-nocookie.com')poster='https://i.ytimg.com/vi/'+u.pathname.split('/').pop()+'/hqdefault.jpg';}
 return '<div class="comment-video-shell" data-comment-media="'+e(url)+'"><button type="button" class="comment-video-launch" data-comment-video="'+e(url)+'" data-kind="'+(m.type==='embed'?'embed':'video')+'" aria-label="Phát video bài viết">'+(poster?'<img src="'+e(poster)+'" alt="Ảnh video" loading="lazy">':'')+'<span>'+icon('play',28)+'</span></button></div>';
}
export function commentPostMediaHTML(post){const items=post.media?.length?post.media:commentPostMedia(post);return '<div class="comment-post-media">'+items.map(m=>{const url=mediaURL(m.url);if(!url)return '';return ['video','embed'].includes(m.type)?commentVideoHTML(m):m.type==='image'?'<img src="'+e(url)+'" alt="Ảnh bài viết gốc" loading="lazy">':'';}).join('')+'</div>';}
export function initCommentVideo(){document.addEventListener('click',event=>{const button=event.target.closest?.('[data-comment-video]');if(!button)return;const url=mediaURL(button.dataset.commentVideo);if(!url)return;const media=document.createElement(button.dataset.kind==='embed'?'iframe':'video');if(media.tagName==='IFRAME'){const u=new URL(url);if(!((u.hostname==='www.youtube-nocookie.com'&&u.pathname.startsWith('/embed/'))||(u.hostname==='www.facebook.com'&&u.pathname==='/plugins/video.php')))return;u.searchParams.set('autoplay','1');media.src=u.href;media.title='Video bài viết gốc';media.allow='autoplay; fullscreen; picture-in-picture';media.allowFullscreen=true;}else{media.src=url;media.controls=true;media.playsInline=true;media.preload='none';}button.replaceWith(media);if(media.tagName==='VIDEO')void media.play().catch(()=>{});});}
export function commentContextHTML(data,selected='current'){
 const p=data.post||{},parent=data.parent;
 return `<section class="comment-original-post"><div class="comment-original-heading">${p.url?`<a class="icon-btn" href="${e(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Xem bài viết gốc" title="Xem bài viết gốc">${icon('eye',18)}</a>`:''}</div>${commentPostText(p.text)}${commentPostMediaHTML(p)}<div class="comment-post-stats">${stat('thumb-up','Lượt thích',p.likes)}${stat('inbox','Bình luận',p.comments)}${stat('share','Lượt chia sẻ',p.shares)}<time>${e(stamp(p.createdAt))}</time></div></section>${data.parentId?`<section class="comment-parent-context"><strong>Đang trả lời bình luận gốc</strong>${parent?`<div class="comment-parent-author">${e(parent.name)}<time>${e(stamp(parent.createdAt))}</time></div><p>${e(parent.text||'Bình luận có nội dung đính kèm')}</p><div class="comment-parent-actions">${stat('thumb-up','Lượt thích',parent.likes)}${stat('thumb-down','Lượt không thích',parent.dislikes)}<button type="button" class="text-btn ${selected==='parent'?'active':''}" data-action="comment-reply-target" data-target="parent" aria-label="Trả lời bình luận gốc">${icon('send',14)}Trả lời bình luận gốc</button></div>`:'<p>Không đọc được bình luận gốc. Kiểm tra quyền truy cập hoặc mở bài viết gốc.</p>'}</section>`:''}${selected==='parent'?`<button type="button" class="icon-btn" data-action="comment-reply-target" data-target="current" aria-label="Quay lại trả lời bình luận của khách">${icon('close',14)}</button>`:''}${data.errors?.length?`<details class="comment-context-errors"><summary>Một số dữ liệu chưa lấy được</summary>${data.errors.map(x=>`<p>${e(x)}</p>`).join('')}</details>`:''}`;
}

// Patch a connected player in place: detaching an iframe, even temporarily,
// causes the browser to navigate and download the player again.
export function paintCommentApp(root,html,preserve=false){
 if(!preserve){root.innerHTML=html;return;}
 const template=document.createElement('template');template.innerHTML=html;
 const key=n=>n.nodeType===1?(n.id||n.dataset.commentMedia||n.dataset.message||''):'';
 const patch=(old,next)=>{
  if(old.nodeType!==next.nodeType||old.nodeName!==next.nodeName){const replacement=next.cloneNode(true);old.replaceWith(replacement);return replacement;}
  if(old.nodeType!==1){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;return;}
  if(old.dataset.commentMedia&&old.dataset.commentMedia===next.dataset.commentMedia)return;
  for(const a of [...old.attributes])if(!next.hasAttribute(a.name))old.removeAttribute(a.name);
  for(const a of next.attributes)if(old.getAttribute(a.name)!==a.value)old.setAttribute(a.name,a.value);
  children(old,next);
 };
 const children=(old,next)=>{let cursor=old.firstChild;for(const n of [...next.childNodes]){let match=cursor;const k=key(n);if(k&&key(match||{})!==k)match=[...old.childNodes].find(c=>key(c)===k)||null;if(!match){old.insertBefore(n.cloneNode(true),cursor);continue;}if(match!==cursor)old.insertBefore(match,cursor);const patched=patch(match,n)||match;cursor=patched.nextSibling;}while(cursor){const after=cursor.nextSibling;cursor.remove();cursor=after;}};
 children(root,template.content);
}
