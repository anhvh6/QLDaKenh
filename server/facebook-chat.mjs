import { all, get, put, db, now, transaction } from './store.mjs';
import { remote } from './connectors.mjs';
import { secret } from './store.mjs';
import { runWorkflows } from './domain.mjs';
import { captureLead } from './taophacdo.mjs';

const running = new Set();
const stamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : now();
const safeURL = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
export function facebookAttachments(items = []) {
 return items.map(a => {
  const type = a.type || (a.mime_type?.startsWith('image/') || a.image_data ? 'image' : a.mime_type?.startsWith('video/') || a.video_data ? 'video' : a.mime_type?.startsWith('audio/') ? 'audio' : 'file');
  const url = safeURL(a.payload?.url || a.image_data?.url || a.video_data?.url || a.file_url || a.url);
  return { type, url, name: a.name || ({ image: 'Ảnh', video: 'Video', audio: 'Âm thanh' }[type] || 'Tệp') };
 }).filter(a => a.url);
}

export function ingestFacebookMessage(channel, item, { history = false, participant = {}, unread = false } = {}) {
 const outgoing = String(item.from?.id) === String(channel.accountId);
 const peer = outgoing ? item.to?.data?.find(p => String(p.id) !== String(channel.accountId)) : item.from;
 const peerId = String(peer?.id || participant.id || '');
 if (!peerId || !item.id) return null;
 const createdAt = stamp(item.created_time), tombstone = get('chat_purge_tombstones', channel.id + ':0:' + peerId);
 if (tombstone && createdAt <= tombstone.cutoff) return null;
 let conv = all('conversations').find(c => c.connectionId === channel.id && c.kind === 'message' && String(c.externalUserId) === peerId);
 if (conv?.purgePending) return null;
 const duplicate = db.prepare("SELECT id FROM records WHERE kind='messages' AND (json_extract(data,'$.externalId')=? OR EXISTS(SELECT 1 FROM json_each(json_extract(records.data,'$.externalMessages')) e WHERE json_extract(e.value,'$.id')=?)) AND json_extract(data,'$.conversationId')=?").get(String(item.id), String(item.id), conv?.id || '');
 if (duplicate) return get('messages', duplicate.id);
 const attachments = facebookAttachments(item.attachments?.data || item.attachments || []), text = item.message || (attachments.length ? '[' + attachments[0].name + ']' : '[Tin nhắn Facebook]');
 return transaction(() => {
  if (!conv) {
   const customer = put('customers', { name: peer?.name || participant.name || 'Khách Facebook ' + peerId.slice(-6), phone: '', tags: [], consent: false });
   conv = put('conversations', { customerId: customer.id, connectionId: channel.id, externalUserId: peerId, kind: 'message', status: 'open', tags: [], mode: 'api', unread: !!unread, lastAt: createdAt, createdAt });
  } else if (peer?.name || participant.name) {
   const customer = get('customers', conv.customerId), name = peer?.name || participant.name;
   if (customer?.name?.startsWith('Khách Facebook ') && customer.name !== name) put('customers', { ...customer, name });
  }
  const msg = put('messages', { conversationId: conv.id, direction: outgoing ? 'outgoing' : 'incoming', text, attachments, externalId: String(item.id), status: outgoing ? 'sent' : 'received', senderType: outgoing ? 'channel' : 'customer', createdAt, history });
  const latest = !conv.lastAt || createdAt >= conv.lastAt;
  put('conversations', { ...conv, deletedAt: null, archived: conv.deletedAt ? false : conv.archived, ...(latest ? { lastAt: createdAt, lastMessage: text, unread: !outgoing && (history ? !!unread : true) } : {}), ...(!outgoing && (!conv.lastInboundAt || createdAt > conv.lastInboundAt) ? { lastInboundAt: createdAt, waitingSince: latest ? conv.waitingSince || createdAt : conv.waitingSince } : {}), ...(outgoing && latest ? { waitingSince: null } : {}) });
  if (!history && !outgoing) { runWorkflows('message_received', msg); captureLead(get('conversations', conv.id), msg); }
  return msg;
 });
}

