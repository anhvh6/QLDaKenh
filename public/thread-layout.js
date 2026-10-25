import {handleComposerEnter,isMobileComposer} from './composer-keyboard.js';
const compact=()=>matchMedia('(max-width:760px), (hover:none) and (pointer:coarse) and (max-width:1400px)').matches;
let host,frame,tailRequested=false;
function sizeComposer(box){
 if(!box)return;box.rows=1;box.setAttribute('enterkeyhint',isMobileComposer()?'enter':'send');const style=getComputedStyle(box),border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth),minimum=parseFloat(style.lineHeight)+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+border;
 const max=Math.max(minimum,Math.min(180,(window.visualViewport?.height||innerHeight)*.32));box.style.height='0px';box.style.maxHeight=max+'px';const height=Math.min(max,Math.max(minimum,box.scrollHeight+border));box.style.height=height+'px';box.style.overflowY=box.scrollHeight+border>height+1?'auto':'hidden';
}
export function enhanceThreadLayout(){
 const active=['inbox','comments'].includes(host?.route()),touch=compact(),selected=active&&!!host?.selection(),focused=active&&!!document.activeElement?.closest('#reply-form');
 document.body.classList.toggle('thread-compact',active&&touch);document.body.classList.toggle('thread-selected',selected&&touch);document.body.classList.toggle('thread-typing',focused&&touch);
 if(active&&touch){if(focused)document.body.classList.remove('menu-open');const header=document.querySelector('.topbar')?.getBoundingClientRect().height||0,nav=focused?0:document.querySelector('.mobile-bottom')?.getBoundingClientRect().height||0;document.documentElement.style.setProperty('--thread-height',Math.max(120,(window.visualViewport?.height||innerHeight)-header-nav)+'px');}
 sizeComposer(document.querySelector('#reply-form textarea'));
 if(tailRequested){tailRequested=false;if(active&&touch&&focused){const feed=document.querySelector('.chat-messages,.comment-feed-scroll');if(feed)feed.scrollTop=feed.scrollHeight;}}
}
const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(enhanceThreadLayout);};
export function initThreadLayout(options){
 // Keep the keyboard session alive in the original trusted tap, before submit awaits.
 for(const type of ['pointerdown','mousedown'])document.addEventListener(type,event=>{const button=event.target.closest?.('#reply-form [type=submit]');if(isMobileComposer()&&button&&!button.disabled&&event.button===0){event.preventDefault();button.form?.querySelector('textarea')?.focus({preventScroll:true});}},true);
 document.addEventListener('click',event=>{const button=event.target.closest?.('#reply-form [type=submit]');if(isMobileComposer()&&button&&!button.disabled)button.form?.querySelector('textarea')?.focus({preventScroll:true});},true);
 document.addEventListener('keydown',event=>{if(host?.route()==='comments'&&event.target.matches('#reply-form textarea')&&!document.querySelector('.modal-backdrop'))handleComposerEnter(event);});
 host=options;document.addEventListener('input',event=>{if(event.target.matches('#reply-form textarea')){sizeComposer(event.target);schedule();}});
 const keyboardLayout=()=>{if(compact()&&document.activeElement?.matches('#reply-form textarea'))tailRequested=true;schedule();};
 document.addEventListener('focusin',keyboardLayout);document.addEventListener('focusout',()=>setTimeout(schedule,0));window.addEventListener('resize',keyboardLayout);window.visualViewport?.addEventListener('resize',keyboardLayout);window.visualViewport?.addEventListener('scroll',schedule);
 window.addEventListener('popstate',event=>{const route=location.hash.slice(1);if(compact()&&['inbox','comments'].includes(route)){host.remember();host.select(event.state?.threadRoute===route?event.state.threadId||null:null);host.render();}});
 return {
  open(id,route){if(!compact()||route!==host.route())return;host.remember();if(!host.selection()){history.replaceState({...history.state,threadRoute:route,threadId:null},'',location.href);history.pushState({...history.state,threadRoute:route,threadId:id},'',location.href);}else history.replaceState({...history.state,threadRoute:route,threadId:id},'',location.href);},
  back(){host.remember();if(compact()&&history.state?.threadRoute===host.route()&&history.state?.threadId){history.back();return;}host.select(null);host.render();}
 };
}
