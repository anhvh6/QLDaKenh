import {icon} from './icons.js';
import {mediaEscape as e} from './media-browser-view.js';
let current;
export function showMediaPreview(asset,options={}){
 current?.();const focus=document.activeElement,box=document.createElement('div');
 box.className='media-lightbox';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',asset.name||'Xem trước');
 const selected=()=>Boolean(options.isSelected?.());
 box.innerHTML=`<div class="media-lightbox-tools"><button type="button" data-preview-close aria-label="Đóng xem trước" title="Đóng xem trước">${icon('close',24)}</button>${options.toggle?`<button type="button" data-preview-select aria-label="Chọn ảnh/video" title="Chọn / bỏ chọn" aria-pressed="${selected()}">${icon('check',24)}</button>`:''}</div>${asset.type==='video'?`<video controls playsinline preload="none" src="${e(asset.url)}"></video>`:`<img src="${e(asset.url)}" alt="${e(asset.name)}">`}`;
 const close=()=>{box.querySelector('video')?.pause();box.remove();document.removeEventListener('keydown',key,true);if(current===close)current=null;if(focus?.isConnected)focus.focus();};
 const key=ev=>{if(ev.key==='Escape'){ev.preventDefault();ev.stopImmediatePropagation();close();}else if(ev.key==='Tab'){ev.preventDefault();ev.stopImmediatePropagation();const controls=[...box.querySelectorAll('button,video')];const i=controls.indexOf(document.activeElement);controls[(i+(ev.shiftKey?-1:1)+controls.length)%controls.length]?.focus();}};
 box.addEventListener('click',ev=>{if(ev.target===box||ev.target.closest('[data-preview-close]'))close();else if(ev.target.closest('[data-preview-select]')){options.toggle();const button=box.querySelector('[data-preview-select]');button.setAttribute('aria-pressed',String(selected()));button.setAttribute('aria-label',selected()?'Bỏ chọn ảnh/video':'Chọn ảnh/video');}});
 current=close;document.body.append(box);document.addEventListener('keydown',key,true);box.querySelector('button').focus();
}
export function bindMediaHold(selector,open){
 let hold,suppressUntil=0,suppressedTile;const cancel=()=>{clearTimeout(hold?.timer);hold=null;};
 document.addEventListener('pointerdown',ev=>{const tile=ev.target.closest(selector);if(!tile||ev.button!==0)return;cancel();hold={x:ev.clientX,y:ev.clientY,timer:setTimeout(()=>{suppressUntil=Date.now()+1000;suppressedTile=tile;cancel();open(tile);},600)};});
 document.addEventListener('pointermove',ev=>{if(hold&&Math.hypot(ev.clientX-hold.x,ev.clientY-hold.y)>10)cancel();});
 for(const type of ['pointerup','pointercancel'])document.addEventListener(type,cancel,true);
 document.addEventListener('contextmenu',ev=>{if(ev.target.closest(selector))ev.preventDefault();});
 document.addEventListener('click',ev=>{if(Date.now()<suppressUntil&&ev.target.closest(selector)===suppressedTile){ev.preventDefault();ev.stopImmediatePropagation();}},true);
}
