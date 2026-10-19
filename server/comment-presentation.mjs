import {db} from './store.mjs';
// Indexed latest delivered interaction; notes and failed sends never answer a customer.
export function commentPresentation(conversations){
 const latest=db.prepare(`SELECT json_extract(data,'$.direction') direction FROM records INDEXED BY idx_messages_live_order WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction') IN ('incoming','outgoing') AND json_extract(data,'$.deletedAt') IS NULL AND COALESCE(json_extract(data,'$.status'),'') NOT IN ('failed','unknown','sending') ORDER BY json_extract(data,'$.createdAt') DESC,id DESC LIMIT 1`);
 const peers=new Map();for(const c of conversations)if(c.kind!=='comment'&&!c.deletedAt&&!c.remoteDeleted&&c.threadType!==1){if(c.externalUserId)peers.set(c.connectionId+':external:'+c.externalUserId,c.id);if(c.customerId)peers.set(c.connectionId+':customer:'+c.customerId,c.id);}
 return conversations.map(c=>c.kind!=='comment'?c:{...c,lastCommentDirection:latest.get(c.id)?.direction||null,privateConversationId:peers.get(c.connectionId+':external:'+c.externalUserId)||peers.get(c.connectionId+':customer:'+c.customerId)||null});
}
