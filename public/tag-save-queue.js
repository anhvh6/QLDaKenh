export function createTagSaveQueue(){
 const jobs=new Map();
 const current=(job,id)=>job.host.state.conversations.find(c=>c.id===id);
 const overlay=(c,job)=>{if(!c||!job)return;const tags=new Set(c.tags||[]);for(const [name,intent] of job.pending)intent.selected?tags.add(name):tags.delete(name);c.tags=[...tags];};
 async function flush(id,job){job.running=true;try{while(job.pending.size){const sent=new Map(job.pending),changes=[...sent].map(([name,v])=>({name,selected:v.selected}));try{const saved=await job.host.api('/conversations/'+encodeURIComponent(id)+'/tags',{method:'POST',body:{changes}});job.confirmed=[...saved.tags];for(const [name,intent] of sent)if(job.pending.get(name)===intent)job.pending.delete(name);const c=current(job,id);if(c){if((saved.version||0)>=(c.version||0))Object.assign(c,saved);else c.tags=[...saved.tags];overlay(c,job);}job.paint();}catch(error){for(const [name,intent] of sent)if(job.pending.get(name)===intent)job.pending.delete(name);const c=current(job,id);if(c){c.tags=[...job.confirmed];overlay(c,job);}job.paint();job.host.toast(error.message,true);}}}finally{job.running=false;jobs.delete(id);}}
 return {
  apply(c){overlay(c,jobs.get(c.id));},
  toggle(host,c,name,paint){let job=jobs.get(c.id);if(!job){job={host,paint,pending:new Map(),confirmed:[...(c.tags||[])],running:false};jobs.set(c.id,job);}job.host=host;job.paint=paint;overlay(c,job);job.pending.set(name,{selected:!(c.tags||[]).includes(name)});overlay(c,job);paint();if(!job.running)job.done=flush(c.id,job);return job.done;}
 };
}
