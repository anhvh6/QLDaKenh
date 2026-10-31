(()=>{
 const params=new URLSearchParams(location.search),conversationId=params.get('conversation');
 if(!conversationId||location.hash!=='#inbox')return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const promise=fetch('/api/chat/conversations/'+encodeURIComponent(conversationId)+'/live?limit=60',{headers:{'ngrok-skip-browser-warning':'true'}}).then(async response=>{
  if(!response.ok)throw Error('Chat window unavailable');
  const data=await response.json();window.__notificationChatWindow={conversationId,data};
  const app=document.getElementById('app');if(!app||app.dataset.ready==='true')return data;
  const rows=(data.messages||[]).filter(message=>!message.deletedAt).slice(-30),title=data.conversation?.title||rows.find(message=>message.senderName)?.senderName||'Hội thoại';
  app.innerHTML=`<div class="notification-chat-boot" role="status" aria-label="Đang mở hội thoại"><header><span>‹</span><strong>${escape(title)}</strong><small>Đang đồng bộ danh sách…</small></header><main>${rows.map(message=>`<div class="notification-chat-boot-row ${message.direction==='outgoing'?'outgoing':'incoming'}">${message.text?`<div>${escape(message.text)}</div>`:'<div>Đã gửi tệp hoặc hình ảnh</div>'}<small>${escape(new Date(message.createdAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}))}</small></div>`).join('')||'<p>Đang tải tin nhắn…</p>'}</main></div>`;
  requestAnimationFrame(()=>{const main=app.querySelector('.notification-chat-boot main');if(main)main.scrollTop=main.scrollHeight;});return data;
 }).catch(()=>null);
 window.__notificationChatWindowPromise=promise;
})();
