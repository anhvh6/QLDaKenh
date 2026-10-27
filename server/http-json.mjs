import {gzip} from 'node:zlib';
export function sendJSON(res,data,status=200){
 const body=Buffer.from(JSON.stringify(data)),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Accept-Encoding'};
 const accepts=String(res.req?.headers['accept-encoding']||'').split(',').some(v=>/^gzip(?:\s*;|\s*$)/i.test(v.trim())&&!/;\s*q\s*=\s*0(?:\.0*)?(?:\s*;|\s*$)/i.test(v));
 const send=(bytes,compressed=false)=>{if(res.destroyed)return;res.writeHead(status,{...headers,...(Number.isFinite(res.req?.appStartedAt)?{'Server-Timing':`app;dur=${Math.max(0,performance.now()-res.req.appStartedAt).toFixed(1)}`}:{ }),...(compressed?{'Content-Encoding':'gzip'}:{}),'Content-Length':bytes.length});res.end(bytes);};
 if(accepts&&body.length>=4096)gzip(body,{level:4},(error,bytes)=>send(error?body:bytes,!error));else send(body);
}
