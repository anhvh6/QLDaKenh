import { all, get, put, db, now, transaction } from './store.mjs';
import { remote } from './connectors.mjs';
import { secret } from './store.mjs';
import { runWorkflows } from './domain.mjs';
import { observeCareMessage } from './taophacdo.mjs';
import {metaChatIdentities,metaConversationAccount} from './meta-chat-identity.mjs';

const running = new Set();
const liveJobs=new Map();
const stamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : now();
const safeURL = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
async function metaConversations(channel,base,query,request,headers){
 const primary=metaConversationAccount(channel),read=account=>request(`${base}/${encodeURIComponent(account)}/conversations?${query}`,{headers,signal:AbortSignal.timeout(8000)});
 try{const result=await read(primary);if(result.data?.length||channel.provider!=='instagram'||primary===String(channel.accountId))return result;return await read(channel.accountId);}catch(error){if(channel.provider!=='instagram'||primary===String(channel.accountId)||![100,2500].includes(Number(error.providerCode??error.code)))throw error;return read(channel.accountId);}
}
// Some Graph conversation responses contain message IDs without sender/content.
// Resolve those IDs before ingestion; never invent an inbound peer or message text.
async function metaMessagePage(channel,base,url,request,headers){
 const options=()=>({headers,signal:AbortSignal.timeout(8000)});
 const page=await request(url,options());
 if(!Array.isArray(page.data))throw new Error('Meta không trả danh sách tin nhắn hợp lệ.');
 if(channel.provider!=='instagram')return page;
 const rows=[...page.data],own=metaChatIdentities(channel);let next=0;
 await Promise.all(Array.from({length:Math.min(3,rows.length)},async()=>{while(next<rows.length){const i=next++,item=rows[i];
  if(!item?.id)throw new Error('Meta trả tin nhắn không có ID.');
  const hasContent=Object.hasOwn(item,'message')||item.attachments||item.sticker||item.sticker_id;
  if(channel.provider==='instagram'&&(!item.from?.id||!hasContent||own.has(String(item.from.id))&&!item.to?.data?.length)){
   const detail=await request(base+'/'+encodeURIComponent(item.id)+'?fields=id,created_time,from,to,message,attachments',options());
   if(String(detail.id)!==String(item.id))throw new Error('Meta không trả chi tiết đúng ID tin nhắn.');
   rows[i]={...item,...detail};
  }
  if(!rows[i].from?.id)throw new Error('Meta trả tin nhắn thiếu người gửi; chưa thể xác định hội thoại.');
  if(!Number.isFinite(Date.parse(rows[i].created_time)))throw new Error('Meta trả tin nhắn thiếu thời gian gửi; chưa thể xác định hạn phản hồi.');
  if(channel.provider==='instagram'&&!Object.hasOwn(rows[i],'message')&&!rows[i].attachments&&!rows[i].sticker&&!rows[i].sticker_id)throw new Error('Meta chưa trả nội dung chi tiết của tin nhắn Instagram.');
 }}));
 return {...page,data:rows};
}
export function facebookAttachments(items = []) {
 const expanded=items.flatMap(a=>a.payload?.template_type==='generic'?(a.payload.elements||[]).filter(e=>e.image_url).map(e=>({type:'image',url:e.image_url})):a.generic_template?.elements?a.generic_template.elements.filter(e=>e.image_url).map(e=>({type:'image',url:e.image_url})):a);
 return expanded.map(a => {
  const type = a.type === 'sticker' ? 'image' : a.type || (a.mime_type?.startsWith('image/') || a.image_data ? 'image' : a.mime_type?.startsWith('video/') || a.video_data ? 'video' : a.mime_type?.startsWith('audio/') ? 'audio' : 'file');
  const url = safeURL(a.payload?.url || a.image_data?.url || a.video_data?.url || a.file_url || a.url);
  return { type, url, name: a.name || ({ image: 'Ảnh', video: 'Video', audio: 'Âm thanh' }[type] || 'Tệp') };
 }).filter(a => a.url);
}

