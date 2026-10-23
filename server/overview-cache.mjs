// Persisted materialized results live outside the CRM revision triggers.
export function createAggregateStore(db,{now=Date.now}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS dashboard_aggregates(
  aggregate_key TEXT PRIMARY KEY,payload TEXT NOT NULL,computed_at INTEGER NOT NULL,
  source_revision TEXT NOT NULL,last_error TEXT,last_attempt_at INTEGER NOT NULL
 );`);
 const running=new Map();
 const read=key=>{const r=db.prepare('SELECT * FROM dashboard_aggregates WHERE aggregate_key=?').get(key);return r?{...JSON.parse(r.payload),updatedAt:r.computed_at,sourceRevision:r.source_revision,stale:now()-r.computed_at>120000,refreshFailed:!!r.last_error}:null;};
 async function refresh(key,compute,{revision='',minInterval=60000}={}){
  if(running.has(key))return running.get(key);
  const prior=db.prepare('SELECT computed_at,source_revision FROM dashboard_aggregates WHERE aggregate_key=?').get(key);
  if(prior&&now()-prior.computed_at<minInterval&&prior.source_revision===String(revision))return read(key);
  const job=Promise.resolve().then(compute).then(payload=>{
   if(!payload||typeof payload!=='object')throw Error('Invalid aggregate result');
   const at=now();db.prepare(`INSERT INTO dashboard_aggregates VALUES(?,?,?,?,NULL,?) ON CONFLICT(aggregate_key) DO UPDATE SET payload=excluded.payload,computed_at=excluded.computed_at,source_revision=excluded.source_revision,last_error=NULL,last_attempt_at=excluded.last_attempt_at`).run(key,JSON.stringify(payload),at,String(revision),at);return read(key);
  }).catch(error=>{db.prepare('UPDATE dashboard_aggregates SET last_error=?,last_attempt_at=? WHERE aggregate_key=?').run(String(error.message||error).slice(0,300),now(),key);throw error;}).finally(()=>running.delete(key));
  running.set(key,job);return job;
 }
 return {read,refresh};
}
