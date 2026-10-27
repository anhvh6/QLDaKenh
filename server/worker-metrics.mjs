export function createWorkerMetrics(clock=()=>performance.now()) {
  const rows=new Map();
  function run(name,work){
    const start=clock();let result,syncMs;
    const record=failed=>{const elapsed=clock()-start,old=rows.get(name)||{name,runs:0,failures:0,maxMs:0,maxStartBlockMs:0};rows.set(name,{...old,runs:old.runs+1,failures:old.failures+Number(failed),lastMs:elapsed,maxMs:Math.max(old.maxMs,elapsed),maxStartBlockMs:Math.max(old.maxStartBlockMs,syncMs),at:Date.now()});};
    try{result=work();syncMs=clock()-start;}catch(error){syncMs=clock()-start;record(true);throw error;}
    if(result&&typeof result.then==='function')return result.then(value=>{record(false);return value;},error=>{record(true);throw error;});
    record(false);return result;
  }
  return {run,snapshot:()=>[...rows.values()].sort((a,b)=>b.maxStartBlockMs-a.maxStartBlockMs)};
}
