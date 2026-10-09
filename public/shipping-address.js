const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/\b(tp|p|q|phuong|quan|huyen|xa|tinh|thanh pho)\b/g,'').replace(/[^a-z0-9]/g,'');
export function addressSuggestion(original,parsed){
 const parts=String(parsed?.ADDRESS||'').split(/\s+-\s+|,/).map(v=>v.trim()).filter(Boolean);
 const segments=original.split(',').map(v=>v.trim()),admin=segments.findIndex(v=>/^(phường|xã|quận|huyện|tỉnh|thành phố|tp\.?|p\.|q\.)\s/i.test(v));
 const street=parsed.addressType&&parsed.addressType!=='unresolved'&&admin>0?segments.slice(0,admin).join(', '):original.trim();
 return [street,...parts.filter(v=>/^\d+$/.test(key(v))?!street.split(/,|\s+-\s+/).some(p=>key(p)===key(v)):!key(street).includes(key(v)))].filter(Boolean).join(', ');
}
export function initShippingAddress(host){
 document.addEventListener('input',event=>{
  const input=event.target,f=input.closest('form');if(!f?.querySelector('.shipping-fields')||!['address','receiverAddress'].includes(input.name))return;
  let box=f.querySelector('.shipping-address-result');if(!box){input.insertAdjacentHTML('afterend','<div class="shipping-address-result" role="status"></div>');box=f.querySelector('.shipping-address-result');}
  clearTimeout(f.addressTimer);const sequence=(f.addressSequence||0)+1;f.addressSequence=sequence;box.textContent='';const original=input.value.trim();if(original.length<8)return;
  f.addressTimer=setTimeout(async()=>{const accounts=host.state.shippingAccounts||[],a=accounts.find(a=>a.id===f.elements.vtpAccount?.value)||accounts.find(a=>a.active&&a.status==='connected'&&a.isDefault)||accounts.find(a=>a.active&&a.status==='connected');if(!a){box.textContent='Kết nối đơn vị vận chuyển để nhận diện địa chỉ.';return;}box.textContent='Viettel Post đang phân tích địa chỉ…';
   try{const result=await host.api('/shipping/quote',{method:'POST',body:{accountId:a.id,receiverAddress:original,weight:500,declaredValue:0,cod:0,includeAddress:true}});if(!f.isConnected||sequence!==f.addressSequence)return;const parsed=result.receiverAddress;if(!parsed?.ADDRESS){box.textContent='Hãng chưa nhận diện đủ địa chỉ. Bổ sung phường/xã, tỉnh/thành (và quận/huyện nếu dùng địa chỉ cũ).';return;}const suggestion=addressSuggestion(original,parsed);f.addressSuggestion=suggestion;box.innerHTML=`<small>Viettel Post nhận diện${parsed.addressType==='new'?' (địa chỉ mới)':parsed.addressType==='old'?' (địa chỉ cũ)':''}: ${escape(parsed.ADDRESS)}</small><button type="button" class="btn small full" data-shipping-address>${escape(suggestion)}</button>`;
   }catch(error){if(f.isConnected&&sequence===f.addressSequence)box.textContent=error.message;}
  },650);
 });
 document.addEventListener('click',event=>{const b=event.target.closest('[data-shipping-address]');if(!b)return;const f=b.closest('form'),input=f.elements.address||f.elements.receiverAddress;input.value=f.addressSuggestion;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
}
