import {privateChatWaitMessage} from '../public/private-chat-state.js';
import {reupText} from '../public/reup-text.js';
import {contentSourceKey,copySourceBlock} from './copy-history.mjs';
import {chatOrderSource} from './chat-order-drafts.mjs';
import {validateOrderTarget} from './order-routing.mjs';
import {copyPlanBlock,copyPlanHandoffReady} from './copy-plan-guard.mjs';
import {commentReplyTarget} from './comment-context.mjs';
import { assertPublicationPreflight } from './publish-preflight.mjs';
import { validateGroupMentions } from './group-mentions.mjs';
import { publishMedia } from './social-copy.mjs';
import { assertCareConversation } from './student-care.mjs';
import { finishMentionTasks } from './staff-tasks.mjs';
import { saveSendReceipt } from './chat-send-receipt.mjs';
import { join, basename } from 'node:path';
import { dataDir } from './store.mjs';
import { all, get, put, remove, transaction, audit, notification, now, uid, secret, saveSecret, db } from './store.mjs';
import { syncPlanHandoff } from './plan-bridge.mjs';
import { observeCareMessage, syncPaymentOrder, enrollmentFromOrder, assertChannel } from './taophacdo.mjs';
import { providers, publish, continuePublish, validateThreadsText, deletePublication, updatePublication, sendMessage, reactComment, deleteComment, ghn, validMediaURL } from './connectors.mjs';
import { publicMediaUrl } from './public-media.mjs';
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function required(v, label, max = 10000) { if (typeof v !== 'string' || !v.trim() || v.length > max) fail(`${label} không hợp lệ.`); return v.trim(); }
export function number(v, label, min = 0, max = 1e12) { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max || !Number.isInteger(n)) fail(`${label} không hợp lệ.`); return n; }
export const kinds = ['connections', 'contents', 'publications', 'assets', 'campaigns', 'customers', 'products', 'orders', 'shipments', 'conversations', 'messages', 'templates', 'knowledge', 'workflows', 'notifications', 'tasks', 'payments', 'returns', 'stock', 'settings'];
export function permission(user, action) { const sets = { owner: ['*'], manager: ['*'], editor: ['read', 'content', 'assets', 'campaigns'], support: ['read', 'assets', 'inbox', 'customers', 'orders', 'tasks'], warehouse: ['read', 'shipping', 'products'], viewer: ['read'] }; if (!(sets[user.role] || []).some(x => x === '*' || x === action)) fail('Bạn không có quyền thực hiện thao tác này.', 403); }
const area = { connections: 'admin', contents: 'content', campaigns: 'campaigns', customers: 'customers', products: 'products', templates: 'inbox', knowledge: 'admin', workflows: 'admin', tasks: 'tasks', notifications: 'read', settings: 'admin' };
export function editRecord(user, kind, id, input) {
  if (!area[kind]) fail('Dữ liệu này phải cập nhật qua quy trình nghiệp vụ.'); permission(user, area[kind]); if (area[kind] === 'admin' && user.role !== 'owner') fail('Chỉ chủ hệ thống được cấu hình mục này.', 403);
  const prev = id ? get(kind, id) : null; if (id && !prev) fail('Không tìm thấy dữ liệu.', 404);
  const data = { ...prev, ...input }; delete data.version; delete data.token; delete data.appSecret; delete data.verifyToken; delete data.id;
  if (kind === 'products') {
    data.id_sp = prev?.id_sp || data.sku;
    required(data.name, 'Tên sản phẩm', 200); required(data.sku, 'SKU', 100); data.price = number(data.price, 'Giá bán'); data.cost = number(data.cost || 0, 'Giá vốn'); data.productType = data.productType || prev?.productType || 'physical'; if (!['physical', 'service', 'course'].includes(data.productType)) fail('Loại sản phẩm không hợp lệ.'); if (prev && prev.productType !== data.productType && all('orders').some(o => o.items.some(i => i.productId === prev.id))) fail('Không đổi loại sản phẩm đã có đơn.'); data.stock = number(data.stock || 0, 'Tồn kho'); data.weight = number(data.weight || 500, 'Khối lượng', 1, 100000);
    data.reserved = prev?.reserved || 0; if (data.stock < data.reserved) fail('Tồn kho không thể nhỏ hơn lượng đang giữ cho đơn.');
    if (all('products').some(p => p.sku.toLowerCase() === data.sku.toLowerCase() && p.id !== id)) fail('SKU đã tồn tại.');
  }
  if (kind === 'customers') { data.createdBy = prev?.createdBy || user.id; data.customer_id = prev?.customer_id || 'LOCAL-' + uid('customer'); if (prev?.origin === 'taophacdo') for (const k of ['customer_id', 'is_customized', 'video_date', 'ma_vd', 'start_date', 'end_date', 'san_pham', 'gia_tien', 'status']) data[k] = prev[k]; required(data.name, 'Tên khách', 200); data.tags = Array.isArray(data.tags) ? data.tags.slice(0, 20) : []; data.consent = data.consent === true; }
  if (kind === 'contents') {
    if (id && all('copy_jobs').some(j => j.contentId === id && ['queued', 'downloading', 'uploading'].includes(j.status))) fail('Bài đang được chuẩn bị đăng. Chờ tải hoàn tất trước khi sửa.', 409);
    for (const key of ['sourceVideoKey', 'sourceCopyId', 'sourceURL', 'copyReady', 'copyJobId', 'driveFolderId']) { if (prev?.[key] !== undefined) data[key] = prev[key]; else delete data[key]; }
    required(data.title, 'Tên nội dung', 250); data.caption = String(data.caption || ''); if (data.caption.length > 100000) fail('Nội dung bài vượt 100.000 ký tự.'); if (!['text', 'image', 'video', 'audio'].includes(data.type)) fail('Loại nội dung không hợp lệ.');
    data.channels = (data.channels || []).filter(x => get('connections', x)); data.assets = (data.assets || []).map(id => { const a = get('assets', id); if (!a || a.active === false || !(a.scopes || ['post']).includes('post')) fail('Media không còn dùng cho đăng bài.'); if (a.connectionId) assertChannel(user, a.connectionId); return id; }); data.status = 'draft'; data.approval = 'pending';
    // Editing an already scheduled content does not silently mutate the frozen publication.
  }
  if (kind === 'connections') {
    if (!providers[data.provider]) fail('Nền tảng không hợp lệ.'); required(data.name, 'Tên kênh', 200); if (!['demo', 'assisted', 'api'].includes(data.mode)) fail('Chế độ không hợp lệ.');
    if (data.mode === 'api' && !providers[data.provider].publish && !providers[data.provider].message && !providers[data.provider].oauth) fail('Kênh này hiện chỉ hỗ trợ đăng thủ công.');
    data.status = data.mode === 'demo' ? 'demo' : data.mode === 'assisted' ? 'assisted' : 'configured'; data.verifiedAt = null;
  }
  if (['campaigns', 'templates', 'workflows', 'tasks'].includes(kind)) required(data.name || data.title, 'Tên', 250);
  if (kind === 'templates') { data.usageInstructions = String(data.usageInstructions || '').slice(0, 5000); data.enabled = data.enabled !== false; required(data.text, 'Nội dung mẫu'); if (!Array.isArray(data.assetIds || []) || (data.assetIds || []).length > 10) fail('Tối đa 10 media cho mẫu.'); for (const id of data.assetIds || []) { const a = get('assets', id); if (!a || a.active === false || !(a.scopes || ['template']).includes('template')) fail('Media không còn dùng cho mẫu trả lời.'); if (a.connectionId) assertChannel(user, a.connectionId); } }
  if (kind === 'knowledge') { required(data.title, 'Tiêu đề', 250); required(data.body, 'Nội dung', 30000); }
  if (kind === 'workflows') {
    if (!['message_received', 'shipping_failed', 'order_confirmed'].includes(data.trigger)) fail('Sự kiện không hợp lệ.');
    if (!['tag', 'notify', 'task'].includes(data.action)) fail('Hành động không hợp lệ.'); data.enabled = data.enabled === true; data.runs = prev?.runs || 0;
  }
  const result = transaction(() => { const r = put(kind, { ...data, ...(id ? { id } : {}) }, prev ? input.version : undefined); if (kind === 'products' && (!prev || prev.stock !== r.stock)) put('stock', { productId: r.id, delta: r.stock - (prev?.stock || 0), type: 'adjustment', reason: input.reason || 'Điều chỉnh tồn kho', actor: user.id }); audit(user.id, prev ? 'update' : 'create', r.id, { kind }); return r; });
  if (kind === 'connections' && (input.token || input.appSecret)) { saveSecret(result.id, { ...secret(result.id), ...(input.token ? { token: input.token } : {}), ...(input.appSecret ? { appSecret: input.appSecret } : {}), ...(input.verifyToken ? { verifyToken: input.verifyToken } : {}) }); }
  return result;
}
export async function deleteRecord(user, kind, id, input = {}) {
  permission(user, area[kind] || 'admin'); if (area[kind] === 'admin' && user.role !== 'owner') fail('Chỉ chủ hệ thống được thực hiện.', 403); const r = get(kind, id); if (!r) fail('Không tìm thấy.', 404); let remoteDeleted = 0; const remoteDeletedByProvider = {};
  if (kind === 'connections') {
    if (input.remove === true) { if (r.status !== 'disconnected') fail('Hãy ngắt kết nối nền tảng trước khi xóa.'); put(kind, { ...r, deletedAt: now() }); }
    else { if (r.provider === 'zalo_personal') try { const zalo = await import('./zalo.mjs'); await zalo.disconnect(id); } catch { } put(kind, { ...r, status: 'disconnected' }); db.prepare('DELETE FROM secrets WHERE id=?').run(id); for (const p of all('publications').filter(x => x.connectionId === id && ['scheduled', 'awaiting_manual', 'blocked', 'failed'].includes(x.status))) put('publications', { ...p, status: 'cancelled' }); }
  }
  else if (kind === 'products') { put(kind, { ...r, active: false }); }
  else if (['contents', 'campaigns', 'templates', 'knowledge', 'workflows', 'tasks'].includes(kind)) {
    if (kind === 'contents') {
      const publications = all('publications').filter(x => x.contentId === id);
      if (input.deleteRemote === true) for (const p of publications.filter(x => x.status === 'published' && x.mode === 'api')) { const connection = get('connections', p.connectionId); if (!providers[connection?.provider]?.delete) continue; const result = await deletePublication(connection, p); put('publications', { ...p, status: result.unpublished ? 'unpublished_remote' : 'deleted_remote', deletedAt: now() }); remoteDeleted++; remoteDeletedByProvider[connection.provider] = (remoteDeletedByProvider[connection.provider] || 0) + 1; }
      for (const p of publications.filter(x => ['scheduled', 'awaiting_manual', 'failed', 'blocked'].includes(x.status))) put('publications', { ...p, status: 'cancelled' });
    } remove(kind, id);
  } else fail('Mục này không hỗ trợ xóa trực tiếp.'); audit(user.id, 'delete', id, { kind, remoteDeleted, remoteDeletedByProvider }); return { ok: true, remoteDeleted, remoteDeletedByProvider };
}
export function schedule(user, id, input, { prepared = false } = {}) {
  permission(user, 'content'); const c = get('contents', id); if (!c) fail('Không tìm thấy nội dung.', 404); if (input.version !== c.version) fail('Nội dung đã thay đổi. Mở lại trước khi lên lịch.', 409);
  const contentReview=assertPublicationPreflight(user, c, input, { prepared });
  const channels = c.channels || []; if (!channels.length) fail('Chọn ít nhất một kênh.'); if (!String(c.caption||'').trim()&&!['video','image'].includes(c.type)) fail('Nhập nội dung bài đăng.');
  const scheduleAt = input.immediate ? now() : input.scheduleAt; if (!Number.isFinite(Date.parse(scheduleAt))) fail('Chọn lịch đăng hợp lệ.'); if (!input.immediate && Date.parse(scheduleAt) < Date.now() + (prepared ? 0 : 10 * 60000) && !(prepared&&copyPlanHandoffReady(c,scheduleAt))) fail(prepared ? 'Lịch đăng đã qua trong lúc tải. Chọn lại giờ đăng.' : 'Lịch đăng cần cách hiện tại tối thiểu 10 phút.');
  const active = all('publications').filter(p => p.contentId === id && ['scheduled', 'dispatching', 'processing', 'awaiting_manual', 'unknown'].includes(p.status));
  if (active.some(p => p.status !== 'scheduled')) fail('Một đích đang được xử lý hoặc chờ đối soát; chưa thể thay đổi lịch.');
  // schedule() only reuses publications still in `active`; a channel that already finished publishing would
  // otherwise get a second, duplicate publish job instead of being updated or blocked (update-published is the
  // Facebook-only path for that; every other connected provider has no edit/delete API support at all).
  const alreadyLive = all('publications').filter(p => p.contentId === id && ['published', 'demo_published', 'manually_confirmed'].includes(p.status));
  if (alreadyLive.some(p => channels.includes(p.connectionId))) fail('Một hoặc nhiều kênh đã đăng bài này rồi. Bỏ kênh đó khỏi danh sách trước khi lên lịch lại, để tránh đăng trùng.');
  const frozen = channels.map(cid => {
    const ch = get('connections', cid); if (!ch || ch.status === 'disconnected') fail('Kênh đã ngắt kết nối.'); const v = c.variants?.[cid] || {},text=reupText(c,ch.provider,v); const type = v.type || c.type; const assets = (c.assets || []).map(id => get('assets', id)).filter(a => a?.active !== false); const asset = assets.find(a => a.type === type); const localUpload = ['youtube', 'tiktok'].includes(ch.provider); const mediaItems = c.copyReady&&type!=='text' ? assets.map(a => { if (!a.copyJobId) fail('Media nguồn không còn tồn tại.'); return { type: a.type, url: publishMedia(a, scheduleAt) }; }) : []; const mediaUrl = v.mediaUrl || mediaItems[0]?.url || c.mediaUrl || (asset && !localUpload ? publicMediaUrl(asset) : ''); let mode = ['youtube', 'tiktok'].includes(ch.provider) && ch.status === 'connected' ? 'api' : ch.mode;
    if (type !== 'text' && !asset && !mediaUrl) { const label = type === 'video' ? 'video' : type === 'audio' ? 'âm thanh' : 'ảnh'; const hasOtherMedia = (c.assets || []).some(aid => get('assets', aid)?.active !== false); fail(hasOtherMedia ? `Định dạng "${label}" không khớp với media đã đính kèm. Đổi Định dạng cho khớp loại file.` : `Định dạng "${label}" cần một file ${label} đính kèm. Hãy tải file lên hoặc đổi Định dạng thành Văn bản / bài viết.`); }
    if (mode === 'api') {
      if (!providers[ch.provider].publish) fail(`${ch.name}: chỉ hỗ trợ nhắn tin, hãy chọn chế độ hỗ trợ đăng.`);
      if (ch.status !== 'connected') fail(`${ch.name}: cần kiểm tra kết nối trước.`);
      if (!providers[ch.provider].formats.includes(type)) fail(`${ch.name}: API hiện chưa hỗ trợ định dạng ${type}; chuyển sang hỗ trợ đăng.`);
      if (type !== 'text' && !localUpload) validMediaURL(mediaUrl);
      if(ch.provider==='threads')validateThreadsText(text.caption);
      if (ch.provider === 'x' && text.caption.length > 280) fail('Bản X đang giới hạn văn bản ở 280 ký tự.');
    }
    if (mode === 'api' && mediaItems.length > 1 && !['facebook', 'instagram', 'threads'].includes(ch.provider)) fail('Kênh này chưa hỗ trợ tự động đăng nhiều media. Chọn chế độ hỗ trợ đăng.');
    if (mode === 'api' && ch.provider === 'facebook' && mediaItems.length > 1 && mediaItems.some(item => item.type !== 'image')) fail('Facebook API hiện hỗ trợ album ảnh; bài nhiều video cần đăng hỗ trợ.');
    return { ...(input.reviewWarnings?{contentReview:{rulesVersion:contentReview.rulesVersion,reviewToken:contentReview.reviewToken,warnings:contentReview.warnings.filter(w=>w.channelId===cid),acknowledgedBy:contentReview.warnings.length?user.id:null,reviewedAt:now()}}:{}),sourceVideoKey:contentSourceKey(c),contentId: id, connectionId: cid, title:text.title,caption:text.caption,copySourceCaption:(v.caption||c.caption),copyTextMapped:!!(c.sourceCopyId||c.sourceVideoKey||c.sourceURL||c.copyPlanId),type, visibility: v.visibility || c.visibility || 'public', assets: c.assets || [], mediaUrl, mediaItems, status: 'scheduled', mode, scheduleAt, revision: c.version, attempts: 0, error: '' };
  }); return transaction(() => { const jobs = frozen.map(next => { const prev = active.find(p => p.connectionId === next.connectionId); return put('publications', { ...prev, ...next, ...(prev ? { id: prev.id } : {}) }); }); for (const p of active.filter(p => !channels.includes(p.connectionId))) put('publications', { ...p, status: 'cancelled' }); put('contents', { ...c, status: 'scheduled', scheduleAt, approval: 'approved' }); audit(user.id, active.length ? 'reschedule' : 'schedule', id, { targets: jobs.length }); return jobs; });
}
export async function publicationAction(user, id, input) {
  permission(user, 'content'); const p = get('publications', id); if (!p) fail('Không tìm thấy lịch.', 404);
  if (input.action === 'cancel') { if (!['scheduled', 'awaiting_manual', 'failed', 'blocked'].includes(p.status)) fail('Không thể hủy tác vụ đã gửi hoặc chưa rõ kết quả.'); return put('publications', { ...p, status: 'cancelled' }); }
  if (input.action === 'confirm') { if (p.status !== 'awaiting_manual') fail('Đích này không chờ xác nhận thủ công.'); let u; try { u = new URL(input.url); } catch { fail('Nhập URL bài đã đăng.'); } if (!['https:', 'http:'].includes(u.protocol)) fail('URL không hợp lệ.'); return put('publications', { ...p, status: 'manually_confirmed', url: u.href, publishedAt: now() }); }
  if (input.action === 'retry') { if (!['failed', 'blocked'].includes(p.status)) fail('Chỉ thử lại tác vụ đã thất bại rõ ràng. Tác vụ chưa rõ kết quả cần đối soát.'); return put('publications', { ...p, status: 'scheduled', scheduleAt: now(), error: '' }); }
  if (input.action === 'publish_now') { if (p.status !== 'scheduled') fail('Chỉ có thể đăng ngay tác vụ đang chờ lịch.'); return put('publications', { ...p, scheduleAt: now() }); }
  if (input.action === 'resolve') { if (!['unknown', 'processing'].includes(p.status)) fail('Tác vụ không cần đối soát.'); let u; try { u = new URL(input.url); } catch { fail('Cần URL đã kiểm tra thực tế.'); } if (u.protocol !== 'https:') fail('Cần URL HTTPS.'); audit(user.id, 'publication_reconciled', id); return put('publications', { ...p, status: 'manually_confirmed', url: u.href, publishedAt: now() }); }
  if (input.action === 'delete_remote') {
    if (p.status !== 'published' || !p.externalId || !['api', undefined, null, ''].includes(p.mode)) fail('Chỉ xóa được bài đã xuất bản bằng API và còn ID nền tảng.'); const connection = get('connections', p.connectionId); if (!connection) fail('Kênh xuất bản không còn tồn tại.', 404); if (!providers[connection.provider]?.delete) fail('Nền tảng này chưa hỗ trợ xóa bài từ hệ thống.');
    const result = await deletePublication(connection, p); audit(user.id, result.unpublished ? 'publication_unpublished_remote' : 'publication_deleted_remote', id, { provider: connection.provider }); return put('publications', { ...p, status: result.unpublished ? 'unpublished_remote' : 'deleted_remote', deletedAt: now() });
  }
  fail('Hành động không hợp lệ.');
}
export async function updatePublishedContent(user, id) {
  permission(user, 'content'); const content = get('contents', id); if (!content) fail('Không tìm thấy nội dung.', 404);
  const candidates = all('publications').filter(p => p.contentId === id && p.status === 'published' && p.mode === 'api').sort((a, b) => Date.parse(b.publishedAt || b.updatedAt || 0) - Date.parse(a.publishedAt || a.updatedAt || 0)); const seen = new Set(), targets = [];
  for (const p of candidates) { if (seen.has(p.connectionId)) continue; seen.add(p.connectionId); const connection = get('connections', p.connectionId); if (providers[connection?.provider]?.update) targets.push({ p, connection }); }
  if (!targets.length) fail('Không tìm thấy bài đã đăng trên nền tảng có hỗ trợ cập nhật.', 409);
  const updatedByProvider = {}; for (const { p, connection } of targets) { const variant = content.variants?.[connection.id] || {}, type = variant.type || content.type, asset = (content.assets || []).map(assetId => get('assets', assetId)).find(item => item?.active !== false && item.type === type), next = { ...content, ...variant,...reupText(content,connection.provider,variant),type,mediaUrl: variant.mediaUrl || content.mediaUrl || (asset ? publicMediaUrl(asset) : '') }; await updatePublication(connection, p, next); put('publications', { ...p, title: next.title, caption: next.caption,copySourceCaption:variant.caption||content.caption,copyTextMapped:!!(content.sourceCopyId||content.sourceVideoKey||content.sourceURL||content.copyPlanId),type: next.type, assets: next.assets || [], mediaUrl: next.mediaUrl, updatedRemoteAt: now() }); updatedByProvider[connection.provider] = (updatedByProvider[connection.provider] || 0) + 1; }
  audit(user.id, 'publication_updated', id, { targets: targets.length, updatedByProvider }); return { ok: true, updated: targets.length, updatedByProvider, note: 'Blogger cập nhật nội dung và media; Facebook chỉ cập nhật phần chữ; YouTube cập nhật tiêu đề và mô tả. Media gốc của Facebook/YouTube được giữ nguyên.' };
}
export function orderItemTotals(user,input,allowCustomPrice=false){
  const seen = new Set(); const items = input.items.map(i => { const p = get('products', i.productId); if (!p || p.active === false) fail('Sản phẩm không còn bán.'); if (seen.has(p.id)) fail('SKU bị lặp. Hãy gộp số lượng.'); seen.add(p.id); return { productId: p.id, name: p.name, sku: p.sku, price: !allowCustomPrice || i.price === undefined ? p.price : number(i.price, 'Đơn giá', 0, 1e12), productType: p.productType || 'physical', courseId: p.courseId || null, quantity: number(i.quantity, 'Số lượng', 1, 10000) }; });
  if (allowCustomPrice && !['owner', 'manager'].includes(user.role) && items.some(i => i.price < get('products', i.productId).price * .8)) fail('Giảm đơn giá trên 20% cần quản lý.', 403);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0); const discount = number(input.discount || 0, 'Giảm giá', 0, subtotal); if (discount > subtotal * .2 && !['owner', 'manager'].includes(user.role)) fail('Giảm trên 20% cần quản lý.', 403);
  const physical = items.some(i => i.productType === 'physical'); const shippingFee = physical ? number(input.shippingFee || 0, 'Phí vận chuyển') : 0; return {items,subtotal,discount,physical,shippingFee};
}
export function createOrder(user, input, { allowCustomPrice = false, allowDraftAddress = false } = {}) {
  permission(user, 'orders'); const fulfillmentTarget=validateOrderTarget(input.fulfillmentTarget); const customer = get('customers', input.customerId); if (!customer) fail('Chọn khách hàng.'); if (!Array.isArray(input.items) || !input.items.length) fail('Thêm ít nhất một sản phẩm.'); if (input.conversationId) { const conv = get('conversations', input.conversationId); if (!conv || conv.customerId !== customer.id) fail('Hội thoại không khớp khách hàng.'); }
  const {items,subtotal,discount,physical,shippingFee}=orderItemTotals(user,input,allowCustomPrice); return transaction(() => { const pending=input.conversationId?all('orders').find(o=>o.conversationId===input.conversationId&&o.autoDraft&&o.status==='draft'&&!o.items?.length):null; const order = put('orders', { ...pending,awaitingProducts:false,createdBy:pending?.createdBy||(pending?'system':user.id),lastEditedBy:user.id,...(input.fulfillmentTarget!==undefined?{fulfillmentTarget}:{}), code: pending?.code||'MOC-' + Date.now().toString(36).toUpperCase() + '-' + uid('order').slice(-6).toUpperCase(), customerId: customer.id, receiverName: required(input.recipientName || input.receiverName || customer.name, 'Tên người nhận', 200), items, subtotal, discount, shippingFee, total: subtotal - discount + shippingFee, paid: 0, status: 'draft', paymentStatus: 'unpaid', freeShipping: input.freeShipping === true, bankTransfer: input.bankTransfer === true, transferAmount: input.bankTransfer === true ? number(input.transferAmount ?? subtotal - discount + shippingFee, 'Tiền chuyển khoản', 0, 1e12) : 0, email: String(input.email || customer.email || '').slice(0, 200), requiresShipping: physical, address: physical||fulfillmentTarget?.startsWith('pos:') ? (allowDraftAddress ? String(input.address || customer.address || '').trim().slice(0, 500) : required(input.address || customer.address, 'Địa chỉ', 500)) : '', phone: required(input.phone || customer.phone, 'Số điện thoại', 30), note: String(input.note || '').slice(0, 2000), ...chatOrderSource(input.conversationId,input.sourceMessageId), source: input.source || (input.conversationId?'Hội thoại':'Trực tiếp'), conversationId: input.conversationId || null, connectionId: input.conversationId ? get('conversations', input.conversationId)?.connectionId : null, contentId: input.conversationId ? get('conversations', input.conversationId)?.contentId : null, sourcePostId: input.conversationId ? get('conversations', input.conversationId)?.postId : null }); syncPaymentOrder(order); if (order.conversationId) { const conv = get('conversations', order.conversationId); if (!conv || conv.customerId !== customer.id) fail('Hội thoại không khớp khách hàng.'); put('messages', { conversationId: conv.id, direction: 'note', text: 'Đã tạo đơn ' + order.code + ' · ' + order.total.toLocaleString('vi-VN') + ' ₫ (nháp)', status: 'internal', orderId: order.id, actor: user.id }); } audit(user.id, 'order_created', order.id); return order; });
}
export function orderAction(user, id, input) {
  permission(user, 'orders'); return transaction(() => {
    const o = get('orders', id); if (!o) fail('Không tìm thấy đơn.', 404);
    if(input.version!==undefined&&Number(input.version)!==o.version)fail('Đơn đã thay đổi. Mở lại trước khi thao tác.',409);
    if (input.action === 'confirm') {
      if (o.status !== 'draft') fail('Chỉ xác nhận đơn nháp.'); if(!o.items?.length)fail('Thêm ít nhất một sản phẩm trước khi xác nhận đơn.'); if (o.requiresShipping) { const customer = get('customers', o.customerId); o.address = required(o.address || customer?.address, 'Địa chỉ giao hàng (bổ sung trong hồ sơ khách hàng)', 500); } for (const item of o.items.filter(i => !i.productType || i.productType === 'physical')) { const p = get('products', item.productId); if (!p || p.stock - p.reserved < item.quantity) fail(`Không đủ tồn: ${item.name}.`, 409); put('products', { ...p, reserved: p.reserved + item.quantity }); put('stock', { productId: p.id, orderId: id, delta: 0, reservedDelta: item.quantity, type: 'reserve', actor: user.id }); } o.status = 'confirmed';
    } else if (['cancel','delete'].includes(input.action)) {
      if(input.action==='delete'&&!['owner','manager'].includes(user.role))fail('Cần quyền quản lý để xóa đơn.',403);
      if (!['draft', 'confirmed'].includes(o.status)) fail('Đơn đã bàn giao phải xử lý hoàn hàng.'); if (all('shipments').some(s => s.orderId === id && s.status !== 'cancelled')) fail('Cần hủy vận đơn trước khi hủy đơn.');
      if (o.paid > 0) fail('Đơn đã có tiền. Ghi nhận hoàn tiền trước khi hủy.');
      if (o.status === 'confirmed') for (const i of o.items.filter(i => !i.productType || i.productType === 'physical')) { const p = get('products', i.productId); put('products', { ...p, reserved: p.reserved - i.quantity }); put('stock', { productId: p.id, orderId: id, reservedDelta: -i.quantity, delta: 0, type: 'release', actor: user.id }); } o.status = 'cancelled';if(input.action==='delete'){o.deletedAt=now();o.deletedBy=user.id;}
    } else if(input.action==='carry-payment'){
      if(!['owner','manager'].includes(user.role)||o.status!=='draft'||o.paid)fail('Chỉ quản lý được dùng khoản cũ cho đơn Mới chưa thu tiền.',409);const source=get('orders',String(input.sourceOrderId||''));if(!source?.deletedAt||source.paymentAllocatedTo||source.customerId!==o.customerId||source.conversationId!==o.conversationId||source.paid<=0||source.paid>o.total)fail('Khoản đã thanh toán không còn phù hợp hoặc đã được sử dụng.',409);o.paid=source.paid;o.bankTransfer=source.bankTransfer===true;o.transferAmount=source.bankTransfer?source.paid:0;o.paymentSourceOrderId=source.id;put('orders',{...source,paymentAllocatedTo:o.id});put('payments',{orderId:o.id,sourceOrderId:source.id,amount:0,transferredAmount:source.paid,type:'reallocation',reference:'Dùng khoản đã thu từ đơn '+source.code,actor:user.id});
    } else if(input.action==='restore'){if(o.paymentAllocatedTo)fail('Khoản đã thu đã dùng cho đơn thay thế; cần đối soát trước khi khôi phục.',409);if(!['owner','manager'].includes(user.role)||!o.deletedAt)fail('Không thể khôi phục đơn.',409);delete o.deletedAt;delete o.deletedBy;
    } else if (input.action === 'pay') {
      if (!['owner', 'manager'].includes(user.role)) fail('Chỉ quản lý được xác nhận đã nhận tiền.', 403); if (o.status === 'cancelled') fail('Đơn đã hủy.'); const amount = number(input.amount, 'Số tiền', 1, o.total - o.paid); o.paid += amount; put('payments', { orderId: id, amount, type: 'payment', method: input.method || 'bank', reference: required(input.reference, 'Tham chiếu / ghi chú', 300), actor: user.id });
    } else if (input.action === 'refund') {
      if (!['owner', 'manager'].includes(user.role)) fail('Cần quyền quản lý.', 403); const amount = number(input.amount, 'Tiền hoàn', 1, o.paid); o.paid -= amount; put('payments', { orderId: id, amount: -amount, type: 'refund', reference: required(input.reference, 'Lý do hoàn tiền', 500), actor: user.id });
    } else if (input.action === 'return') {
      if (!['delivered', 'partially_returned', 'return_pending_check'].includes(o.status)) fail('Chỉ nhập hàng hoàn từ đơn đã giao hoặc hãng đã hoàn về.');
      const returns = all('returns').filter(r => r.orderId === id); if (!input.items?.length) fail('Chọn hàng đã nhận và kiểm tra.');
      const returnSeen = new Set(); for (const i of input.items) { if (returnSeen.has(i.productId)) fail('Không lặp sản phẩm trong phiếu hoàn.'); returnSeen.add(i.productId); const original = o.items.find(x => x.productId === i.productId); if (!original) fail('SKU không có trên đơn.'); const returned = returns.flatMap(r => r.items).filter(x => x.productId === i.productId).reduce((s, x) => s + x.quantity, 0); const q = number(i.quantity, 'Số lượng hoàn', 1, original.quantity - returned); const p = get('products', i.productId); if (i.restock && (!original.productType || original.productType === 'physical')) { put('products', { ...p, stock: p.stock + q }); put('stock', { productId: p.id, orderId: id, delta: q, type: 'return', actor: user.id }); } }
      put('returns', { orderId: id, items: input.items, reason: required(input.reason, 'Lý do hoàn', 500), actor: user.id }); o.status = 'partially_returned';
    } else fail('Hành động đơn không hợp lệ.'); o.paymentStatus = o.paid >= o.total ? 'paid' : o.paid > 0 ? 'partial' : 'unpaid'; if (!o.requiresShipping && o.requiresShipping !== undefined && o.status === 'confirmed' && o.paymentStatus === 'paid') o.status = 'delivered'; const updated = put('orders', o); syncPlanHandoff(updated); syncPaymentOrder(updated); enrollmentFromOrder(updated); audit(user.id, `order_${input.action}`, id); return updated;
  });
}
export async function createShipment(user, id, input) {
  permission(user, 'shipping'); const o = get('orders', id); if (!o || o.status !== 'confirmed') fail('Cần đơn đã xác nhận.'); if (all('shipments').some(x => x.orderId === id && x.status !== 'cancelled')) fail('Đơn đã có vận đơn; kiểm tra trước khi tạo lại.');
  if (o.requiresShipping === false) fail('Đơn dịch vụ/khóa học không cần vận chuyển.'); const carrier = input.carrier || 'manual'; if (!['manual', 'demo', 'ghn', 'viettelpost_manual'].includes(carrier)) fail('Hãng chưa hỗ trợ.');
  let shipment = put('shipments', { orderId: id, carrier, status: 'creating', tracking: input.tracking || '', cod: Math.max(0, o.total - o.paid), fee: number(input.fee || 0, 'Phí hãng'), settlement: 'expected', history: [{ status: 'creating', at: now() }] });
  try {
    if (carrier === 'ghn') {
      const toDistrict = number(input.toDistrict, 'Mã quận/huyện GHN', 1); const toWard = required(input.toWard, 'Mã phường/xã GHN', 100); const serviceType = number(input.serviceType || 2, 'Loại dịch vụ', 1, 5);
      const r = await ghn('v2/shipping-order/create', { payment_type_id: 1, note: o.note, required_note: 'KHONGCHOXEMHANG', client_order_code: shipment.id, to_name: o.receiverName || get('customers', o.customerId).name, to_phone: o.phone, to_address: o.address, to_district_id: toDistrict, to_ward_code: toWard, cod_amount: shipment.cod, weight: o.items.reduce((s, i) => s + (get('products', i.productId).weight || 500) * i.quantity, 0), length: 20, width: 15, height: 10, service_type_id: serviceType, insurance_value: o.subtotal, items: o.items.map(i => ({ name: i.name, code: i.sku, quantity: i.quantity, price: i.price, weight: get('products', i.productId).weight || 500 })) });
      shipment.tracking = r.data.order_code; shipment.fee = r.data.total_fee || shipment.fee;
    } else if (carrier === 'demo') shipment.tracking = 'DEMO-' + Date.now().toString(36).toUpperCase(); else required(shipment.tracking, 'Mã vận đơn thực tế', 100);
    shipment.status = 'pickup_pending'; shipment.history.push({ status: 'pickup_pending', at: now() }); shipment = put('shipments', shipment); audit(user.id, 'shipment_created', shipment.id); return shipment;
  } catch (e) { put('shipments', { ...shipment, status: carrier === 'ghn' ? 'unknown' : 'cancelled', error: e.message }); throw e; }
}
export function shipmentAction(user, id, input) {
  permission(user, 'shipping'); return transaction(() => {
    const s = get('shipments', id); if (!s) fail('Không tìm thấy kiện.', 404); const o = get('orders', s.orderId); const allowed = { pickup_pending: ['in_transit', 'cancelled'], in_transit: ['delivered', 'delivery_failed', 'returning'], delivery_failed: ['in_transit', 'returning'], returning: ['returned'], unknown: ['pickup_pending', 'cancelled'] };
    if (s.carrier === 'viettelpost' && input.action !== 'settle') fail('Trạng thái Viettel Post được nhận từ hãng. Dùng yêu cầu hủy hoặc xác minh vận đơn trong mục Đơn hàng.');
    if (input.action === 'settle') {
      if (!['owner', 'manager'].includes(user.role)) fail('Cần quyền quản lý để đối soát.', 403); if (s.status !== 'delivered' || s.settlement === 'settled') fail('Kiện chưa giao hoặc đã đối soát.'); const amount = number(input.amount, 'Tiền thực nhận'); const expected = Math.max(0, s.cod - s.fee); s.settlement = amount === expected ? 'settled' : 'discrepancy'; s.settledAmount = amount; s.settledAt = now();
      // The gross collected amount is recognized once; carrier fees are tracked separately.
      if (!s.paymentRecorded && s.settlement === 'settled') { const collect = Math.min(s.cod, o.total - o.paid); if (collect > 0) { o.paid += collect; put('payments', { orderId: o.id, shipmentId: id, amount: collect, type: 'cod', netAmount: amount, fee: s.fee, reference: input.reference || s.tracking, actor: user.id }); put('orders', { ...o, paymentStatus: o.paid >= o.total ? 'paid' : 'partial' }); } s.paymentRecorded = true; }
    } else {
      const next = input.status; if (!allowed[s.status]?.includes(next)) fail('Chuyển trạng thái kiện không hợp lệ.');
      if (s.carrier === 'ghn' && !input.verified) fail('Xác nhận bạn đã kiểm tra trạng thái thực tế trên GHN.');
      if (s.status === 'unknown' && next === 'pickup_pending') { s.tracking = required(input.tracking, 'Mã vận đơn đã đối soát', 100); }
      if (next === 'in_transit' && o.status === 'confirmed') {
        for (const i of o.items.filter(i => !i.productType || i.productType === 'physical')) { const p = get('products', i.productId); if (p.reserved < i.quantity || p.stock < i.quantity) fail('Tồn kho không khớp; cần kiểm tra.'); put('products', { ...p, stock: p.stock - i.quantity, reserved: p.reserved - i.quantity }); put('stock', { productId: p.id, orderId: o.id, delta: -i.quantity, reservedDelta: -i.quantity, type: 'dispatch', actor: user.id }); } put('orders', { ...o, status: 'fulfilling' });
      }
      if (next === 'delivered') put('orders', { ...o, status: 'delivered' });
      if (next === 'returned') { for (const i of o.items.filter(i => !i.productType || i.productType === 'physical')) { const p = get('products', i.productId); put('products', { ...p, stock: p.stock + i.quantity }); put('stock', { productId: p.id, orderId: o.id, delta: i.quantity, type: 'returned_checked', actor: user.id }); } put('orders', { ...o, status: 'returned' }); }
      s.status = next; s.history = [...(s.history || []), { status: next, at: now(), actor: user.id }]; if (next === 'delivery_failed') runWorkflows('shipping_failed', { ...s, title: o.code });
    } syncPlanHandoff(get('orders', o.id)); audit(user.id, 'shipment_updated', id, input.action || input.status); return put('shipments', s);
  });
}
export function runWorkflows(trigger, entity) {
  for (const w of all('workflows').filter(x => x.enabled && x.trigger === trigger)) {
    const hay = (entity.text || entity.lastMessage || '').toLowerCase(); if (w.keyword && !hay.includes(w.keyword.toLowerCase())) continue;
    if (w.action === 'tag' && entity.conversationId) { const conv = get('conversations', entity.conversationId); if (conv) put('conversations', { ...conv, tags: [...new Set([...(conv.tags || []), w.value])] }); }
    if (w.action === 'notify') notification(w.name, w.value, 'inbox'); if (w.action === 'task') put('tasks', { name: w.value || w.name, status: 'open', entityId: entity.id }); put('workflows', { ...w, runs: (w.runs || 0) + 1, lastRun: now() }); audit('automation', w.name, entity.id);
  }
}
export async function reply(user, id, input) {
  permission(user, 'inbox'); const conv = get('conversations', id); if (!conv || conv.deletedAt) fail('Không tìm thấy hội thoại.', 404); assertChannel(user, conv.connectionId); let text = String(input.text || '').trim(); if (text.length > 5000) fail('Nội dung quá dài.'); const ch = get('connections', conv.connectionId); if (!ch) fail('Kênh không tồn tại.'); if (conv.groupUnavailable && !input.note) fail('Tài khoản đã rời nhóm hoặc nhóm đã giải tán.');
  const ids = input.assetIds || []; if (!Array.isArray(ids) || ids.length > 10) fail('Chọn tối đa 10 media.'); const assets = ids.map(id => { const a = get('assets', id); if (!a || a.active === false || !(a.scopes || ['chat']).includes('chat') || !/^\/uploads\/asset_[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(a.url)) fail('Media không hợp lệ.'); if (a.connectionId) assertChannel(user, a.connectionId); return a; });
  if (!text && !assets.length) fail('Nhập nội dung hoặc chọn media.');
  if(conv.kind==='comment'&&conv.remoteDeleted&&!input.note)fail('Bình luận gốc đã bị xóa.');
  if(conv.kind==='comment'&&ch.provider==='threads'&&Array.from(text).length>500)fail('Threads giới hạn 500 ký tự.');
  const commentMediaSupported = conv.kind === 'comment' && ch.provider === 'facebook';
  if (assets.length && ch.mode !== 'demo' && !['zalo_personal','facebook'].includes(ch.provider) && !commentMediaSupported && !input.note) fail('Kênh này chưa hỗ trợ gửi media trong ứng dụng.');
  if (assets.length > 1 && commentMediaSupported) fail('Bình luận Facebook chỉ nhận 1 media mỗi lần trả lời.');
  let quoted = input.quoteId ? get('messages', input.quoteId) : null; if (input.quoteId && (!quoted || quoted.deletedAt || quoted.conversationId !== id || quoted.direction === 'note')) fail('Tin trích dẫn không hợp lệ.');
  const mentionText = String(input.text || ''); let mentions = validateGroupMentions(conv, mentionText, input.mentions).map(m => ({ ...m, pos: m.pos - (mentionText.length - mentionText.trimStart().length) })); if (input.note && mentions.length) fail('Ghi chú nội bộ không tag thành viên nhóm.'); if (mentions.length && ch.mode !== 'demo' && ch.provider !== 'zalo_personal') fail('Kênh này chưa hỗ trợ tag thành viên nhóm qua API.'); const nativeQuote = quoted && ch.provider === 'zalo_personal' && quoted.quoteSource;
  if (quoted && !nativeQuote) { const prefix = '> ' + quoted.text.slice(0, 1000) + '\n\n'; text = prefix + text; mentions = mentions.map(m => ({ ...m, pos: m.pos + prefix.length })); }
  if (text.length > 5000) fail('Nội dung kèm trích dẫn vượt 5000 ký tự.');
  if(!input.note&&ch.provider==='facebook'&&conv.kind!=='comment'&&Array.from(text).length>2000)fail('Messenger giới hạn 2000 ký tự mỗi tin nhắn. Rút gọn nội dung trước khi gửi.');
  if(!input.note&&privateChatWaitMessage(conv))fail(privateChatWaitMessage(conv),409);
  const replyToExternalId=conv.kind==='comment'?await commentReplyTarget(user,conv,input.replyTarget):null;
  const options = { ...(mentions.length ? { mentions } : {}), ...(nativeQuote ? { quote: quoted.quoteSource } : {}), ...(assets.length ? { attachments: assets.map(a => join(dataDir, 'uploads', basename(a.url))), assetRefs: assets } : {}) };
  if (input.version !== get('conversations',id)?.version) fail('Hội thoại vừa thay đổi. Tải lại trước khi gửi.', 409);
  if (conv.sending) fail('Có một tin nhắn đang gửi. Vui lòng chờ.', 409); put('conversations', { ...conv, sending: true, assignee: user.id });
  const retrySource = input.retryOf ? get('messages', input.retryOf) : null;
  if (input.retryOf && (!retrySource || retrySource.conversationId !== id || retrySource.status !== 'failed' || retrySource.retryMessageId)) { put('conversations', { ...get('conversations', id), sending: false }); fail('Tin nhắn không còn có thể gửi lại.', 409); }
  let msg = put('messages', { conversationId: id, direction: input.note ? 'note' : 'outgoing', senderType: user.botId ? 'ai' : 'staff', botId: user.botId || null, botRunId: user.botRunId || null, text, mentions, attachments: assets.map(({ id, url, name, type }) => ({ assetId: id, url, name, type })), quoteId: quoted?.id || null, replyToExternalId,replyTarget:input.replyTarget||'current', retryOf: retrySource?.id || null, status: 'sending', actor: user.id });
  if (retrySource) put('messages', { ...retrySource, retryMessageId: msg.id });
  try {
    let result; if (input.note) result = {}; else if (ch.mode === 'demo') result = { demo: true }; else { if (ch.status !== 'connected') fail('Kênh chưa được kết nối thực tế.'); result = await sendMessage(ch, replyToExternalId?{...conv,externalCommentId:replyToExternalId}:conv, text, options); }
    msg = saveSendReceipt(msg, result, assets.map(({ id, url, name, type }) => ({ assetId: id, url, name, type })));
    const current = get('conversations', id); put('conversations', { ...current, ...(result?.privateReply?{privateReplySentAt:now()}:{}),...(result?.recipient_id?{externalUserId:String(result.recipient_id)}:{}), sending: false, lastMessage: input.note ? current.lastMessage : text, lastAt: input.note ? current.lastAt : now(), unread: input.note ? current.unread : false, waitingSince: input.note ? current.waitingSince : null, slaAlerted: input.note ? current.slaAlerted : false, firstResponseSeconds: !input.note && current.waitingSince ? Math.round((Date.now() - Date.parse(current.waitingSince)) / 1000) : current.firstResponseSeconds, assignee: user.id }); audit(user.id, input.note ? 'note_added' : 'message_sent', id); if (!input.note) finishMentionTasks(user, id, msg.id); return msg;
  } catch (e) { if(e.externalMessages?.length)msg=saveSendReceipt(msg,{externalMessages:e.externalMessages},msg.attachments); put('messages', { ...msg, status: e.unknown ? 'unknown' : 'failed', error: e.message }); put('conversations', { ...get('conversations', id), sending: false }); e.messageId=msg.id; throw e; }
}
export async function reactMessage(user, id, input) {
  permission(user, 'inbox'); const msg = get('messages', id); if (!msg) fail('Không tìm thấy bình luận.', 404); const conv = get('conversations', msg.conversationId); if (!conv) fail('Không tìm thấy hội thoại.', 404); assertChannel(user, conv.connectionId); if (conv.kind !== 'comment' || msg.direction !== 'incoming') fail('Chỉ react được bình luận của khách.');
  const ch = get('connections', conv.connectionId); if (!ch) fail('Kênh không tồn tại.'); const like = input.like !== false;
  if (ch.mode !== 'demo') { if (ch.provider !== 'facebook') fail('Kênh này chưa hỗ trợ react bình luận.'); if (ch.status !== 'connected') fail('Kênh chưa được kết nối thực tế.'); if (!msg.externalId) fail('Bình luận chưa có ID gốc.'); await reactComment(ch, msg.externalId, like); }
  audit(user.id, 'comment_reacted', id, { like }); return put('messages', { ...msg, liked: like });
}
export async function deleteCommentMessage(user, id) { permission(user, 'inbox'); const msg = get('messages', id); if (!msg || msg.deletedAt) fail('Không tìm thấy bình luận.', 404); const conv = get('conversations', msg.conversationId); if (!conv) fail('Không tìm thấy hội thoại.', 404); assertChannel(user, conv.connectionId); if (conv.kind !== 'comment' || msg.direction !== 'incoming') fail('Chỉ xóa được bình luận của khách.'); const ch = get('connections', conv.connectionId); if (!ch) fail('Kênh không tồn tại.'); if (ch.mode !== 'demo') { if (!['facebook', 'instagram'].includes(ch.provider)) fail('Kênh này chưa hỗ trợ xóa bình luận.'); if (ch.status !== 'connected') fail('Kênh chưa được kết nối thực tế.'); if (!msg.externalId) fail('Bình luận chưa có ID gốc.'); await deleteComment(ch, msg.externalId); } audit(user.id, 'comment_deleted', id, { remote: ch.mode !== 'demo' });if(msg.externalId===conv.externalCommentId)put('conversations',{...get('conversations',conv.id),remoteDeleted:true,status:'resolved'}); return put('messages', { ...msg, text: 'Bình luận đã xóa', attachments: [], deletedAt: now(), status: 'deleted' }); }
export function ingestDemo(user, input) { permission(user, 'inbox'); assertChannel(user, input.connectionId); const ch = get('connections', input.connectionId); if (ch?.mode !== 'demo') fail('Chỉ tạo tương tác mẫu trên kênh mẫu.'); const c = get('customers', input.customerId); if (!c) fail('Chọn khách hàng.'); const text = required(input.text, 'Tin nhắn'); const conv = put('conversations', { customerId: c.id, connectionId: ch.id, kind: input.kind || 'message', status: 'open', unread: true, assignee: '', lastMessage: text, lastAt: now(), tags: [], mode: 'demo', productId: input.productId || null }); const msg = put('messages', { conversationId: conv.id, direction: 'incoming', text, status: 'demo' }); runWorkflows('message_received', { ...msg, conversationId: conv.id }); observeCareMessage(get('conversations', conv.id), msg); return get('conversations', conv.id); }
let ticking = false;
export async function tick() {
  if (ticking) return; ticking = true; try {
    const jobs = all('publications').filter(p => p.status === 'scheduled' && Date.parse(p.scheduleAt) <= Date.now()).filter(p=>{const block=copyPlanBlock(p);return !block||block.startsWith('Đã lỡ')||block.startsWith('Đã đăng')||block.startsWith('Kênh đã');}).slice(0, 5);
    for (let p of jobs) {
      const copyBlock=copySourceBlock(get('contents',p.contentId)||{sourceVideoKey:p.sourceVideoKey},p.connectionId,{publicationId:p.id,dispatch:true})||copyPlanBlock(p);if(copyBlock){if(copyBlock.startsWith('Bài nguồn')||copyBlock.startsWith('Đã lỡ')||copyBlock.startsWith('Đã đăng')||copyBlock.startsWith('Kênh đã'))put('publications',{...p,status:'blocked',error:copyBlock});continue;}
      const ch = get('connections', p.connectionId); if (!ch || ch.status === 'disconnected') { put('publications', { ...p, status: 'blocked', error: 'Kênh đã ngắt kết nối.' }); continue; }
      if(!p.copyTextMapped){const source=get('contents',p.contentId);if(p.sourceVideoKey||source?.sourceCopyId||source?.copyPlanId)p=put('publications',{...p,copySourceCaption:p.caption,...reupText({...p,sourceCopyId:source?.sourceCopyId,sourceVideoKey:p.sourceVideoKey||source?.sourceVideoKey},ch.provider),copyTextMapped:true});}
      if (p.mode === 'assisted') { put('publications', { ...p, status: 'awaiting_manual' }); notification('Đến giờ đăng: ' + p.title, `Mở gói đăng cho ${ch.name}.`, 'calendar'); continue; }
      if (p.mode === 'demo') { put('publications', { ...p, status: 'demo_published', publishedAt: now(), attempts: p.attempts + 1 }); continue; }
      if (ch.status !== 'connected') { put('publications', { ...p, status: 'blocked', error: 'Kênh chưa được kiểm tra kết nối.' }); continue; }
      put('publications', { ...p, status: 'dispatching', attempts: p.attempts + 1 });
      try { const r = await publish(ch, p); put('publications', { ...get('publications', p.id), ...r, status: r.processing ? 'processing' : 'published', ...(r.processing?{processingStartedAt:now(),nextCheckAt:''}:{}), publishedAt: r.processing ? null : now(), error: '' }); }
      catch (e) { put('publications', { ...get('publications', p.id), status: e.unknown ? 'unknown' : 'failed', error: e.message }); notification('Cần xử lý bài đăng', `${ch.name}: ${e.message}`, 'calendar'); }
    }
    for (const p of all('publications').filter(x => x.status === 'processing' && (x.containerId || x.carouselPending) && (!x.nextCheckAt||Date.parse(x.nextCheckAt)<=Date.now())).slice(0, 5)) {
      if (Date.now() - Date.parse(p.processingStartedAt||p.updatedAt) > 30 * 60000) { put('publications', { ...p, status: 'unknown', error: 'Xử lý quá lâu. Đối soát trên nền tảng gốc.' }); continue; }
      const ch = get('connections', p.connectionId); if (!ch || ch.status !== 'connected') continue;
      try { const r = await continuePublish(ch, p); if (r) put('publications', { ...p, ...r, status: r.processing ? 'processing' : 'published', processingStartedAt:p.processingStartedAt||p.updatedAt, nextCheckAt:'', statusReadFailures:0, error:'', publishedAt: r.processing ? null : now() }); else put('publications',{...p,processingStartedAt:p.processingStartedAt||p.updatedAt,nextCheckAt:new Date(Date.now()+15000).toISOString(),error:''}); } catch (e) { if(e.retryable){const failures=(p.statusReadFailures||0)+1;put('publications',{...p,processingStartedAt:p.processingStartedAt||p.updatedAt,statusReadFailures:failures,nextCheckAt:new Date(Date.now()+Math.min(60000,failures*15000)).toISOString(),error:e.message});continue;}put('publications', { ...p, status: e.unknown ? 'unknown' : 'failed', error: e.message }); notification('Cần xử lý bài đăng', `${ch.name}: ${e.message}`, 'content', {contentId:p.contentId}); }
    }
  } finally { ticking = false; }
}
export function recoverJobs() { for (const p of all('publications').filter(x => x.status === 'dispatching')) put('publications', { ...p, status: 'unknown', error: 'Máy chủ khởi động lại khi đang gửi. Cần kiểm tra kết quả trước khi gửi lại.' }); for (const c of all('conversations').filter(x => x.sending)) put('conversations', { ...c, sending: false }); for (const m of all('messages').filter(x => x.status === 'sending')) put('messages', { ...m, status: 'unknown' }); for (const s of all('shipments').filter(x => x.status === 'creating')) put('shipments', { ...s, status: 'unknown' }); }
