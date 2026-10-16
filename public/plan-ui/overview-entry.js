// Reuse the management dashboard's own click handlers, rather than a second filter implementation.
const key=new URLSearchParams(location.search).get('overview');
const labels={new:/^\d[\d.,]*\s+Mới$/i,noPlan:/^\d[\d.,]*\s+Chưa có PĐ$/i,consultation:/^\d[\d.,]*\s+Chưa TV$/i,deposit:/^\d[\d.,]*\s+Đặt cọc$/i,active:/^\d[\d.,]*\s+Hoạt động$/i,expiring:/^\d[\d.,]*\s+Sắp hết hạn$/i,opened:/^HV VÀO HỌC\s*:\s*\d+/i};
if(labels[key]){
 let done=false;const apply=()=>{if(done)return;const candidates=[...document.querySelectorAll(key==='opened'?'button':'div')];const el=candidates.find(el=>labels[key].test(el.textContent.replace(/\s+/g,' ').trim())&&(key==='opened'||el.querySelector('svg')));if(!el)return;done=true;observer.disconnect();setTimeout(()=>{el.click();el.scrollIntoView({block:'nearest'});},300);};
 const observer=new MutationObserver(apply);observer.observe(document.documentElement,{childList:true,subtree:true});apply();setTimeout(()=>observer.disconnect(),60000);
}
