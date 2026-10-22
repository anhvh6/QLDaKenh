import {socialOperations,socialOperationLabels} from './social-capabilities.js';
const escape=value=>String(value||'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export function connectionHealthBadge(c){
 if(c.status==='disconnected')return '<span class="badge disconnected">Đã ngắt</span>';
 if(c.mode==='demo')return '<span class="badge demo">Dữ liệu mẫu</span>';
 if(c.mode==='assisted')return '<span class="badge assisted">Hỗ trợ thủ công</span>';
 if(c.provider==='zalo_personal'){
  if(c.status==='connected'&&c.listenerState==='listening')return '<span class="badge connected">Đang nhận tin</span>';
  if(['connecting','reconnecting'].includes(c.status)||['connecting','reconnecting','waiting_key'].includes(c.listenerState))return '<span class="badge pending">Đang kết nối</span>';
  return '<span class="badge failed">Phiên chưa hoạt động</span>';
 }
 const errors=(c.health?.checks||[]).filter(x=>x.status==='error');
 if(errors.some(x=>x.key==='profile'))return '<span class="badge failed">Lỗi xác thực API</span>';
 if(c.status==='connected'&&errors.length)return '<span class="badge blocked">API cần xử lý</span>';
 if(c.status==='connected')return '<span class="badge connected">Đã kết nối</span>';
 if(c.status==='error')return '<span class="badge failed">Kết nối lỗi</span>';
 return '<span class="badge configured">Chưa xác thực</span>';
}
export function socialHealthHTML(c){
 const health=c.health,operations=socialOperations[c.provider]||{},errors=(health?.checks||[]).filter(x=>x.status==='error');
 return `${errors.length?`<p role="alert" style="color:var(--danger,#a52b39);font-size:12px">API cần kiểm tra: ${escape(errors[0].message)}</p>`:''}<details class="social-health" data-health-channel="${escape(c.id)}" style="margin-top:12px;font-size:12px"><summary>Chức năng & kiểm tra API${errors.length?` · ${errors.length} lỗi`:''}</summary><p>${Object.entries(socialOperationLabels).map(([key,label])=>`${label}: ${operations[key]?'đã triển khai':'chưa hỗ trợ trong hệ thống'}`).map(escape).join('<br>')}</p><p>Đăng bài, trả lời, Like và chia sẻ chỉ được xác minh gửi thực tế khi bạn thực hiện thao tác. Kiểm tra bên dưới không tự đăng hoặc gửi tin.</p>${health?`<p>Kiểm tra: ${escape(new Date(health.checkedAt).toLocaleString('vi-VN'))}</p>${health.checks.map(item=>`<p>${escape(({profile:'Hồ sơ',publish:'API đăng video',publish_access:'Quyền đăng',webhook:'Webhook',comments:'Đọc bình luận',chat:'Đọc hội thoại',sync:'Đồng bộ'})[item.key]||item.key)}: ${item.status==='ok'?'đọc API thành công':escape(item.message||item.status)}</p>`).join('')}`:'<p>Chưa kiểm tra khả năng API của phiên hiện tại.</p>'}${c.mode==='api'?`<button type="button" class="btn small" data-action="check-social-health" data-id="${escape(c.id)}">Kiểm tra API từng chức năng</button>`:''}</details>`;
}
