import {orderColumns,orderColumnWidth} from './order-workspace-model.js';
export function initOrderColumnResize({getWidths,setWidth,saveWidths,onError}){
 let drag=null,suppressClickUntil=0;
 const apply=(id,width)=>{
  const column=orderColumns.find(c=>c.id===id);if(!column)return;
  width=orderColumnWidth(column,width);setWidth(id,width);
  for(const table of document.querySelectorAll('.orders-dense')){
   const col=table.querySelector(`[data-orders-col="${id}"]`);if(!col)continue;col.style.width=width+'px';
   const total=[...table.querySelectorAll('col')].reduce((n,c)=>n+parseFloat(c.style.width||0),0);table.style.width=table.style.minWidth=total+'px';
   table.querySelector(`[data-orders-resize="${id}"]`)?.setAttribute('aria-valuenow',width);
  }
 };
 document.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-orders-resize]');if(!handle||event.button!==0)return;
  event.preventDefault();event.stopPropagation();const id=handle.dataset.ordersResize,column=orderColumns.find(c=>c.id===id);
  drag={id,pointerId:event.pointerId,x:event.clientX,width:getWidths()[id]??column.width,before:getWidths()[id]};
  document.body.classList.add('orders-resizing');
 },true);
 window.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();apply(drag.id,drag.width+event.clientX-drag.x);});
 const finish=async(event,cancel=false)=>{if(!drag||event?.pointerId!==undefined&&event.pointerId!==drag.pointerId)return;const previous=drag;drag=null;suppressClickUntil=Date.now()+300;document.body.classList.remove('orders-resizing');if(cancel)apply(previous.id,previous.before??previous.width);else try{await saveWidths();}catch(error){apply(previous.id,previous.before??previous.width);onError(error);}};
 window.addEventListener('pointerup',event=>void finish(event));window.addEventListener('pointercancel',event=>void finish(event,true));window.addEventListener('blur',event=>void finish(event,true));
 document.addEventListener('click',event=>{if(event.target.closest('[data-orders-resize]')||Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('keydown',async event=>{const handle=event.target.closest('[data-orders-resize]');if(!handle||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();const id=handle.dataset.ordersResize,column=orderColumns.find(c=>c.id===id),before=getWidths()[id]??column.width;apply(id,before+(event.key==='ArrowRight'?20:-20));try{await saveWidths();}catch(error){apply(id,before);onError(error);}});
}
