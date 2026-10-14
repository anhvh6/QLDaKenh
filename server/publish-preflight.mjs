import { all, get } from './store.mjs';
import { providers } from './connectors.mjs';
import { assertChannel } from './taophacdo.mjs';

// Read-only: validate every destination before any copy download or publication is queued.
export function publicationPreflight(user, content, input = {}, { prepared = false, sourceMedia = null, checkHistory = true } = {}) {
  const issues = [], add = (channel, message) => issues.push({ channelId: channel?.id || '', channel: channel?.name || 'Bài viết', message });
  if (!content) return { ok: false, issues: [{ channel: 'Bài viết', message: 'Không tìm thấy nội dung.' }] };
  const channels = content.channels || [];
  if (!channels.length) add(null, 'Chọn ít nhất một kênh.');
  if (!String(content.caption || '').trim()&&!['video','image'].includes(content.type)) add(null, 'Nhập nội dung bài đăng.');
  if (!input.immediate && (!Number.isFinite(Date.parse(input.scheduleAt)) || Date.parse(input.scheduleAt) < Date.now() + (prepared ? 0 : 600000))) add(null, prepared ? 'Lịch đăng đã qua trong lúc tải. Chọn lại giờ đăng.' : 'Lịch đăng cần cách hiện tại tối thiểu 10 phút.');
  const source = content.sourceCopyId && !content.copyReady ? get('copy_posts', content.sourceCopyId) : null;
  const media = sourceMedia || (source ? source.media || [] : (content.assets || []).map(id => get('assets', id)).filter(a => a && a.active !== false));
  const publications = checkHistory ? all('publications').filter(p => p.contentId === content.id) : [];
  for (const id of channels) {
    const ch = get('connections', id);
    if (!ch) { add(null, 'Kênh đã bị xóa. Hãy chọn lại kênh đăng.'); continue; }
    try { assertChannel(user, id); } catch (error) { add(ch, error.message); continue; }
    const variant = content.variants?.[id] || {}, type = variant.type || content.type;
    const caption = String(variant.caption || content.caption || ''), title = String(variant.title || content.title || 'Video');
    const api = ['youtube', 'tiktok'].includes(ch.provider) && ch.status === 'connected' || ch.mode === 'api';
    if (ch.status === 'disconnected' || api && ch.status !== 'connected') add(ch, 'Kênh chưa kết nối thành công.');
    if (publications.some(p => p.connectionId === id && ['published', 'demo_published', 'manually_confirmed'].includes(p.status))) add(ch, 'Bài đã đăng trên kênh này. Bỏ chọn kênh để tránh đăng trùng.');
    if (publications.some(p => ['dispatching', 'processing', 'awaiting_manual', 'unknown'].includes(p.status))) add(ch, 'Bài đang được xử lý hoặc chờ đối soát; chưa thể đăng lại.');
    if (type !== 'text' && !media.some(m => m.type === type) && !(variant.mediaUrl || content.mediaUrl)) add(ch, `Thiếu media phù hợp với định dạng ${type}.`);
    if (!api) continue;
    const provider = providers[ch.provider];
    if (!provider?.publish || !provider.formats.includes(type)) add(ch, `API của kênh chưa hỗ trợ định dạng ${type}. Chọn định dạng hoặc kênh khác.`);
    const limits = { threads: 500, instagram: 2200, x: 280, tiktok: 2200 };
    // TikTok's limit uses UTF-16; Threads counts Unicode code points.
    const count = ch.provider === 'tiktok' || ch.provider === 'x' ? caption.length : Array.from(caption).length;
    if (limits[ch.provider] && count > limits[ch.provider]) add(ch, `Nội dung ${count}/${limits[ch.provider]} ký tự, vượt ${count - limits[ch.provider]} ký tự. Rút gọn bản riêng của kênh này.`);
    if (ch.provider === 'youtube') {
      if (Array.from(title).length > 100) add(ch, `Tiêu đề ${Array.from(title).length}/100 ký tự. Cần rút gọn tiêu đề.`);
      const bytes = Buffer.byteLength(caption, 'utf8');
      if (bytes > 5000) add(ch, `Mô tả ${bytes}/5000 byte UTF-8. Cần rút gọn nội dung.`);
      if (/[<>]/.test(title + caption)) add(ch, 'Tiêu đề và mô tả YouTube không được chứa dấu < hoặc >.');
    }
    const album = !!source || content.copyReady;
    if (album && media.length > 1 && !['facebook', 'instagram', 'threads'].includes(ch.provider)) add(ch, 'Kênh này chưa hỗ trợ tự động đăng nhiều media trong một bài.');
    if (album && media.length > 1 && ch.provider === 'facebook' && media.some(m => m.type !== 'image')) add(ch, 'Facebook API chỉ hỗ trợ album ảnh; không thể đăng album có video trong hệ thống.');
    const url = variant.mediaUrl || content.mediaUrl;
    if (type !== 'text' && url && !['youtube', 'tiktok'].includes(ch.provider) && !/^https:\/\//i.test(url)) add(ch, 'Media cần đường dẫn HTTPS công khai.');
    if (['youtube', 'tiktok'].includes(ch.provider) && !source && !media.some(m => m.type === 'video')) add(ch, 'Cần đính kèm file video để hệ thống tải lên kênh này.');
  }
  return { ok: issues.length === 0, issues };
}

export function assertPublicationPreflight(user, content, input, options) {
  const result = publicationPreflight(user, content, input, options);
  if (!result.ok) throw Object.assign(new Error(result.issues.map(i => `${i.channel}: ${i.message}`).join('\n')), { status: 400 });
  return result;
}
