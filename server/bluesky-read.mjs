// GET-only AppView fallback; credentials and publication writes never enter this path.
export async function blueskyPublicRead(method,params,request){
 if(!['app.bsky.feed.getPosts','app.bsky.feed.getPostThread'].includes(method))throw Error('Unsupported Bluesky read.');
 const suffix='/xrpc/'+method+'?'+new URLSearchParams(params),options={headers:{Accept:'application/json','User-Agent':'QLDaKenh/2.1'},signal:AbortSignal.timeout(12000)};
 try{return await request('https://public.api.bsky.app'+suffix,options);}catch(error){
  const transient=error.retryable||error.providerStatus===429||error.providerStatus>=500||error.providerStatus===403&&(error.responseFormat==='html'||/HTML/i.test(error.message));if(!transient)throw error;
  return request('https://api.bsky.app'+suffix,{...options,signal:AbortSignal.timeout(12000)});
 }
}
export function resumeSocialVerification(p,c){return p.status==='failed'&&p.socialVerification&&!!p.externalId&&['bluesky','tumblr'].includes(c?.provider);}
export function publicationFailure(error,phase){return {phase,host:error.providerHost||'',path:error.providerPath||'',http:error.providerStatus||null,responseFormat:error.responseFormat||'',mediaStage:!!error.mediaStage,code:error.providerCode||'',at:new Date().toISOString()};}
