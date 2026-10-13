export function menuPosition(anchor,menu,viewport){
 const width=Math.min(menu.width,viewport.width-16),height=Math.min(menu.height,viewport.height-16);
 const below=anchor.bottom+6,top=below+height<=viewport.height-8?below:Math.max(8,anchor.top-height-6);
 return {left:Math.max(8,Math.min(anchor.right-width,viewport.width-width-8)),top,width,maxHeight:viewport.height-16};
}
let closeActiveMenus=()=>{};
export function closeMessageMenus(){closeActiveMenus();}
export function initChatMenuLayout(){
 const panels=new Map();
 const close=detail=>{const panel=panels.get(detail);if(panel){panel.classList.remove('chat-message-menu-popup');panel.removeAttribute('style');if(detail.isConnected)detail.append(panel);else panel.remove();panels.delete(detail);}};
 document.addEventListener('toggle',event=>{const detail=event.target;if(!detail.matches?.('.message-more'))return;if(!detail.open){close(detail);return;}const panel=detail.querySelector(':scope > div');if(!panel)return;requestAnimationFrame(()=>{if(!detail.isConnected||!detail.open)return;for(const previous of panels.keys())if(previous!==detail){previous.open=false;close(previous);}const bounds=panel.getBoundingClientRect();panels.set(detail,panel);panel.classList.add('chat-message-menu-popup');document.body.append(panel);const place=menuPosition(detail.querySelector('summary').getBoundingClientRect(),bounds,{width:innerWidth,height:innerHeight});Object.assign(panel.style,{left:place.left+'px',top:place.top+'px',width:place.width+'px',maxHeight:place.maxHeight+'px'});});},true);
 document.addEventListener('pointerdown',event=>{for(const detail of panels.keys())if(!detail.contains(event.target)&&!panels.get(detail).contains(event.target)){detail.open=false;close(detail);}},true);
 const closeAll=()=>{for(const detail of panels.keys()){detail.open=false;close(detail);}};
 closeActiveMenus=closeAll;
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAll();});window.addEventListener('resize',closeAll);
 const cleanup=()=>{for(const detail of panels.keys())if(!detail.isConnected)close(detail);};new MutationObserver(cleanup).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('scroll',event=>{if(event.target.matches?.('.chat-messages'))closeAll();},true);
}
