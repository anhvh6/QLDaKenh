export function supabaseAuth({url,key,email,password,fetcher=(...args)=>fetch(...args),clock=Date.now}){
 let token,expires=0,pending;
 return async()=>{
  if(!token||clock()>=expires){
   if(!pending)pending=(async()=>{
    const r=await fetcher(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('Supabase Auth Failed');const auth=await r.json();
    if(!auth.access_token||!Number.isFinite(Number(auth.expires_in)))throw Error('Supabase Auth Invalid');
    token=auth.access_token;expires=clock()+Math.max(0,Number(auth.expires_in)-60)*1000;
   })().finally(()=>{pending=null;});
   await pending;
  }
  return {apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'};
 };
}
