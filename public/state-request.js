// Share only requests currently in flight; never persist private workspace data.
export function stateRequests(api) {
 const pending=new Map();
 return (params,userId='')=>{
  const url='/state?'+params,key=userId+':'+url;
  if(pending.has(key))return pending.get(key);
  const request=Promise.resolve().then(()=>api(url)).finally(()=>{if(pending.get(key)===request)pending.delete(key);});
  pending.set(key,request);return request;
 };
}
