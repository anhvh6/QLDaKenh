const parse=v=>{if(typeof v!=='string')return v;try{return JSON.parse(v);}catch{return null;}};
export function normalizeZaloPins(response){
 const rows=Array.isArray(response)?response:response?.items||response?.data||[];
 if(!Array.isArray(rows))throw Error('Danh sách ghim Zalo không hợp lệ.');
 return rows.map(parse).filter(Boolean).filter(r=>r.boardType===undefined||r.boardType===2).map(r=>parse(r.data)||r.topic||r).map(topic=>{
  const p=parse(topic.params)||{};return {id:String(topic.id||topic.topicId||p.global_msg_id||''),externalId:String(p.global_msg_id||p.msgId||''),clientId:String(p.client_msg_id||p.cliMsgId||''),text:String(p.title||''),senderName:String(p.senderName||''),createdAt:topic.createTime};
 }).filter(r=>r.id&&(r.externalId||r.clientId));
}