export function ingestFacebookMessage(channel, item, { history = false, participant = {}, unread = false, routingState } = {}) {
 const own=metaChatIdentities(channel),outgoing = item.is_echo===true||own.has(String(item.from?.id));
 const peer = outgoing ? item.to?.data?.find(p => !own.has(String(p.id))) : item.from;
 const peerId = String(peer?.id || participant.id || '');
 if (!peerId || !item.id) return null;
 const createdAt = stamp(item.created_time), tombstone = get('chat_purge_tombstones', channel.id + ':0:' + peerId);
 if (tombstone && createdAt <= tombstone.cutoff) return null;
 const peerRow=db.prepare("SELECT id FROM records INDEXED BY idx_zalo_conversation WHERE kind='conversations' AND json_extract(data,'$.connectionId')=? AND json_extract(data,'$.externalUserId')=? AND json_extract(data,'$.kind')='message' LIMIT 1").get(channel.id,peerId);
 let conv=peerRow?get('conversations',peerRow.id):null;
 if(!conv){const receipt=db.prepare(`SELECT c.id FROM records m JOIN records c ON c.kind='conversations' AND c.id=json_extract(m.data,'$.conversationId') WHERE m.kind='messages' AND json_extract(c.data,'$.connectionId')=? AND json_extract(c.data,'$.privateReplySourceId') IS NOT NULL AND (json_extract(m.data,'$.externalId')=? OR json_extract(m.data,'$.externalId')=?) LIMIT 1`).get(channel.id,String(item.id),String(item.reply_to?.mid||''));if(receipt){conv=get('conversations',receipt.id);conv=put('conversations',{...conv,externalUserId:peerId});}}
 if (conv?.purgePending) return null;
 // A replay on the active stream can release a conversation previously seen on standby.
 if(conv&&routingState&&(!conv.metaRoutingAt||createdAt>conv.metaRoutingAt||createdAt===conv.metaRoutingAt&&routingState==='active'&&conv.metaRoutingState!=='active'))conv=put('conversations',{...conv,metaRoutingState:routingState,metaRoutingAt:createdAt});
 // Most imports are repeats: resolve the indexed receipt before inspecting album JSON.
 const duplicate = conv&&(db.prepare("SELECT id FROM records INDEXED BY idx_messages_conversation_external WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.externalId')=? LIMIT 1").get(conv.id,String(item.id))||db.prepare("SELECT id FROM records INDEXED BY idx_messages_conversation WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.externalMessages') IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(json_extract(records.data,'$.externalMessages')) e WHERE json_extract(e.value,'$.id')=?) LIMIT 1").get(conv.id,String(item.id)));
 const attachments = facebookAttachments(item.attachments?.data || item.attachments || []);
 const stickerURL = safeURL(typeof item.sticker === 'string' ? item.sticker : item.sticker?.url);
 const sticker = stickerURL ? {url:stickerURL,text:'Sticker Facebook'} : null;
 const text = item.message || (item.sticker_id === 369239263222822 ? '👍' : attachments.length || sticker ? '' : '[Tin nhắn Facebook]');
 if (duplicate) {
  const existing=get('messages',duplicate.id);
  // A history replay must repair the reply window even if the message was stored earlier.
  if(!outgoing&&!existing.deletedAt&&(!conv.lastInboundAt||createdAt>conv.lastInboundAt))conv=put('conversations',{...get('conversations',conv.id),lastInboundAt:createdAt});
  // The webhook can arrive before the richer history response. Enrich media without losing staff attribution or local deletion.
  if (!existing.deletedAt && (sticker && !existing.sticker || attachments.length && !existing.attachments?.length)) return put('messages',{...existing,attachments:attachments.length?attachments:existing.attachments,sticker:sticker||existing.sticker,text:/^\[(?:image|video|audio|file|sticker|Tin nhắn Facebook)/i.test(existing.text||'')?text:existing.text});
  return existing;
 }
 return transaction(() => {
  if (!conv) {
   const customer = put('customers', { name: peer?.name || participant.name || 'Khách Facebook ' + peerId.slice(-6), phone: '', tags: [], consent: false });
   conv = put('conversations', { customerId: customer.id, connectionId: channel.id, externalUserId: peerId, kind: 'message', status: 'open', tags: [], mode: 'api', unread: !!unread, lastAt: createdAt, createdAt, ...(routingState?{metaRoutingState:routingState,metaRoutingAt:createdAt}:{}) });
  } else if (peer?.name || participant.name) {
   const customer = get('customers', conv.customerId), name = peer?.name || participant.name;
   if (customer?.name?.startsWith('Khách Facebook ') && customer.name !== name) put('customers', { ...customer, name });
  }
  const msg = put('messages', { conversationId: conv.id, direction: outgoing ? 'outgoing' : 'incoming', text, attachments, sticker, externalId: String(item.id), status: outgoing ? 'sent' : 'received', senderType: outgoing ? 'channel' : 'customer', createdAt, history });
  const latest = !conv.lastAt || createdAt >= conv.lastAt;
  put('conversations', { ...conv, deletedAt: null, archived: conv.deletedAt ? false : conv.archived, ...(latest ? { lastAt: createdAt, lastMessage: text || (sticker?'Sticker':attachments[0]?.name||'Tin nhắn'), unread: !outgoing && (history ? !!unread : true) } : {}), ...(!outgoing && (!conv.lastInboundAt || createdAt > conv.lastInboundAt) ? { lastInboundAt: createdAt, waitingSince: latest ? conv.waitingSince || createdAt : conv.waitingSince } : {}), ...(outgoing && latest ? { waitingSince: null } : {}) });
  if (!history && !outgoing && routingState!=='standby') { runWorkflows('message_received', msg); observeCareMessage(get('conversations', conv.id), msg); }
  return msg;
 });
}

export function ingestFacebookEvents(channel, entries = [],object='') {
 if(object==='instagram'&&channel.provider!=='instagram'||object==='page'&&channel.provider==='instagram')return;
 const own=metaChatIdentities(channel);
 for (const entry of entries) for (const {event,routingState} of [...(entry.messaging||[]).map(event=>({event,routingState:'active'})),...(entry.standby||[]).map(event=>({event,routingState:'standby'}))]) {
  if(event.reaction?.mid){const conv=all('conversations').find(c=>c.connectionId===channel.id&&[String(event.sender?.id),String(event.recipient?.id)].includes(String(c.externalUserId)));const row=conv&&db.prepare("SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND (json_extract(data,'$.externalId')=? OR EXISTS(SELECT 1 FROM json_each(json_extract(records.data,'$.externalMessages')) e WHERE json_extract(e.value,'$.id')=?))").get(conv.id,event.reaction.mid,event.reaction.mid);if(row){const m=get('messages',row.id),senderId=String(event.sender?.id),reactions=(m.reactions||[]).filter(r=>r.senderId!==senderId);if(event.reaction.action!=='unreact')reactions.push({senderId,emoji:event.reaction.emoji||({love:'❤️',like:'👍',haha:'😆',wow:'😮',sad:'😢',angry:'😡'}[event.reaction.reaction]||'❤️')});put('messages',{...m,reactions});}continue;}
  if (!event.message?.mid) continue;
  const echo = event.message.is_echo || own.has(String(event.sender?.id));
  if (!own.has(String((echo ? event.sender : event.recipient)?.id))) continue;
  ingestFacebookMessage(channel, { id: event.message.mid,is_echo:!!echo, created_time: new Date(event.timestamp || Date.now()).toISOString(), message: event.message.text || '', from: event.sender, to: { data: [event.recipient] }, attachments: event.message.attachments || [],sticker_id:event.message.sticker_id,reply_to:event.message.reply_to },{routingState});
 }
}

// Active chats refresh independently of the slower historical import queue.
export async function syncFacebookConversation(channel,conversation,request=remote){
 if(!['facebook','instagram'].includes(channel?.provider)||channel.deletedAt||channel.status!=='connected'||channel.mode!=='api'||!conversation.externalUserId)return;
 const key=channel.id+':'+conversation.id,prior=liveJobs.get(key);
 if(prior&&(prior.running||Date.now()-prior.at<3000))return;
 liveJobs.set(key,{running:true,at:Date.now()});
 const base=`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}`,headers={Authorization:'Bearer '+secret(channel.id).token};
 try{
  let threadId=conversation.facebookThreadId;
  if(!threadId){const threads=await metaConversations(channel,base,`platform=${channel.provider==='instagram'?'instagram':'messenger'}&user_id=${encodeURIComponent(conversation.externalUserId)}&fields=id&limit=1`,request,headers);threadId=threads.data?.[0]?.id;if(threadId){const current=get('conversations',conversation.id);if(!current?.deletedAt)put('conversations',{...current,facebookThreadId:threadId});}}
  if(!threadId)return;
  const page=await metaMessagePage(channel,base,`${base}/${encodeURIComponent(threadId)}/messages?limit=${channel.provider==='instagram'?20:25}&fields=id,created_time,message,from,to,attachments,sticker`,request,headers);
  for(const item of [...(page.data||[])].reverse())ingestFacebookMessage(channel,item,{history:Date.parse(item.created_time)<Date.now()-120000,participant:{id:conversation.externalUserId}});
 }finally{liveJobs.set(key,{running:false,at:Date.now()});if(liveJobs.size>300)for(const [id,job] of liveJobs)if(!job.running&&Date.now()-job.at>60000)liveJobs.delete(id);}
}

// Bounded pages and cursors keep initial imports out of the UI request path.
export async function syncFacebookChat(channel, request = remote) {
 if (running.has(channel.id)) return { running: true };
 if (!['facebook','instagram'].includes(channel.provider) || channel.deletedAt || channel.status !== 'connected' || channel.mode !== 'api') return { supported: false };
 running.add(channel.id);
 const previous=get('facebook_chat_sync',channel.id)||{},compatible=previous.syncProtocolVersion===2&&previous.chatAccountId===metaConversationAccount(channel),state=compatible?previous:{...previous,after:''},base = `https://graph.facebook.com/${channel.apiVersion || process.env.META_GRAPH_VERSION || 'v25.0'}`;
 const headers = { Authorization: 'Bearer ' + secret(channel.id).token },readOptions={headers,signal:AbortSignal.timeout(8000)};
 let imported = 0; const startedAt = state.startedAt || now();
 try {
  const conversations = await metaConversations(channel,base,`platform=${channel.provider==='instagram'?'instagram':'messenger'}&limit=10&fields=id,updated_time,participants&${state.after ? 'after=' + encodeURIComponent(state.after) : ''}`,request,headers);
  const latest = state.after ? await metaConversations(channel,base,`platform=${channel.provider==='instagram'?'instagram':'messenger'}&limit=10&fields=id,updated_time,participants`,request,headers) : conversations;
  const threads = [...new Map([...(latest.data || []), ...(conversations.data || [])].map(t => [t.id,t])).values()];
  let nextThread=0;const syncThread=async thread=>{
   const participant = thread.participants?.data?.find(p => !metaChatIdentities(channel).has(String(p.id)));
   // Message sender/recipient fields can identify the peer even without participants.
   const checkpointId = channel.id + ':' + thread.id, checkpoint = get('facebook_chat_cursors', checkpointId) || {};
   if(channel.provider!=='instagram'&&compatible&&checkpoint.complete&&thread.updated_time&&checkpoint.remoteUpdatedAt===thread.updated_time)return;
   // Always read the newest page; then advance an older-history cursor on later cycles.
   const readPage = async after => {
    const messages = await metaMessagePage(channel,base,`${base}/${encodeURIComponent(thread.id)}/messages?limit=${channel.provider==='instagram'?20:100}&fields=id,created_time,message,from,to,attachments,sticker&${after ? 'after=' + encodeURIComponent(after) : ''}`,request,headers);
    for (const item of [...(messages.data || [])].reverse()){const msg=ingestFacebookMessage(channel,item,{history:Date.parse(item.created_time)<Date.parse(startedAt),participant:participant||{}});if(msg){imported++;const conv=get('conversations',msg.conversationId);if(conv.facebookThreadId!==thread.id)put('conversations',{...conv,facebookThreadId:thread.id});}}
    return messages.paging?.next ? messages.paging?.cursors?.after || '' : '';
   };
   const newestNext = await readPage('');
   const olderNext = checkpoint.after ? await readPage(checkpoint.after) : checkpoint.complete ? '' : newestNext;
   put('facebook_chat_cursors', { id: checkpointId, after: olderNext, complete: !olderNext, remoteUpdatedAt:thread.updated_time||'', syncedAt: now() });
  }
  const errors=[];await Promise.all(Array.from({length:Math.min(3,threads.length)},async()=>{while(nextThread<threads.length){try{await syncThread(threads[nextThread++]);}catch(error){errors.push(error);}}}));if(errors.length)throw errors[0];
  put('facebook_chat_sync', { id: channel.id,syncProtocolVersion:2,chatAccountId:metaConversationAccount(channel), startedAt, after: conversations.paging?.next ? conversations.paging?.cursors?.after || '' : '', status: channel.provider==='instagram'&&(!threads.length||!imported)?'attention':'ready', warning:channel.provider==='instagram'&&(!threads.length||!imported)?'Meta chưa trả nội dung tin nhắn. Hãy kiểm tra quyền nhắn tin và quyền truy cập tin nhắn của ứng dụng trên Instagram.':'', threadCount:threads.length, syncedAt: now(), imported, error: '' });
  return { imported, more: !!conversations.paging?.next };
 } catch (error) {
  put('facebook_chat_sync', { ...state, startedAt, id: channel.id, status: 'error', syncedAt: now(), error: error.message });
  throw error;
 } finally { running.delete(channel.id); }
}

export async function facebookChatTick(request = remote) {
 await Promise.allSettled(all('connections').filter(c => ['facebook','instagram'].includes(c.provider) && !c.deletedAt && c.status === 'connected' && c.mode === 'api').map(async channel=>{
  const state = get('facebook_chat_sync', channel.id);
  if (state?.syncedAt && Date.now() - Date.parse(state.syncedAt) < (state.status==='error'?30000:channel.provider==='instagram'||state.after?5000:10000)) return;
  try { await syncFacebookChat(channel, request); } catch { /* Error is stored for the channel's diagnostic UI. */ }
 }));
}
