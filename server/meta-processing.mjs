// Provider-confirmed container failures are distinct from ambiguous publish writes.
export function checkMetaProcessing(state, provider) {
  const code = String(state.status_code || state.status || '').toUpperCase();
  if (['ERROR', 'EXPIRED'].includes(code)) {
    const detail = String(state.error_message || (state.status_code ? state.status : '') || code)
      .replace(/https?:\/\/\S+/g, '[URL media]').slice(0, 1200);
    throw Object.assign(new Error(`Nền tảng không xử lý được media: ${detail}${detail === code ? '' : ` (${code})`}. ${code === 'EXPIRED' ? 'Container đã hết hạn; hãy thử lại để tạo container mới.' : 'Kiểm tra định dạng video và khả năng nền tảng tải URL media trước khi thử lại.'}`), {
      unknown: false, processingFailure: {provider, status: code, detail}
    });
  }
  if (code === 'PUBLISHED') throw Object.assign(new Error('Nền tảng báo bài đã được xuất bản. Cần đối soát đường dẫn bài trước khi thử lại để tránh đăng trùng.'), {unknown: true});
  return code;
}

export function resetPublicationProcessing(p) {
  const clean = {...p};
  for (const key of ['containerId', 'container', 'childContainerIds', 'carouselPending', 'socialVerification', 'processingStartedAt', 'nextCheckAt', 'statusReadFailures', 'processingFailure', 'externalId', 'url', 'publishedAt']) delete clean[key];
  return clean;
}

// Only a confirmed terminal, generic container error can be recreated once.
// A lost publish receipt or a specific codec/permission error must never enter this path.
export function canRecoverMetaProcessing(p, error) {
  const failure=error.processingFailure;
  return error.unknown === false && failure?.status === 'ERROR' &&
    /^(UNKNOWN|ERROR)$/i.test(failure.detail.trim()) && (p.mediaRecoveryAttempts || 0) < 1;
}