export function ingestFacebookEvents(channel, entries = []) {
 for (const entry of entries) for (const event of entry.messaging || []) {
  if (!event.message?.mid) continue;
  const echo = event.message.is_echo || String(event.sender?.id) === String(channel.accountId);
  if (String((echo ? event.sender : event.recipient)?.id) !== String(channel.accountId)) continue;
  ingestFacebookMessage(channel, { id: event.message.mid, created_time: new Date(event.timestamp || Date.now()).toISOString(), message: event.message.text || '', from: event.sender, to: { data: [event.recipient] }, attachments: event.message.attachments || [] });
 }
}

// Bounded pages and cursors keep initial imports out of the UI request path.
export async function syncFacebookChat(channel, request = remote) {
 if (running.has(channel.id)) return { running: true };
 if (channel.provider !== 'facebook' || channel.status !== 'connected' || channel.mode !== 'api') return { supported: false };
 running.add(channel.id);
 const state = get('facebook_chat_sync', channel.id) || {}, base = `https://graph.facebook.com/${channel.apiVersion || process.env.META_GRAPH_VERSION || 'v25.0'}`;
 const headers = { Authorization: 'Bearer ' + secret(channel.id).token };
 let imported = 0; const startedAt = state.startedAt || now();
 try {
  const conversations = await request(`${base}/${encodeURIComponent(channel.accountId)}/conversations?platform=messenger&limit=10&fields=id,updated_time,participants&${state.after ? 'after=' + encodeURIComponent(state.after) : ''}`, { headers });
  const latest = state.after ? await request(`${base}/${encodeURIComponent(channel.accountId)}/conversations?platform=messenger&limit=10&fields=id,updated_time,participants`, { headers }) : conversations;
  const threads = [...new Map([...(latest.data || []), ...(conversations.data || [])].map(t => [t.id,t])).values()];
  for (const thread of threads) {
   const participant = thread.participants?.data?.find(p => String(p.id) !== String(channel.accountId));
   if (!participant?.id) continue;
   const checkpointId = channel.id + ':' + thread.id, checkpoint = get('facebook_chat_cursors', checkpointId) || {};
   if(checkpoint.complete&&thread.updated_time&&checkpoint.remoteUpdatedAt===thread.updated_time)continue;
   // Always read the newest page; then advance an older-history cursor on later cycles.
   const readPage = async after => {
    const messages = await request(`${base}/${encodeURIComponent(thread.id)}/messages?limit=100&fields=id,created_time,message,from,to,attachments&${after ? 'after=' + encodeURIComponent(after) : ''}`, { headers });
    for (const item of [...(messages.data || [])].reverse()) if (ingestFacebookMessage(channel, item, { history: Date.parse(item.created_time) < Date.parse(startedAt), participant })) imported++;
    return messages.paging?.next ? messages.paging?.cursors?.after || '' : '';
   };
   const newestNext = await readPage('');
   const olderNext = checkpoint.after ? await readPage(checkpoint.after) : checkpoint.complete ? '' : newestNext;
   put('facebook_chat_cursors', { id: checkpointId, after: olderNext, complete: !olderNext, remoteUpdatedAt:thread.updated_time||'', syncedAt: now() });
  }
  put('facebook_chat_sync', { id: channel.id, startedAt, after: conversations.paging?.next ? conversations.paging?.cursors?.after || '' : '', status: 'ready', syncedAt: now(), imported, error: '' });
  return { imported, more: !!conversations.paging?.next };
 } catch (error) {
  put('facebook_chat_sync', { ...state, startedAt, id: channel.id, status: 'error', syncedAt: now(), error: error.message });
  throw error;
 } finally { running.delete(channel.id); }
}

export async function facebookChatTick() {
 for (const channel of all('connections').filter(c => c.provider === 'facebook' && c.status === 'connected' && c.mode === 'api')) {
  const state = get('facebook_chat_sync', channel.id);
  if (state?.syncedAt && Date.now() - Date.parse(state.syncedAt) < (state.after && state.status !== 'error' ? 5000 : state.status==='error'?60000:10000)) continue;
  try { await syncFacebookChat(channel); } catch { /* Error is stored for the channel's diagnostic UI. */ }
 }
}
