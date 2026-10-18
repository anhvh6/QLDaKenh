export function pinnedRows(state,c){
 const messages=[...new Map([...(state.pinnedMessages||[]),...state.messages].map(m=>[m.id,m])).values()].filter(m=>m.conversationId===c.id&&!m.deletedAt),remote=(c.platformPins||[]).map(p=>{
  const m=messages.find(m=>p.externalId&&m.externalId===p.externalId||p.clientId&&m.externalClientId===p.clientId);
  return {...p,topicId:p.id,id:m?.id||p.id,text:m?.text||p.text,attachments:m?.attachments||[],remote:true,available:!!m};
 });
 const ids=new Set(remote.map(p=>p.id));return [...remote,...messages.filter(m=>m.pinned&&!ids.has(m.id)).map(m=>({...m,remote:false,available:true}))];
}
