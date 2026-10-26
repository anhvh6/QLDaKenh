// Share only requests currently in flight; never persist private workspace data.
export function stateRequests(api) {
 const pending=new Map();
 return (params,userId='')=>{
  const wire=new URLSearchParams(params);
  // Older backends recognize workspace and otherwise fall back to full chat history.
  if(['phacdo','settings'].includes(wire.get('view'))){wire.set('shell',wire.get('view'));wire.set('view','workspace');}
  const url='/state?'+wire,key=userId+':'+url;
  if(pending.has(key))return pending.get(key);
  const request=Promise.resolve().then(()=>api(url)).finally(()=>{if(pending.get(key)===request)pending.delete(key);});
  pending.set(key,request);return request;
 };
}
