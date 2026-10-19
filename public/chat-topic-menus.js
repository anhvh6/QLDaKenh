import {chatTagStyle} from './chat-list-style.js';
import {icon} from './icons.js';
import {sendQuickReply} from './quick-replies.js';
import {topicGroups} from './chat-topic-model.js';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ink=v=>{const hex=color(v).slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));return rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>165?'#24372f':'#fff';};
const color=v=>/^#[\da-f]{6}$/i.test(v)?v:'#768577';
const sorted=rows=>[...(rows||[])].sort((a,b)=>(a.sortOrder||1)-(b.sortOrder||1));
let H;
const views=new Map();
const viewKey=c=>H.state.user.id+':'+c.id;
function topicView(c){const key=viewKey(c);if(!views.has(key))views.set(key,{expanded:false,selected:null,scrollLeft:0});return views.get(key);}
function paintTopics(c){
 const form=document.querySelector('#reply-form');if(!form||form.dataset.id!==c.id)return;
 const oldStrip=form.querySelector('.chat-topic-strip');if(oldStrip&&!topicView(c).expanded)topicView(c).scrollLeft=oldStrip.scrollLeft;
 form.querySelector('.quick-tag-bar')?.remove();form.querySelector('.chat-topic-strip')?.remove();form.querySelector('.chat-topic-bar')?.remove();
 const groups=topicGroups(H.state,c.id),view=topicView(c),chosen=groups.find(t=>t.id===view.selected);
 form.querySelector('textarea').insertAdjacentHTML('beforebegin',`<div class="chat-topic-bar ${view.expanded?'expanded':''}"><div class="chat-topic-strip" aria-label="Chủ đề tin nhắn nhanh">${groups.map(topic=>`<button type="button" class="chat-topic-select" data-topic-select="${e(topic.id)}" aria-pressed="${view.selected===topic.id}" style="--topic-color:${color(topic.color)};--topic-ink:${ink(topic.color)}" ${topic.used?'title="Đã sử dụng trong hội thoại này"':''}>${e(topic.sortOrder??groups.indexOf(topic)+1)}- ${e(topic.name)}</button>`).join('')}</div><button type="button" class="chat-topic-expand" data-topic-expand aria-expanded="${view.expanded}" aria-label="${view.expanded?'Thu gọn chủ đề':'Hiện tất cả chủ đề'}">${view.expanded?'↓':'↑'}</button>${chosen?`<div class="chat-topic-popup" role="group" aria-label="${e(chosen.name)}">${chosen.rows.map(t=>`<button type="button" data-topic-reply="${e(t.id)}" title="Gửi ngay"><span><strong>(${e(t.number)})</strong> ${e((t.blocks?.find(b=>b.text)?.text||t.text||'Ảnh / tệp / danh bạ'))}</span><small>${t.blocks?.length||1} nội dung${t.shortcut?' · /'+e(t.shortcut):''}</small></button>`).join('')}</div>`:''}</div>`);
 const strip=form.querySelector('.chat-topic-strip');strip.scrollLeft=view.scrollLeft;strip.addEventListener('scroll',()=>{if(!view.expanded)view.scrollLeft=strip.scrollLeft;},{passive:true});
}
export function enhanceTopicMenus(host,c){H=host;const S=H.state,form=document.querySelector('#reply-form');if(!form)return;if(c.kind!=='comment')paintTopics(c);
 const head=document.querySelector('.chat-head,.comment-chat-head'),title=head?.querySelector('h3,.comment-name-line');head?.querySelector('.chat-header-tags')?.remove();if(!title)return;const tags=sorted(S.tags).filter(t=>t.active!==false),assigned=tags.filter(t=>(c.tags||[]).includes(t.name));title.insertAdjacentHTML(title.classList.contains('comment-name-line')?'beforeend':'afterend',`<details class="chat-header-tags" data-conversation="${e(c.id)}"><summary class="${assigned.length?'has-tags':''}" aria-label="Thẻ hội thoại" title="Thẻ hội thoại" style="color:${assigned.length?color(assigned[0].color):'var(--muted,#869087)'}">${icon('tag',18)}</summary><div class="chat-tag-popup"><strong>Thẻ hội thoại</strong>${tags.map(t=>`<button type="button" data-header-tag="${e(t.name)}" aria-pressed="${(c.tags||[]).includes(t.name)}" class="${(c.tags||[]).includes(t.name)?'assigned':''}" style="--tag-color:${color(t.color)};--tag-ink:${ink(t.color)}"><span>${icon('tag',16)}</span><span>${e(t.name)}</span><small>${(c.tags||[]).includes(t.name)?'✓':''}</small></button>`).join('')||'<p>Chưa có thẻ. Thêm thẻ trong Cài đặt.</p>'}</div></details>`);
 for(const menu of document.querySelectorAll('.chat-header-tags')){menu.addEventListener('pointerenter',ev=>{if(ev.pointerType!=='touch'){for(const other of document.querySelectorAll('.chat-header-tags'))if(other!==menu)other.open=false;menu.open=true;}});menu.addEventListener('pointerleave',ev=>{if(ev.pointerType!=='touch'&&!menu.contains(document.activeElement))menu.open=false;});menu.addEventListener('keydown',ev=>{if(ev.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});}
}
document.addEventListener('click',async ev=>{
 const selection=ev.target.closest('[data-topic-select]'),expand=ev.target.closest('[data-topic-expand]'),reply=ev.target.closest('[data-topic-reply]');
 if((selection||expand||reply)&&H){
  ev.preventDefault();const c=H.state.conversations.find(c=>c.id===document.querySelector('#reply-form')?.dataset.id);if(!c)return;const view=topicView(c);
  if(selection){view.selected=view.selected===selection.dataset.topicSelect?null:selection.dataset.topicSelect;paintTopics(c);return;}
  if(expand){view.expanded=!view.expanded;paintTopics(c);return;}
  const t=H.state.templates.find(t=>t.id===reply.dataset.topicReply);if(!t||reply.disabled)return;
  reply.disabled=true;view.selected=null;view.expanded=false;paintTopics(c);
  try{const result=await sendQuickReply(H,c,t);H.render();if(result.status!=='done')H.toast(result.status==='failed'?'Đã gửi '+result.nextIndex+'/'+result.blocks.length+' nội dung. '+result.error+' Bấm lại để tiếp tục phần chưa gửi.':'Chưa rõ kết quả. Kiểm tra trên kênh trước khi gửi lại.',true);}
  catch(error){H.toast(error.message,true);}finally{reply.disabled=false;}return;
 }
 const tag=ev.target.closest('[data-header-tag]');if(!tag||!H||tag.disabled)return;
 const menu=tag.closest('.chat-header-tags'),c=H.state.conversations.find(c=>c.id===menu.dataset.conversation),previous=[...(c.tags||[])],version=c.version;
 if(menu.dataset.saving)return;menu.dataset.saving='true';
 c.tags=previous.includes(tag.dataset.headerTag)?previous.filter(t=>t!==tag.dataset.headerTag):[...previous,tag.dataset.headerTag];
 const paintTags=()=>{for(const b of menu.querySelectorAll('[data-header-tag]')){const on=c.tags.includes(b.dataset.headerTag);b.classList.toggle('assigned',on);b.setAttribute('aria-pressed',String(on));b.querySelector('small').textContent=on?'✓':'';}
 const assigned=sorted(H.state.tags).find(t=>c.tags.includes(t.name));menu.querySelector('summary').classList.toggle('has-tags',!!assigned);menu.querySelector('summary').style.color=assigned?color(assigned.color):'var(--muted,#869087)';
 const card=[...document.querySelectorAll('.conversation-item,.comment-person-card')].find(el=>el.dataset.id===c.id),meta=card?.querySelector('.chat-list-meta,.comment-card-tags');if(meta)meta.innerHTML=c.tags.slice(0,2).map(name=>`<span class="chat-list-tag" style="${chatTagStyle(H.state.tags.find(t=>t.name===name)?.color)}">${e(name)}</span>`).join('');};
 paintTags();try{const saved=await H.api('/conversations/'+c.id,{method:'PATCH',body:{tags:c.tags,version}});Object.assign(c,saved);const current=H.state.conversations.find(x=>x.id===c.id);if(current&&current!==c)Object.assign(current,saved);paintTags();}catch(err){c.tags=previous;paintTags();H.toast(err.message,true);}finally{delete menu.dataset.saving;}});

document.addEventListener('keydown',ev=>{if(ev.key!=='Escape'||!H)return;const c=H.state.conversations.find(c=>c.id===document.querySelector('#reply-form')?.dataset.id);if(c&&(topicView(c).selected!==null||topicView(c).expanded)){topicView(c).selected=null;topicView(c).expanded=false;paintTopics(c);}});

document.addEventListener('pointerdown',ev=>{if(ev.pointerType!=='touch'&&ev.button===0&&ev.target.closest('.chat-topic-bar button'))ev.preventDefault();});

document.addEventListener('click',ev=>{if(!H||ev.composedPath().some(el=>el.classList?.contains('chat-topic-bar')))return;const c=H.state.conversations.find(c=>c.id===document.querySelector('#reply-form')?.dataset.id);if(c&&(topicView(c).selected!==null||topicView(c).expanded)){topicView(c).selected=null;topicView(c).expanded=false;paintTopics(c);}});

document.addEventListener('wheel',ev=>{const strip=ev.target.closest('.chat-topic-strip');if(!strip||strip.closest('.expanded')||strip.scrollWidth<=strip.clientWidth)return;const delta=Math.abs(ev.deltaX)>Math.abs(ev.deltaY)?ev.deltaX:ev.deltaY;if(delta){strip.scrollLeft+=delta;ev.preventDefault();}},{passive:false});

// Hover near either end to reveal more topics without using a trackpad.
let topicScrollFrame=0,topicScrollStrip=null,topicScrollSpeed=0;
function stopTopicScroll(){cancelAnimationFrame(topicScrollFrame);topicScrollFrame=0;topicScrollStrip=null;topicScrollSpeed=0;}
function scrollTopicEdge(){if(!topicScrollStrip?.isConnected||topicScrollStrip.closest('.expanded')){stopTopicScroll();return;}topicScrollStrip.scrollLeft+=topicScrollSpeed;topicScrollFrame=requestAnimationFrame(scrollTopicEdge);}
document.addEventListener('pointermove',ev=>{if(ev.pointerType==='touch')return;const strip=ev.target.closest('.chat-topic-strip');if(!strip||strip.closest('.expanded')||strip.scrollWidth<=strip.clientWidth){stopTopicScroll();return;}const bounds=strip.getBoundingClientRect(),edge=Math.min(60,bounds.width/4),x=ev.clientX-bounds.left,speed=x<edge?-4:x>bounds.width-edge?4:0;if(!speed){stopTopicScroll();return;}topicScrollStrip=strip;topicScrollSpeed=speed;if(!topicScrollFrame)topicScrollFrame=requestAnimationFrame(scrollTopicEdge);});
document.addEventListener('pointerout',ev=>{if(topicScrollStrip&&!topicScrollStrip.contains(ev.relatedTarget))stopTopicScroll();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTopicScroll();});
