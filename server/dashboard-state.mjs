import {db} from './store.mjs';
// Only the last message of conversations active in the last week is needed for dashboard counts.
// Match the live chat ordering and avoid returning bodies, attachments or quote payloads.
export function dashboardMessages(time=Date.now()){
 return db.prepare(`SELECT m.id,m.version,json_extract(m.data,'$.conversationId') conversationId,json_extract(m.data,'$.direction') direction,json_extract(m.data,'$.createdAt') createdAt,json_extract(m.data,'$.status') status,json_extract(m.data,'$.deletedAt') deletedAt
 FROM records c CROSS JOIN records m ON m.kind='messages' AND m.id=(SELECT id FROM records INDEXED BY idx_messages_live_order WHERE kind='messages' AND json_extract(data,'$.conversationId')=+c.id ORDER BY json_extract(data,'$.createdAt') DESC,id DESC LIMIT 1)
 WHERE c.kind='conversations' AND json_extract(c.data,'$.lastAt')>=?`).all(new Date(time-7*86400000).toISOString()).map(r=>({...r}));
}
