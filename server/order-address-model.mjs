export const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const bare=v=>normalized(v).replace(/^(thanh pho|tinh|quan|huyen|thi xa|phuong|xa|thi tran|tp|q|p)\s+/,'');
export function uniqueArea(address,rows){const text=' '+normalized(address)+' ';const explicit=rows.filter(r=>text.includes(' '+normalized(r.name)+' '));if(explicit.length)return explicit.length===1?explicit[0]:null;const candidates=rows.filter(r=>{const n=bare(r.name);return n&&!/^\d+$/.test(n)&&text.includes(' '+n+' ');});return candidates.length===1?candidates[0]:null;}
export function locationFromSelection(input,provinces,districts,wards){
 const p=provinces.find(r=>r.id===String(input.provinceId)),d=input.format==='old'?districts.find(r=>r.id===String(input.districtId)):null,w=wards.find(r=>r.id===String(input.wardId));
 if(!p||input.format==='old'&&!d||!w||w.provinceId&&w.provinceId!==p.id||d?.provinceId&&d.provinceId!==p.id||d&&w.districtId&&w.districtId!==d.id)throw Object.assign(Error('Khu vực không khớp danh mục. Chọn lại tỉnh/thành, quận/huyện và phường/xã.'),{status:400});
 const street=String(input.street||'').trim();if(street.length<3||street.length>350)throw Object.assign(Error('Nhập số nhà, ngõ/đường hoặc địa chỉ chi tiết (3–350 ký tự).'),{status:400});
 const area=[w.name,d?.name,p.name].filter(Boolean).join(', '),fullAddress=street+', '+area;if(fullAddress.length>500)throw Object.assign(Error('Địa chỉ quá dài (tối đa 500 ký tự).'),{status:400});
 return {target:input.target||'',provider:input.target?.startsWith('vtp:')?'vtp':'pos',format:input.format,street,provinceId:p.id,provinceName:p.name,districtId:d?.id||'',districtName:d?.name||'',wardId:w.id,wardName:w.name,area,fullAddress};
}
// Strip only a trailing, explicit administrative suffix. Never remove a street
// just because its name happens to equal a district or ward.
export function streetFromAddress(address,areas){let street=String(address).trim();for(const area of areas){const segments=street.split(',');if(segments.length>1&&bare(segments.at(-1))===bare(area))street=segments.slice(0,-1).join(',').trim();}return street;}
