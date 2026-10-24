import {db,get} from './store.mjs';
export function chatWindow(conversationId,params,pins=[]){
 const limit=Math.min(200,Math.max(1,Math.floor(Number(params.get('limit')))||60));let before=null;
 if(params.get('before')){try{before=JSON.parse(Buffer.from(params.get('before'),'base64url'));if(typeof before.at!=='string'||typeof before.id!=='string')throw Error();}catch{throw Object.assign(Error('Mốc lịch sử không hợp lệ.'),{status:400});}}
 const where=before?" AND (json_extract(data,'$.createdAt')<? OR (json_extract(data,'$.createdAt')=? AND id<?))":'',args=before?[conversationId,before.at,before.at,before.id,limit+1]:[conversationId,limit+1];
 const rows=db.prepare("SELECT id,data,version FROM records INDEXED BY idx_messages_live_order WHERE kind='messages' AND json_extract(data,'$.conversationId')=?"+where+" ORDER BY json_extract(data,'$.createdAt') DESC,id DESC LIMIT ?").all(...args),hasMore=rows.length>limit;
 const messages=rows.slice(0,limit).map(r=>({...JSON.parse(r.data),id:r.id,version:r.version})).reverse(),first=messages[0],ids=new Set(messages.map(m=>m.id));
 const references=[...new Set(messages.map(m=>m.quoteId).filter(id=>id&&!ids.has(id)))].map(id=>get('messages',id)).filter(m=>m?.conversationId===conversationId).map(({id,text,version,deletedAt})=>({id,text,version,deletedAt}));
 const external=pins.map(p=>p.externalId).filter(Boolean).slice(0,100);
 const pinnedRows=db.prepare("SELECT id,data,version FROM records INDEXED BY idx_messages_pinned WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.pinned')=1").all(conversationId);
 if(external.length)pinnedRows.push(...db.prepare("SELECT id,data,version FROM records INDEXED BY idx_messages_conversation_external WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.externalId') IN ("+external.map(()=>'?').join(',')+")").all(conversationId,...external));
 const pinned=[...new Map(pinnedRows.map(r=>[r.id,{...JSON.parse(r.data),id:r.id,version:r.version}])).values()];
 return {messages,references,pinned,hasMore,before:hasMore&&first?Buffer.from(JSON.stringify({at:first.createdAt,id:first.id})).toString('base64url'):null};
}
