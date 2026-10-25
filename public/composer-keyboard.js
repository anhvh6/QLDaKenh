export function isMobileComposer(){return matchMedia('(hover: none) and (pointer: coarse)').matches||navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);}
export function composerEnterAction(event,mobile){
 if(event.key!=='Enter'||event.isComposing||event.keyCode===229||event.defaultPrevented)return 'ignore';
 if(mobile)return 'native';
 if(event.altKey)return 'newline';
 if(event.shiftKey||event.ctrlKey||event.metaKey)return 'native';
 return event.repeat?'block':'send';
}
export function handleComposerEnter(event){
 const action=composerEnterAction(event,isMobileComposer());
 if(['ignore','native'].includes(action))return;
 event.preventDefault();const box=event.target;
 if(action==='newline'){box.setRangeText('\n',box.selectionStart,box.selectionEnd,'end');box.dispatchEvent(new Event('input',{bubbles:true}));}
 if(action==='send')box.closest('form')?.requestSubmit();
}
