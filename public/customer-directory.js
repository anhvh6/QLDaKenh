import {icon} from './icons.js';
import {showLearnerProfile} from './learner-profile-ui.js';
let user='',H,query='',page=1,result=null,error='',pending=null,key='',epoch=0,lastAt=0,timer;
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function invalidateCustomerDirectory(){epoch++;lastAt=0;key='';result=null;}
function bindUser(){const next=H?.state?.user?H.state.user.id+':'+H.state.user.role:'';if(next!==user){user=next;query='';page=1;error='';invalidateCustomerDirectory();}}
export function customerDirectoryHTML(){bindUser();return `<div class="customer-directory" id="customer-directory"><p class="help-text">Chỉ gồm khách có số điện thoại, địa chỉ, đơn hàng, đặt cọc hoặc hồ sơ phác đồ. Nhóm sử dụng hồ sơ người đại diện.</p><div class="toolbar"><input class="input" id="customer-directory-query" aria-label="Tìm khách hàng" placeholder="Tên, số điện thoại, email…" value="${e(query)}" style="max-width:340px"></div><div id="customer-directory-results" aria-live="polite">${result?rowsHTML():'<p role="status">Đang tải khách hàng…</p>'}</div></div>`;}
function rowsHTML(){
 if(error)return `<p class="notice" role="alert">${e(error)}</p><button class="btn small" data-customer-directory="reload">Thử lại</button>`;
 if(!result)return '<p role="status">Đang tải khách hàng…</p>';
 const start=result.total?(result.page-1)*result.pageSize+1:0,end=Math.min(result.page*result.pageSize,result.total);
 return `<div class="panel table-wrap"><table><thead><tr><th>KHÁCH HÀNG</th><th>LIÊN HỆ</th><th>NHÓM KHÁCH</th><th>ĐƠN HÀNG</th><th>ĐÃ THU</th><th></th></tr></thead><tbody>${result.rows.map(c=>`<tr><td><strong>${e(c.name)}</strong><div class="muted">${e(c.stageName)}</div>${c.groups.length?`<small class="muted">Đại diện: ${e(c.groups.map(g=>g.name).join(', '))}</small>`:''}</td><td>${e(c.phone||'—')}<div class="muted">${e(c.email)}</div>${c.address?`<div class="muted">${e(c.address)}</div>`:''}</td><td>${c.tags.map(t=>`<span class="tag">${e(t)}</span>`).join(' ')}</td><td>${c.orderCount}</td><td>${Number(c.paidTotal||0).toLocaleString('vi-VN')} ₫</td><td><button class="btn small" data-customer-directory="profile" data-id="${e(c.id)}">${icon('right',14)}Xem</button></td></tr>`).join('')}</tbody></table>${result.rows.length?'':'<p class="help-text" style="padding:16px">Không có khách hàng phù hợp.</p>'}</div><div class="row between" style="margin-top:12px;flex-wrap:wrap"><small class="muted">${start}–${end} / ${result.total} khách hàng · Trang ${result.page}/${result.pageCount}</small><div class="row"><button class="icon-btn" data-customer-directory="previous" aria-label="Trang khách hàng trước" ${result.page<=1?'disabled':''}>${icon('left',18)}</button><button class="icon-btn" data-customer-directory="next" aria-label="Trang khách hàng tiếp theo" ${result.page>=result.pageCount?'disabled':''}>${icon('right',18)}</button></div></div>`;
}
function paint(){const root=document.querySelector('#customer-directory-results');if(root)root.innerHTML=rowsHTML();}
export function enhanceCustomerDirectory(){
 if(!H||!document.querySelector('#customer-directory'))return;bindUser();
 const requestKey=H.state.user.id+':'+query+':'+page;
 if(pending?.key===requestKey)return pending.promise;
 if(key===requestKey&&Date.now()-lastAt<15000){paint();return;}
 const generation=epoch;error='';const target=document.querySelector('#customer-directory-results');if(target&&!result)target.innerHTML='<p role="status">Đang tải khách hàng…</p>';
 const promise=H.api('/customers/directory?'+new URLSearchParams({q:query,page})).then(data=>{if(generation!==epoch||requestKey!==H.state.user.id+':'+query+':'+page)return;result=data;page=data.page;key=H.state.user.id+':'+query+':'+page;lastAt=Date.now();paint();}).catch(err=>{if(generation!==epoch)return;error=err.message;paint();}).finally(()=>{if(pending?.promise===promise)pending=null;});
 pending={key:requestKey,promise};return promise;
}
export function initCustomerDirectory(host){H=host;
 document.addEventListener('input',event=>{if(event.target.id!=='customer-directory-query')return;query=event.target.value;page=1;epoch++;result=null;clearTimeout(timer);timer=setTimeout(()=>void enhanceCustomerDirectory(),180);});
 document.addEventListener('click',event=>{const button=event.target.closest('[data-customer-directory]');if(!button)return;event.preventDefault();const action=button.dataset.customerDirectory;if(action==='profile'){void showLearnerProfile(button.dataset.id,H);return;}if(action==='previous')page=Math.max(1,page-1);if(action==='next')page++;if(action==='reload')lastAt=0;epoch++;result=null;void enhanceCustomerDirectory();});
}
