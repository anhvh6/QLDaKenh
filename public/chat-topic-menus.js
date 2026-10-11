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
function topicView(c){const key=viewKey(c);if(!views.has(key))views.set(key,{expanded:false,selected:null});return views.get(key);}
function paintTopics(c){
 const form=document.querySelector('#reply-form');if(!form||form.dataset.id!==c.id)return;
 form.querySelector('.quick-tag-bar')?.remove();form.querySelector('.chat-topic-strip')?.remove();form.querySelector('.chat-topic-bar')?.remove();
 const groups=topicGroups(H.state,c.id),view=topicView(c),chosen=groups.find(t=>t.id===view.selected);
 form.querySelector('textarea').insertAdjacentHTML('beforebegin',`<div class="chat-topic-bar ${view.expanded?'expanded':''}"><div class="chat-topic-strip" aria-label="Chủ đề tin nhắn nhanh">${groups.map(topic=>`<button type="button" class="chat-topic-select" data-topic-select="${e(topic.id)}" aria-pressed="${view.selected===topic.id}" style="--topic-color:${color(topic.color)};--topic-ink:${ink(topic.color)}" ${topic.used?'title="Đã sử dụng trong hội thoại này"':''}>${e(topic.name)}</button>`).join('')}</div><button type="button" class="chat-topic-expand" data-topic-expand aria-expanded="${view.expanded}" aria-label="${view.expanded?'Thu gọn chủ đề':'Hiện tất cả chủ đề'}">${view.expanded?'↓':'↑'}</button>${chosen?`<div class="chat-topic-popup" role="group" aria-label="${e(chosen.name)}">${chosen.rows.map(t=>`<button type="button" data-topic-reply="${e(t.id)}" title="Gửi ngay"><span><strong>(${e(t.number)})</strong> ${e((t.blocks?.find(b=>b.text)?.text||t.text||'Ảnh / tệp / danh bạ').slice(0,180))}</span><small>${t.blocks?.length||1} nội dung${t.shortcut?' · /'+e(t.shortcut):''}</small></button>`).join('')}</div>`:''}</div>`);
}
export function enhanceTopicMenus(host,c){H=host;const S=H.state,form=document.querySelector('#reply-form');if(!form)return;paintTopics(c);
 const head=document.querySelector('.chat-head'),title=head?.querySelector('h3');head?.querySelector('.chat-header-tags')?.remove();if(!title)return;const tags=sorted(S.tags).filter(t=>t.active!==false),assigned=tags.filter(t=>(c.tags||[]).includes(t.name));title.insertAdjacentHTML('afterend',`<details class="chat-header-tags" data-conversation="${e(c.id)}"><summary class="${assigned.length?'has-tags':''}" aria-label="Thẻ hội thoại" title="Thẻ hội thoại" style="color:${assigned.length?color(assigned[0].color):'var(--muted,#869087)'}">${icon('tag',18)}</summary><div class="chat-tag-popup"><strong>Thẻ hội thoại</strong>${tags.map(t=>`<button type="button" data-header-tag="${e(t.name)}" aria-pressed="${(c.tags||[]).includes(t.name)}" class="${(c.tags||[]).includes(t.name)?'assigned':''}" style="--tag-color:${color(t.color)};--tag-ink:${ink(t.color)}"><span>${icon('tag',16)}</span><span>${e(t.name)}</span><small>${(c.tags||[]).includes(t.name)?'✓':''}</small></button>`).join('')||'<p>Chưa có thẻ. Thêm thẻ trong Cài đặt.</p>'}</div></details>`);
 for(const menu of document.querySelectorAll('.chat-header-tags')){menu.addEventListener('pointerenter',ev=>{if(ev.pointerType!=='touch'){for(const other of document.querySelectorAll('.chat-header-tags'))if(other!==menu)other.open=false;menu.open=true;}});menu.addEventListener('pointerleave',ev=>{if(ev.pointerType!=='touch'&&!menu.contains(document.activeElement))menu.open=false;});menu.addEventListener('keydown',ev=>{if(ev.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});}
}
document.addEventListener('click',async ev=>{
 const selection=ev.target.closest('[data-topic-select]'),expand=ev.target.closest('[data-topic-expand]'),reply=ev.target.closest('[data-topic-reply]');
 if((selection||expand||reply)&&H){
  ev.preventDefault();const c=H.state.conversations.find(c=>c.id===document.querySelector('#reply-form')?.dataset.id);if(!c)return;const view=topicView(c);
  if(selection){view.selected=view.selected===selection.dataset.topicSelect?null:selection.dataset.topicSelect;paintTopics(c);return;}
  if(expand){view.expanded=!view.expanded;paintTopics(c);return;}
  const t=H.state.templates.find(t=>t.id===reply.dataset.topicReply);if(!t||reply.disabled)return;
  reply.disabled=true;
  try{const result=await sendQuickReply(H,c,t);view.selected=null;await H.refresh(false);H.render();H.toast(result.status==='done'?'Đã gửi tin nhắn nhanh':result.status==='failed'?'Đã gửi '+result.nextIndex+'/'+result.blocks.length+' nội dung. '+result.error+' Bấm lại để tiếp tục phần chưa gửi.':'Chưa rõ kết quả. Kiểm tra trên kênh trước khi gửi lại.',result.status!=='done');}
  catch(error){H.toast(error.message,true);}finally{reply.disabled=false;}return;
 }
 const tag=ev.target.closest('[data-header-tag]');if(!tag||!H||tag.disabled)return;const menu=tag.closest('.chat-header-tags'),c=H.state.conversations.find(c=>c.id===menu.dataset.conversation);tag.disabled=true;try{const tags=(c.tags||[]).includes(tag.dataset.headerTag)?c.tags.filter(t=>t!==tag.dataset.headerTag):[...(c.tags||[]),tag.dataset.headerTag];Object.assign(c,await H.api('/conversations/'+c.id,{method:'PATCH',body:{tags,version:c.version}}));for(const b of menu.querySelectorAll('[data-header-tag]')){const on=tags.includes(b.dataset.headerTag);b.classList.toggle('assigned',on);b.setAttribute('aria-pressed',String(on));b.querySelector('small').textContent=on?'✓':'';}const assigned=sorted(H.state.tags).find(t=>tags.includes(t.name));menu.querySelector('summary').classList.toggle('has-tags',!!assigned);menu.querySelector('summary').style.color=assigned?color(assigned.color):'var(--muted,#869087)';}catch(err){H.toast(err.message,true);}finally{tag.disabled=false;}});

document.addEventListener('keydown',ev=>{if(ev.key!=='Escape'||!H)return;const c=H.state.conversations.find(c=>c.id===document.querySelector('#reply-form')?.dataset.id);if(c&&topicView(c).selected!==null){topicView(c).selected=null;paintTopics(c);}});

document.addEventListener('pointerdown',ev=>{if(ev.button===0&&ev.target.closest('.chat-topic-bar button'))ev.preventDefault();});

document.addEventListener('click',ev=>{if(!H||ev.composedPath().some(el=>el.classList?.contains('chat-topic-bar')))return;const c=H.state.conversations.find(c=>c.id===document.querySelector('#reply-form')?.dataset.id);if(c&&topicView(c).selected!==null){topicView(c).selected=null;paintTopics(c);}});
