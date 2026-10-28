// Uploading/reading media cannot publish a post. Retry this stage only; the
// caller must keep final publication requests outside this wrapper.
export async function mediaStageRequest(request,url,options={},sleep=ms=>new Promise(r=>setTimeout(r,ms))){
 for(let attempt=0;attempt<3;attempt++){
  try{return await request(url,options);}catch(error){
   const data=error.providerData,job=data?.jobStatus||data;
   if(new URL(url).hostname==='video.bsky.app'&&(job?.blob?.ref||job?.jobId&&[job.error,data?.error].includes('already_exists')))return data;
   const transient=error.unknown||error.retryable||error.providerStatus>=500||error.providerStatus===403&&error.responseFormat==='html'||/fetch failed|network|timeout/i.test(error.message);
   if(transient&&attempt<2){await sleep(500*2**attempt);continue;}
   throw Object.assign(error,{unknown:false,mediaStage:true});
  }
 }
}
