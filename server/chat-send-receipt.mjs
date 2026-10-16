import {db,get,put,remove,transaction} from './store.mjs';
import {flushZaloReactions} from './zalo-reactions.mjs';

// One SDK call can return a text ID and several IDs belonging to an image album.
// Keep every exact ID so late self echoes cannot create duplicate chat bubbles.
export function saveSendReceipt(message,result,attachments){
 return transaction(()=>{
 const current=get('messages',message.id)||message;
 const externalMessages=result.externalMessages?.length?result.externalMessages:result.id||result.message_id?[{id:String(result.id||result.message_id),clientId:String(result.clientId||'')}]:current.externalMessages||[];
 for(const item of externalMessages){if(!item.clientId)item.clientId=current.externalMessages?.find(m=>m.id===item.id)?.clientId||(current.externalId===item.id?current.externalClientId:'')||'';}
 const ids=externalMessages.map(m=>m.id).filter(Boolean);
 let pinned=current.pinned;const reactions=[...(current.reactions||[])];
 if(ids.length){const rows=db.prepare(`SELECT id FROM records WHERE kind='messages' AND id<>? AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction')='outgoing' AND json_extract(data,'$.externalId') IN (${ids.map(()=>'?').join(',')})`).all(message.id,message.conversationId,...ids);for(const row of rows){const echo=get('messages',row.id);pinned ||= echo?.pinned;for(const reaction of echo?.reactions||[])if(!reactions.some(r=>r.senderId===reaction.senderId&&r.emoji===reaction.emoji))reactions.push(reaction);remove('messages',row.id);}}
 const saved=put('messages',{...current,text:message.text,attachments,pinned,reactions,externalMessages,externalId:ids[0]||current.externalId||null,externalClientId:externalMessages[0]?.clientId||current.externalClientId||null,status:result.demo?'demo':message.direction==='note'?'internal':'accepted'});
 const c=get('conversations',saved.conversationId);if(c&&get('connections',c.connectionId)?.provider==='zalo_personal')flushZaloReactions(c.connectionId,c,saved);
 return get('messages',saved.id);
 });
}
