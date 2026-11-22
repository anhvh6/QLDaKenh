// Delay before the next run of a periodic worker. A fixed interval lets a worker whose run takes longer than the interval hold the CPU
// forever; spacing runs by a multiple of their own duration caps its share at ~1/(factor+1) while light runs keep the base cadence.
export function adaptiveDelay(durationMs,{floor=5000,factor=3,cap=60000}={}){
 const spent=Number.isFinite(durationMs)&&durationMs>0?durationMs:0;
 return Math.min(cap,Math.max(floor,Math.round(spent*factor)));
}
