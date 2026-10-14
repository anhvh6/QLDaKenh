export function menuPosition(anchor,menu,viewport,area){
 const leftEdge=Math.max(8,area?area.left+8:8),rightEdge=Math.min(viewport.width-8,area?area.right-8:viewport.width-8),topEdge=Math.max(8,area?area.top+8:8),bottomEdge=Math.min(viewport.height-8,area?area.bottom-8:viewport.height-8);
 const width=Math.min(menu.width,Math.max(0,rightEdge-leftEdge)),maxHeight=Math.max(0,bottomEdge-topEdge),height=Math.min(menu.height,maxHeight);
 const below=anchor.bottom+6,top=below+height<=bottomEdge?below:Math.max(topEdge,Math.min(anchor.top-height-6,bottomEdge-height));
 return {left:Math.max(leftEdge,Math.min(anchor.right-width,rightEdge-width)),top,width,maxHeight};
}
let closeActiveMenus=()=>{};
export function closeMessageMenus(){closeActiveMenus();}
export function initChatMenuLayout(){
 const panels=new Map();
 const close=detail=>{const panel=panels.get(detail);if(panel){panel.classList.remove('chat-message-menu-popup');panel.removeAttribute('style');if(detail.isConnected)detail.append(panel);else panel.remove();panels.delete(detail);}};
 document.addEventListener('toggle',event=>{const detail=event.target;if(!detail.matches?.('.message-more'))return;if(!detail.open){close(detail);return;}const panel=detail.querySelector(':scope > div');if(!panel)return;requestAnimationFrame(()=>{if(!detail.isConnected||!detail.open)return;for(const previous of panels.keys())if(previous!==detail){previous.open=false;close(previous);}const bounds=panel.getBoundingClientRect();panels.set(detail,panel);panel.classList.add('chat-message-menu-popup');document.body.append(panel);const place=menuPosition(detail.querySelector('summary').getBoundingClientRect(),bounds,{width:innerWidth,height:innerHeight},detail.closest('.chat-messages')?.getBoundingClientRect());Object.assign(panel.style,{left:place.left+'px',top:place.top+'px',width:place.width+'px',maxHeight:place.maxHeight+'px'});});},true);
 document.addEventListener('pointerdown',event=>{for(const detail of panels.keys())if(!detail.contains(event.target)&&!panels.get(detail).contains(event.target)){detail.open=false;close(detail);}},true);
 const closeAll=()=>{for(const detail of panels.keys()){detail.open=false;close(detail);}};
 closeActiveMenus=closeAll;
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAll();});window.addEventListener('resize',closeAll);
 const cleanup=()=>{for(const detail of panels.keys())if(!detail.isConnected)close(detail);};new MutationObserver(cleanup).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('scroll',event=>{if(event.target.matches?.('.chat-messages'))closeAll();},true);
}
