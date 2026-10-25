// Collapse unrelated realtime writes into at most one page refresh per interval.
// Explicit mutations/navigation still use the normal immediate refresh path.
export function backgroundRefresh(run,{allowed=()=>true,interval=5000,now=Date.now,schedule=setTimeout}={}){
 let last=-Infinity,pending=null;
 return ()=>{
  if(!allowed())return Promise.resolve(false);
  if(pending)return pending;
  const wait=Math.max(0,interval-(now()-last));
  pending=new Promise(resolve=>{schedule(resolve,wait);}).then(async()=>{if(!allowed())return false;last=now();await run();return true;}).finally(()=>{pending=null;});
  return pending;
 };
}
