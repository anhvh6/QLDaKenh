export function publishedContentTargets(contentId,publications,connections,providers=null){
 const channels=new Map(connections.map(c=>[c.id,c])),latest=new Map();
 for(const p of publications.filter(p=>p.contentId===contentId).sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||b.scheduleAt)||0)-(Date.parse(a.updatedAt||a.createdAt||a.scheduleAt)||0))){if(!latest.has(p.connectionId))latest.set(p.connectionId,p);}
 return [...latest.values()].filter(p=>['published','manually_confirmed'].includes(p.status)&&(!providers||providers.includes(channels.get(p.connectionId)?.provider))).map(p=>{
  let url='';try{const u=new URL(p.url);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)url=u.href;}catch{}
  return {publication:p,channel:channels.get(p.connectionId),url};
 });
}
