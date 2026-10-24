import {displayLibraryDate,libraryDay} from './content-library-model.js';
// A small local calendar keeps DD/MM/YY consistent across desktop and Android.
export function initLibraryDatePicker(getRange){
 let popup=null,input=null,month='';
 const close=()=>{popup?.remove();popup=null;input?.setAttribute('aria-expanded','false');input=null;};
 function draw(){
  const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),offset=(first.getUTCDay()+6)%7,today=libraryDay(new Date().toISOString()),range=getRange(),selected=range[input.dataset.libraryDate];
  popup.innerHTML=`<div class="library-month-heading"><button type="button" data-month-step="-1" aria-label="Tháng trước">‹</button><strong>Tháng ${m}/${year}</strong><button type="button" data-month-step="1" aria-label="Tháng sau">›</button></div><div class="library-month-grid">${['T2','T3','T4','T5','T6','T7','CN'].map(d=>`<small>${d}</small>`).join('')}${Array.from({length:42},(_,n)=>{
   const d=new Date(Date.UTC(year,m-1,1-offset+n)),iso=d.toISOString().slice(0,10),disabled=input.dataset.libraryDate==='from'?iso>range.to:iso<range.from;
   return `<button type="button" data-library-day="${iso}" aria-label="${displayLibraryDate(iso)}" aria-pressed="${iso===selected}" class="${iso.slice(0,7)!==month?'other-month ':''}${iso===today?'today':''}" ${disabled?'disabled':''}>${d.getUTCDate()}</button>`;
  }).join('')}</div>`;
 }
 function open(el){if(input===el&&popup?.isConnected)return;close();input=el;month=getRange()[el.dataset.libraryDate].slice(0,7);popup=document.createElement('div');popup.className='library-month';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Chọn ngày');el.setAttribute('aria-haspopup','dialog');el.setAttribute('aria-expanded','true');el.parentElement.append(popup);draw();
  const box=popup.getBoundingClientRect(),anchor=el.parentElement.getBoundingClientRect();popup.style.right='auto';popup.style.left=(Math.max(12,Math.min(box.left,innerWidth-box.width-12))-anchor.left)+'px';
  popup.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;event.preventDefault();event.stopPropagation();if(button.dataset.monthStep){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+Number(button.dataset.monthStep),1)).toISOString().slice(0,7);draw();return;}if(button.dataset.libraryDay){const target=input;target.value=displayLibraryDate(button.dataset.libraryDay);close();target.dispatchEvent(new Event('change',{bubbles:true}));}});
 }
 document.addEventListener('focusin',event=>{if(event.target.matches('[data-library-date]'))open(event.target);else if(popup&&!event.target.closest('.library-month'))close();});
 document.addEventListener('click',event=>{const el=event.target.closest('[data-library-date]');if(el)open(el);else if(!event.target.closest('.library-month'))close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
}
