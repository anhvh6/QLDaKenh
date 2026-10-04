export const nameConditions={manual:'Gán thủ công cho khách',zalo_not_friend:'Chưa kết bạn Zalo',zalo_friend:'Đã kết bạn Zalo',deposit:'Đã cọc tiền (chưa thu đủ)',no_plan:'Chưa có phác đồ',plan_active:'Phác đồ còn hiệu lực',plan_expiring:'Phác đồ sắp hết hạn',plan_expired:'Phác đồ đã hết hạn',tag:'Có nhãn hội thoại'};
export const defaultNameSettings={id:'chat-names',version:0,expiringDays:7,rules:[
 {id:'expired',label:'Phác đồ đã hết hạn',condition:'plan_expired',color:'#B42318',enabled:true},
 {id:'expiring',label:'Phác đồ sắp hết hạn',condition:'plan_expiring',color:'#B54708',enabled:true},
 {id:'active',label:'Phác đồ còn hiệu lực',condition:'plan_active',color:'#167347',enabled:true},
 {id:'deposit',label:'Đã cọc tiền',condition:'deposit',color:'#6941C6',enabled:true},
 {id:'no-plan',label:'Chưa có phác đồ',condition:'no_plan',color:'#475467',enabled:true},
 {id:'friend',label:'Đã kết bạn Zalo',condition:'zalo_friend',color:'#175CD3',enabled:true},
 {id:'not-friend',label:'Chưa kết bạn Zalo',condition:'zalo_not_friend',color:'#9C2A6B',enabled:true}
]};
export const chatName=(c,p)=>c.threadType===1?(c.title||c.group?.name||p?.name||'Nhóm'):(p?.name||c.title||'Chưa có tên');
export function nameStatuses(S,c,config=S.chatNameSettings||defaultNameSettings,time=Date.now()){
 if(c.threadType===1)return [];
 const p=S.customers.find(p=>p.id===c.customerId)||{},ch=S.connections.find(ch=>ch.id===c.connectionId),j=(S.journeys||[]).find(j=>j.customerId===p.id);
 const plan=(S.chatPlanSummaries||[]).find(r=>r.customerId===p.id),saved=(S.plan_handoffs||[]).some(h=>h.customerId===p.id&&h.status==='saved_local');
 const hasPlan=!!plan||saved||!!(p.origin==='taophacdo'&&(p.video_date||p.is_customized));
 const start=plan?.startDate||j?.startDate||p.start_date,end=plan?.endDate||j?.endDate||p.end_date;
 const endTime=end?Date.parse(end+'T23:59:59.999+07:00'):NaN,startTime=start?Date.parse(start+'T00:00:00+07:00'):-Infinity;
 const valid=hasPlan&&(!plan?.status||!['INACTIVE','CANCELLED','REVOKED'].includes(String(plan.status).toUpperCase()));
 const expired=hasPlan&&Number.isFinite(endTime)&&endTime<time;
 const active=valid&&startTime<=time&&Number.isFinite(endTime)&&endTime>=time;
 const expiring=active&&Math.ceil((endTime-time)/86400000)<=config.expiringDays;
 const facts={zalo_not_friend:ch?.provider==='zalo_personal'&&c.isFriend===false,zalo_friend:ch?.provider==='zalo_personal'&&c.isFriend===true,deposit:(S.orders||[]).some(o=>o.customerId===p.id&&o.status!=='cancelled'&&o.total>0&&o.paid>0&&o.paid<o.total),no_plan:!hasPlan,plan_active:active,plan_expiring:expiring,plan_expired:expired};
 return config.rules.filter(r=>r.enabled&&/^#[0-9a-f]{6}$/i.test(r.color)&&(r.condition==='manual'?(p.chatStatusIds||[]).includes(r.id):r.condition==='tag'?(c.tags||[]).includes(r.value):facts[r.condition]===true));
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function chatNameSettingsPage(S){
 const cfg=S.chatNameSettings||defaultNameSettings,owner=S.user.role==='owner';
 return `<section class="panel"><div class="panel-head"><h2>Trạng thái & màu tên khách</h2>${owner?'<button class="btn small" type="button" data-name-action="add-rule">+ Thêm trạng thái</button>':''}</div><div class="panel-body"><p class="help-text">Quy tắc trên cùng khớp dữ liệu sẽ quyết định màu tên. Có thể đổi thứ tự ưu tiên, tắt quy tắc hoặc thêm trạng thái thủ công. Màu hiển thị ở danh sách và tiêu đề chat cá nhân.</p><form id="chat-name-settings-form"><label>Sắp hết hạn khi còn tối đa <input class="input" type="number" name="expiringDays" min="1" max="90" value="${cfg.expiringDays}" ${owner?'':'disabled'}> ngày</label><div id="chat-name-rule-list">${cfg.rules.map((r,i)=>nameRuleRow(r,i,owner)).join('')}</div>${owner?'<button class="btn primary" type="submit">Lưu quy định màu tên</button>':'<p class="help-text">Chủ hệ thống có quyền thay đổi cấu hình.</p>'}</form><p class="help-text">Kết bạn dựa trên dữ liệu Zalo đã đồng bộ. Tiền cọc dựa trên đơn chưa thu đủ. Thời hạn dựa trên phác đồ đã lưu/nhập và ngày học hiện có. Thiếu ngày hết hạn sẽ không tự đoán hiệu lực.</p></div></section>`;
}
export function nameRuleRow(r,i,editable=true){return `<div class="chat-name-rule" data-rule-id="${esc(r.id)}"><span class="name-rule-number">${i+1}</span><input type="checkbox" name="enabled" aria-label="Bật quy tắc" ${r.enabled?'checked':''} ${editable?'':'disabled'}><input class="input" name="label" aria-label="Tên trạng thái" value="${esc(r.label)}" maxlength="80" required ${editable?'':'disabled'}><input name="color" type="color" aria-label="Màu tên" value="${esc(r.color)}" ${editable?'':'disabled'}><select class="input" name="condition" aria-label="Điều kiện" ${editable?'':'disabled'}>${Object.entries(nameConditions).map(([v,t])=>`<option value="${v}" ${r.condition===v?'selected':''}>${t}</option>`).join('')}</select><input class="input" name="value" aria-label="Tên nhãn cần khớp" placeholder="Tên nhãn (nếu chọn Có nhãn)" maxlength="40" value="${esc(r.value||'')}" ${editable?'':'disabled'}>${editable?'<div class="row"><button class="icon-btn" type="button" data-name-action="rule-up" aria-label="Tăng ưu tiên">↑</button><button class="icon-btn" type="button" data-name-action="rule-down" aria-label="Giảm ưu tiên">↓</button><button class="icon-btn" type="button" data-name-action="rule-remove" aria-label="Bỏ quy tắc">×</button></div>':''}</div>`;}
