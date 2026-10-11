const sorted=rows=>[...(rows||[])].sort((a,b)=>(a.sortOrder??1)-(b.sortOrder??1));
export function topicGroups(S,conversationId){
 const topics=sorted(S.quick_reply_topics),templates=sorted(S.templates),byId=new Map(templates.map(t=>[t.id,t])),used=new Set();
 const topicId=t=>topics.some(p=>p.id===t?.topicId)?t.topicId:'';
 for(const run of S.template_runs||[]){
  if(run.conversationId!==conversationId||!(run.status==='done'||run.nextIndex>0||run.messageIds?.length))continue;
  const id=Object.hasOwn(run,'topicId')?run.topicId:byId.get(run.templateId)?.topicId;
  used.add(topics.some(p=>p.id===id)?id:'');
 }
 const numbered=templates.map((t,index)=>({...t,number:Number.isInteger(t.quickReplyIndex)?t.quickReplyIndex:(t.sortOrder??index+1)-1})).filter(t=>t.enabled!==false);
 return [...topics,{id:'',name:'Khác',color:'#64786c',sortOrder:Math.max(0,...topics.map(t=>Number(t.sortOrder)||0))+1}].map(topic=>({...topic,used:used.has(topic.id),rows:numbered.filter(t=>topicId(t)===topic.id)})).filter(t=>t.rows.length).sort((a,b)=>Number(a.used)-Number(b.used));
}
