import {gzip,brotliCompress,constants} from 'node:zlib';
const accepted=(header,coding)=>String(header||'').split(',').some(v=>new RegExp('^'+coding+'(?:\s*;|\s*$)','i').test(v.trim())&&!/;\s*q\s*=\s*0(?:\.0*)?(?:\s*;|\s*$)/i.test(v));
export function sendJSON(res,data,status=200){
 const body=Buffer.from(JSON.stringify(data)),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Accept-Encoding'};
 const header=res.req?.headers['accept-encoding'],useBrotli=accepted(header,'br'),useGzip=accepted(header,'gzip');
 const send=(bytes,encoding='')=>{if(res.destroyed)return;res.writeHead(status,{...headers,...(Number.isFinite(res.req?.appStartedAt)?{'Server-Timing':`app;dur=${Math.max(0,performance.now()-res.req.appStartedAt).toFixed(1)}`}:{ }),...(encoding?{'Content-Encoding':encoding}:{}),'Content-Length':bytes.length});res.end(bytes);};
 if(body.length<4096||!useBrotli&&!useGzip)return send(body);
 // Brotli at quality 4 costs about the same CPU as gzip level 4 but is ~35% smaller on state snapshots, which matters on phones.
 if(useBrotli)return brotliCompress(body,{params:{[constants.BROTLI_PARAM_QUALITY]:4,[constants.BROTLI_PARAM_SIZE_HINT]:body.length}},(error,bytes)=>error?send(body):send(bytes,'br'));
 gzip(body,{level:4},(error,bytes)=>error?send(body):send(bytes,'gzip'));
}
