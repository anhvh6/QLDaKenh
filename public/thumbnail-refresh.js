// A valid SVG placeholder fires load, not error. Retry it after background generation.
export function createThumbnailRefresh({images,visible,schedule=setTimeout,cancel=clearTimeout,now=Date.now}={}){
 const entries=new Map();
 function observe(image,networkError=false){
  const key=image.dataset?.videoThumbnail;if(!key||!image.isConnected)return;
  const width=image.naturalWidth,height=image.naturalHeight;
  const state=entries.get(key)||{attempts:0,failures:0,network:0,at:now(),timer:null};entries.set(key,state);
  while(entries.size>256){const first=entries.keys().next().value;cancel(entries.get(first).timer);entries.delete(first);}
  if(!networkError&&width>2){cancel(state.timer);state.timer=null;state.ready=image.currentSrc||image.src;return;}
  if(!networkError&&!((width===1||width===2)&&height===1))return;
  if(state.ready){if(image.src!==state.ready)image.src=state.ready;return;}
  if(state.timer||!visible(image)||now()-state.at>10*60000)return;
  const failed=!networkError&&width===1;
  if(state.attempts>=12||failed&&state.failures>=2||networkError&&state.network>=3)return;
  const delay=Math.max((state.nextAt||0)-now(),failed?60000:Math.min(15000,1000*2**Math.min(state.attempts,4)),0);
  state.timer=schedule(()=>{
   state.timer=null;const targets=images(key).filter(img=>img.isConnected&&visible(img)&&img.naturalWidth<=2);
   if(!targets.length)return;
   state.attempts++;if(failed)state.failures++;if(networkError)state.network++;
   state.nextAt=now()+(failed?60000:Math.min(15000,1000*2**Math.min(state.attempts,4)));
   for(const img of targets)img.src=key+(key.includes('?')?'&':'?')+'retry='+state.attempts;
  },delay);
 }
 return {observe};
}
if(typeof document!=='undefined'){
 const images=key=>[...document.querySelectorAll('img[data-video-thumbnail]')].filter(img=>img.dataset.videoThumbnail===key);
 const visible=img=>{if(document.hidden)return false;const r=img.getBoundingClientRect();return r.bottom>=-300&&r.top<=innerHeight+300&&r.width>0&&r.height>0;};
 const refresh=createThumbnailRefresh({images,visible});
 document.addEventListener('load',event=>{if(event.target.matches?.('img[data-video-thumbnail]'))refresh.observe(event.target);},true);
 document.addEventListener('error',event=>{if(event.target.matches?.('img[data-video-thumbnail]'))refresh.observe(event.target,true);},true);
 let scheduled=false;const scan=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;for(const img of document.querySelectorAll('img[data-video-thumbnail]'))if(img.complete)refresh.observe(img,!img.naturalWidth);});};
 document.addEventListener('scroll',scan,true);document.addEventListener('visibilitychange',scan);window.addEventListener('resize',scan);
}
