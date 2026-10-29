// OAuth errors use a string `error`, unlike Google resource APIs.
export function googleAPIError(url, data = {}) {
  const host = new URL(url).hostname;
  if (host !== 'oauth2.googleapis.com' && !host.endsWith('.googleapis.com')) return null;
  const detail = typeof data.error === 'object' && data.error ? data.error : {};
  const code = typeof data.error === 'string' ? data.error : detail.errors?.[0]?.reason || detail.status || detail.code;
  const description = String(data.error_description || detail.message || data.message || '');
  const messages = {
    invalid_grant: 'Phiên kết nối Google đã hết hiệu lực hoặc bị thu hồi. Vào Cài đặt → Kênh kết nối, kết nối lại đúng kênh Blogger/YouTube rồi thử lại bài này.',
    invalid_client: 'Google từ chối ứng dụng OAuth. Kiểm tra Client ID/Client Secret của đúng ứng dụng đã kết nối kênh; không đổi sang ứng dụng khác khi làm mới phiên.',
    unauthorized_client: 'Ứng dụng Google chưa được phép làm mới phiên kết nối. Kiểm tra cấu hình OAuth và kết nối lại kênh.',
    invalidTitle: 'YouTube từ chối tiêu đề video. Hãy sửa tiêu đề đúng giới hạn của YouTube rồi thử lại.',
    invalidDescription: 'YouTube từ chối mô tả video. Hãy kiểm tra độ dài và ký tự trong nội dung rồi thử lại.',
    quotaExceeded: 'Hạn mức API Google đã hết. Kiểm tra quota của dự án Google Cloud; không thử đăng liên tục.',
    uploadLimitExceeded: 'Kênh YouTube đã đạt giới hạn tải video. Chờ giới hạn được đặt lại trước khi đăng tiếp.'
  };
  const message = messages[code] || description || (code ? `Google từ chối yêu cầu: ${code}` : '');
  return { code, message, reconnectRequired: ['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(code) };
}
