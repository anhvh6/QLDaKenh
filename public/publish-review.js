const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fieldNames={title:'Tiêu đề',caption:'Nội dung',source:'Nguồn reup'};
// Keep identical advice once, with the affected accounts listed together.
export function groupPublishReview(items=[]){
 const groups=new Map();
 for(const item of items){const key=JSON.stringify([item.code||'',item.field||'',item.message||'',item.excerpt||'']);let group=groups.get(key);if(!group){group={...item,channels:[],links:[]};groups.set(key,group);}const name=item.channel||'Bài viết';if(!group.channels.includes(name))group.channels.push(name);if(item.policyUrl&&!group.links.some(l=>l.url===item.policyUrl))group.links.push({url:item.policyUrl,channel:name});}
 return [...groups.values()];
}
export function publishReviewHTML(review,intent){const hard=review.issues||[],warnings=review.warnings||[];
 const list=items=>'<ul>'+groupPublishReview(items).map(item=>`<li><strong>${e(item.channels.join(', '))}</strong>${item.field?' · '+e(fieldNames[item.field]||item.field):''}: ${e(item.message)}${item.excerpt?`<blockquote>${e(item.excerpt)}</blockquote>`:''}${item.links.map(link=>` <a href="${e(link.url)}" target="_blank" rel="noopener noreferrer">${item.links.length>1?'Chính sách '+e(link.channel):'Chính sách nền tảng'} ↗</a>`).join('')}</li>`).join('')+'</ul>';
 return `<section class="publish-validation ${hard.length?'has-errors':'has-warnings'}" role="alert" tabindex="-1"><strong>${hard.length?'Cần sửa trước khi '+(intent==='now'?'đăng bài':'lên lịch'):'Cảnh báo trước khi '+(intent==='now'?'đăng bài':'lên lịch')}</strong>${hard.length?list(hard):''}${warnings.length?'<h4>Cảnh báo có thể tiếp tục đăng</h4>'+list(warnings):''}<div class="row wrap"><button type="button" class="btn" data-publish-edit>Quay lại sửa</button>${!hard.length&&warnings.length?`<button type="button" class="btn primary" data-publish-continue>${intent==='now'?'Vẫn đăng ngay':'Vẫn lên lịch'}</button>`:''}</div></section>`;
}
export function showPublishReview(form,review,intent){
 const box=form.querySelector('.form-error');box.innerHTML=publishReviewHTML(review,intent);box.scrollIntoView({block:'start',behavior:'smooth'});box.querySelector('section')?.focus({preventScroll:true});
 box.querySelector('[data-publish-edit]').onclick=()=>{delete form.dataset.warningAcknowledgement;const issue=(review.issues||[])[0]||(review.warnings||[])[0],variant=issue?.channelId&&form.elements.namedItem('variant_'+issue.channelId),field=issue?.field==='title'?form.elements.namedItem('title'):variant||form.elements.namedItem('caption');box.replaceChildren();if(field){const details=field.closest('details');if(details)details.open=true;field.focus();}};
 const next=box.querySelector('[data-publish-continue]');if(next)next.onclick=()=>{form.dataset.warningAcknowledgement=review.reviewToken;const submit=[...form.querySelectorAll('button[type=submit]')].find(b=>b.value===intent);if(submit&&!submit.disabled)form.requestSubmit(submit);};
}
if(typeof document!=='undefined')for(const type of ['input','change'])document.addEventListener(type,event=>{const form=event.target.closest('#content-form');if(form)delete form.dataset.warningAcknowledgement;});
