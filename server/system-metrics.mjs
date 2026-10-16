import os from 'node:os';import {statfs} from 'node:fs/promises';import {monitorEventLoopDelay} from 'node:perf_hooks';
export const metricLimits={cpu:[70,90],memory:[75,90],disk:[80,90],lag:[100,500],latency:[500,1500],errors:[1,5]};
export const metricLevel=(value,limits)=>value===null||!Number.isFinite(value)?'unknown':value>=limits[1]?'danger':value>=limits[0]?'warning':'healthy';
const cpuTimes=()=>os.cpus().reduce((s,c)=>({idle:s.idle+c.times.idle,total:s.total+Object.values(c.times).reduce((a,b)=>a+b,0)}),{idle:0,total:0});
export function cpuPercent(before,after){const total=after.total-before.total;return total>0?Math.max(0,Math.min(100,100*(1-(after.idle-before.idle)/total))):null;}
export function createSystemMonitor({directory=process.env.DATA_DIR||'data',interval=10000,capacity=360}={}){
 const history=[],requests=[],buckets=new Map();let previous=cpuTimes(),disk=null,diskAt=0,busy=false,active=0;const loop=monitorEventLoopDelay({resolution:20});loop.enable();
 function request(req,res){if(req.url?.startsWith('/api/system/metrics'))return;active++;const start=performance.now();let done=false;const finish=()=>{if(done)return;done=true;active=Math.max(0,active-1);const at=Date.now(),second=Math.floor(at/1000),bucket=buckets.get(second)||{count:0,errors:0};bucket.count++;if(res.statusCode>=500)bucket.errors++;buckets.set(second,bucket);for(const key of buckets.keys())if(key<second-59)buckets.delete(key);requests.push({at,ms:performance.now()-start});while(requests.length>10000)requests.shift();};res.once('finish',finish);res.once('close',finish);}
 async function sample(){if(busy)return;busy=true;try{const at=Date.now(),next=cpuTimes(),cpu=cpuPercent(previous,next);previous=next;
  if(at-diskAt>=60000){try{const d=await statfs(directory);disk=d.blocks?100*(1-d.bavail/d.blocks):null;}catch{disk=null;}diskAt=at;}
  while(requests.length&&requests[0].at<at-60000)requests.shift();const sorted=requests.map(r=>r.ms).sort((a,b)=>a-b),latency=sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]:null;
  const totals={count:0,errors:0};for(const [key,b] of buckets){if(key<Math.floor(at/1000)-59)buckets.delete(key);else{totals.count+=b.count;totals.errors+=b.errors;}}
  const row={at,cpu,memory:100*(1-os.freemem()/os.totalmem()),disk,lag:Number.isFinite(loop.mean)?loop.mean/1e6:null,latency,errors:totals.count?100*totals.errors/totals.count:null,rps:totals.count/60,active,processMB:process.memoryUsage().rss/1048576};loop.reset();history.push(row);if(history.length>capacity)history.shift();
 }finally{busy=false;}}
 const timer=setInterval(()=>void sample().catch(()=>{}),interval);timer.unref();void sample().catch(()=>{});
 return {request,snapshot(){const current=history.at(-1)||null;return {current,history,limits:metricLimits,interval,uptime:process.uptime(),windowMinutes:60,sampleCount:history.length};},close(){clearInterval(timer);loop.disable();},sample};
}
