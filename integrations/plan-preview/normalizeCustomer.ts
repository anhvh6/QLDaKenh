import {DEFAULT_SIDEBAR_BLOCKS,DEFAULT_CHEWING_INSTRUCTION} from '../constants';
const parseFlag = (value: any, fallback = true): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['false', '0', 'off', 'no', 'n', 'f', 'disabled'].includes(normalized)) return false;
    if (['true', '1', 'on', 'yes', 'y', 't', 'enabled'].includes(normalized)) return true;
  }
  return fallback;
};

export const normalizeCustomer = (item: any): any => {
  if (!item) return item;
  
  let blocks = item.sidebar_blocks_json;
  if (typeof blocks === 'string' && blocks.trim() !== '') {
    try { blocks = JSON.parse(blocks); } catch (e) { blocks = DEFAULT_SIDEBAR_BLOCKS; }
  }
  if (!Array.isArray(blocks) || blocks.length === 0) blocks = DEFAULT_SIDEBAR_BLOCKS;

  let sanPham = item.san_pham;
  if (typeof sanPham === 'string' && sanPham.trim() !== '') {
    try { sanPham = JSON.parse(sanPham); } catch (e) { sanPham = []; }
  }

  // Only use is_customized as the source of truth for private plan mode
  const isCustomized = item.is_customized === 1 || item.is_customized === true;

    let rawBackup = item.raw_backup || {};
    if (typeof rawBackup === 'string') {
      try { rawBackup = JSON.parse(rawBackup); } catch(e) {}
    }

    return { 
      ...item, 
      is_customized: isCustomized,
      id: item.id,
      customer_id: String(item.customer_id || item.id || ""),
      customer_name: String(item.customer_name || "").toUpperCase(),
      sdt: String(item.sdt || "").trim(),
      email: String(item.email || "").trim().toLowerCase(),
      dia_chi: String(item.dia_chi || "").trim(),
      note: String(item.note || ""), 
      sidebar_blocks_json: blocks,
      san_pham: Array.isArray(sanPham) ? sanPham : [],
      gia_tien: Number(item.gia_tien || 0),
      trang_thai: Number(item.trang_thai || 0),
      chewing_status: String(item.chewing_status || DEFAULT_CHEWING_INSTRUCTION),
      app_title: item.app_title || "Phác đồ 30 ngày thay đổi khuôn mặt",
      app_slogan: item.app_slogan || "Hành trình đánh thức vẻ đẹp tự nhiên, gìn giữ thanh xuân.",
      video_date: item.Video_date || item.video_date,
      link: item.link || "",
      token: item.token || "",
      require_google_auth: parseFlag(item.require_google_auth, true),
      require_device_limit: parseFlag(item.require_device_limit, true),
      pending_email: item.pending_email || "",
      raw_backup: rawBackup,
      creator_email: rawBackup.creator_email || "",
      ad_config: rawBackup.ad_config || undefined
    };
  };

