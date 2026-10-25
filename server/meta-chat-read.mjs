import {createHash} from 'node:crypto';
import {remote} from './connectors.mjs';

const jobs=new WeakMap();
const labels={conversations:'danh sách hội thoại',messages:'danh sách tin nhắn',detail:'nội dung tin nhắn'};
// Read-only requests only. Shared requests cannot cause duplicate sends.
export function metaChatRead(url,{headers,stage='messages',request=remote}={}){
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'||endpoint.hostname!=='graph.facebook.com')throw new Error('Địa chỉ đọc chat Meta không hợp lệ.');
 endpoint.searchParams.sort();
 const key=createHash('sha256').update(endpoint.href+'\n'+String(headers?.Authorization||'')).digest('hex');
 let pending=jobs.get(request);if(!pending){pending=new Map();jobs.set(request,pending);}
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  const started=Date.now();
  for(let attempt=1;attempt<=2;attempt++){
   const remaining=30000-(Date.now()-started);
   try{return await request(url,{headers,signal:AbortSignal.timeout(Math.max(1,Math.min(20000,remaining)))});}
   catch(error){
    // Never include URLs, request headers or raw transport error text in diagnostics.
    const rawCode=String(error.networkCode||''),code=({'23':'TIMEOUT','20':'ABORTED',TimeoutError:'TIMEOUT',AbortError:'ABORTED'})[rawCode]||rawCode;
    if(code)error.networkCode=/^[a-z0-9_]+$/i.test(code)?code:'NETWORK_ERROR';
    Object.assign(error,{metaReadStage:stage,metaReadAttempts:attempt,metaReadDurationMs:Date.now()-started});
    if(code&&attempt===1&&Date.now()-started<29000){await new Promise(resolve=>setTimeout(resolve,250));continue;}
    if(code){const safe=/^[a-z0-9_]+$/i.test(code)?code:'NETWORK_ERROR';error.message='Không kết nối được Meta khi đọc '+(labels[stage]||labels.messages)+' · mã mạng '+safe+' · '+attempt+' lượt thử. Kiểm tra đường mạng từ máy chủ tới Meta.';}
    throw error;
   }
  }
 })();
 pending.set(key,job);job.then(()=>pending.delete(key),()=>pending.delete(key));return job;
}
