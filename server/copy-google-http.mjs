const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Only read requests and token refreshes are safe to repeat. Never replay a
// folder/file creation or an upload after an uncertain network response.
export async function copyGoogleFetch(url,options={},operation='Kết nối Google Drive',deps={}){
 const target=new URL(url),method=String(options.method||'GET').toUpperCase();
 const retryable=method==='GET'||method==='POST'&&target.origin==='https://oauth2.googleapis.com'&&target.pathname==='/token';
 const request=deps.fetch||globalThis.fetch,delay=deps.pause||pause,attempts=retryable?3:1;
 for(let attempt=0;attempt<attempts;attempt++){
  let response;
  try{response=await request(url,{...options,signal:options.signal||AbortSignal.timeout(120000)});}
  catch(error){if(attempt+1<attempts){await delay(300*(attempt+1));continue;}const code=error.cause?.code||error.code||error.name;throw Object.assign(new Error(operation+': kết nối mạng tới Google bị gián đoạn'+(/^[A-Z_0-9]+$/.test(code)?' ('+code+')':'')+'. Vui lòng thử lại; giữ nguyên bản lưu Drive hiện có.'),{status:502,network:true});}
  if(retryable&&[429,500,502,503,504].includes(response.status)&&attempt+1<attempts){await response.body?.cancel();await delay(300*(attempt+1));continue;}
  return response;
 }
}
