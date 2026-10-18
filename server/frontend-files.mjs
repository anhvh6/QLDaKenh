import {readFile} from 'node:fs/promises';import {gzip} from 'node:zlib';import {promisify} from 'node:util';import {extname} from 'node:path';
const compress=promisify(gzip),cache=new Map();
export function serveFrontendFile(req,res,file,st,privateFile){
 if(privateFile||req.headers.range||!['.js','.css','.html','.svg','.webmanifest'].includes(extname(file))||st.size>4*1024*1024)return false;
 const etag=`W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
 res.setHeader('ETag',etag);res.setHeader('Vary','Accept-Encoding');
 if(String(req.headers['if-none-match']||'').split(',').some(s=>s.trim()===etag||s.trim()==='*')){res.writeHead(304);res.end();return true;}
 const accepts=String(req.headers['accept-encoding']||'').split(',').some(v=>/^gzip(?:\s*;|\s*$)/i.test(v.trim())&&!/;\s*q\s*=\s*0(?:\.0*)?(?:\s*;|\s*$)/i.test(v));
 if(!accepts||st.size<1024)return false;
 const key=file+':'+etag;let pending=cache.get(key);if(!pending){pending=readFile(file).then(bytes=>compress(bytes,{level:6}));cache.set(key,pending);while(cache.size>16)cache.delete(cache.keys().next().value);pending.catch(()=>cache.delete(key));}
 void pending.then(bytes=>{if(res.destroyed)return;res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',bytes.length);if(req.method==='HEAD')res.end();else res.end(bytes);}).catch(()=>{if(!res.destroyed){res.statusCode=500;res.end();}});
 return true;
}
