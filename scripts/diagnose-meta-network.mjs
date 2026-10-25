// No account credentials, messages or tokens are used by these transport probes.
import {request} from 'node:https';
import {lookup} from 'node:dns/promises';
const host='graph.facebook.com',url='https://'+host+'/';
const elapsed=start=>Math.round(performance.now()-start);
try{const addresses=await lookup(host,{all:true});console.log(JSON.stringify({probe:'dns',ipv4:addresses.filter(a=>a.family===4).length,ipv6:addresses.filter(a=>a.family===6).length}));}catch(error){console.log(JSON.stringify({probe:'dns',code:error.code}));}
await Promise.all([
 (async()=>{const started=performance.now();try{const res=await fetch(url,{signal:AbortSignal.timeout(15000)});await res.body?.cancel();console.log(JSON.stringify({probe:'node-fetch',http:res.status,ms:elapsed(started)}));}catch(error){console.log(JSON.stringify({probe:'node-fetch',code:error.cause?.code||error.code||error.name,ms:elapsed(started)}));}})(),
 ...[4,6].map(family=>new Promise(resolve=>{const started=performance.now();const req=request(url,{family,method:'HEAD',signal:AbortSignal.timeout(15000)},res=>{res.resume();console.log(JSON.stringify({probe:'https-ipv'+family,http:res.statusCode,ms:elapsed(started)}));resolve();});req.on('error',error=>{console.log(JSON.stringify({probe:'https-ipv'+family,code:error.code||error.name,ms:elapsed(started)}));resolve();});req.end();}))
]);
