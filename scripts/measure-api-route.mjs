// Paired, public health probes. No sessions, tokens or customer data.
const results=[];
for(let sample=0;sample<8;sample++){
 results.push(await Promise.all([['vercel','https://quanlydakenh.vercel.app'],['vps','http://36.50.55.233']].map(async([route,origin])=>{
  const start=performance.now();try{const r=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(12000)});await r.arrayBuffer();return {route,http:r.status,ms:Math.round(performance.now()-start),serverTiming:r.headers.get('server-timing')};}catch(error){return {route,error:error.cause?.code||error.name};}
 })));
}
console.log(JSON.stringify({pairedSamples:results},null,2));
