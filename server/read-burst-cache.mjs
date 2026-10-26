// Bound, user-scoped memory cache for repeated remote reads. Never cache errors.
export class ReadBurstCache{
 constructor({ttl=15000,maxBytes=24*1024*1024,maxEntryBytes=6*1024*1024,maxEntries=64,now=Date.now}={}){Object.assign(this,{ttl,maxBytes,maxEntryBytes,maxEntries,now});this.entries=new Map();this.pending=new Map();this.bytes=0;this.generation=0;}
 clear(){this.generation++;this.entries.clear();this.pending.clear();this.bytes=0;}
 async read(key,load){
  const old=this.entries.get(key);if(old&&this.now()-old.at<this.ttl)return old.value;
  if(this.pending.has(key))return this.pending.get(key);
  const generation=this.generation;
  const job=Promise.resolve().then(load).then(value=>{
   if(generation!==this.generation||value.status!==200)return value;
   const bytes=value.body.byteLength;if(bytes>this.maxEntryBytes)return value;
   const prior=this.entries.get(key);if(prior){this.bytes-=prior.bytes;this.entries.delete(key);}
   while((this.bytes+bytes>this.maxBytes||this.entries.size>=this.maxEntries)&&this.entries.size){const [id,row]=this.entries.entries().next().value;this.bytes-=row.bytes;this.entries.delete(id);}
   this.entries.set(key,{at:this.now(),value,bytes});this.bytes+=bytes;return value;
  }).finally(()=>{if(this.pending.get(key)===job)this.pending.delete(key);});
  this.pending.set(key,job);return job;
 }
}
