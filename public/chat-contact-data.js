export const contactPhones=text=>[...new Set((String(text||'').match(/(?<!\d)(?:\+84|84|0)[\s.-]*[35789](?:[\s.-]*\d){8}(?!\d)/g)||[]).map(v=>v.replace(/\D/g,'').replace(/^84/,'0')))];
export function contactAddress(text){
 const lines=String(text||'').split(/\n/).map(s=>s.trim()).filter(Boolean),address=lines.find(s=>/(?:địa chỉ|dia chi|đc\s*[:：]|dc\s*[:：])/i.test(s))||lines.find(s=>/(?:đường|phường|quận|huyện|thôn|ấp|xã|tổ\s*\d|chung cư|tỉnh|thành phố|hà nội|hồ chí minh|tp\.?\s*hcm)/i.test(s)&&(/\d/.test(s)||/[,;]/.test(s)));
 if(!address)return '';return address.replace(/^(?:địa chỉ|dia chi|đc|dc)(?:\s+nhận\s+hàng)?\s*[:：-]?\s*/i,'').replace(/(?:sđt|sdt|điện thoại|phone)\s*[:：].*$/i,'').trim().slice(0,1000);
}
export function latestContact(messages,{senderId}={}){
 let phone='',address='';for(const m of [...messages].filter(m=>m.direction==='incoming'&&!m.deletedAt&&(!senderId||String(m.senderId)===String(senderId))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))){const phones=contactPhones(m.text);if(!phone&&phones.length===1)phone=phones[0];if(!address)address=contactAddress(m.text);if(phone&&address)break;}return {phone,address};
}
