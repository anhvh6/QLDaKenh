// Public contract: https://partner2.viettelpost.vn/document/create-by-detail-address
const hosts={production:'https://partner.viettelpost.vn',sandbox:'https://partnerdev.viettelpost.vn'};
export async function vtpRequest(environment,path,{token,body,method='POST',fetcher=fetch,fullResponse=false,query={}}={}){
 if(!hosts[environment]||!/^\/v2\/(user|order|categories)\/[a-zA-Z0-9/-]+$/.test(path))throw Error('Địa chỉ API Viettel Post không hợp lệ.');
 const url=new URL(hosts[environment]+path);for(const [key,value] of Object.entries(query)){if(path!=='/v2/order/detail-v2'||key!=='o'||!/^[-A-Za-z0-9]{1,100}$/.test(String(value)))throw Error('Tham số API Viettel Post không hợp lệ.');url.searchParams.set(key,String(value));}
 let response;try{response=await fetcher(url.href,{method,headers:{'Content-Type':'application/json',...(token?{Token:token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000),redirect:'error'});}catch{throw Object.assign(Error('Không nhận được kết quả Viettel Post. Kiểm tra tại hãng trước khi gửi lại.'),{unknown:true});}
 let result;try{result=await response.json();}catch{throw Object.assign(Error('Viettel Post trả kết quả không đọc được.'),{unknown:true});}
 // getPriceAllNlp's documented success response has RESULT, without a status envelope.
 if(path==='/v2/order/getPriceAllNlp'&&response.ok&&result?.error!==true&&(result.status===undefined||Number(result.status)===200)){
  const rows=Array.isArray(result?.RESULT)?result.RESULT:Array.isArray(result?.data?.RESULT)?result.data.RESULT:Array.isArray(result?.data)&&Number(result.status)===200?result.data:null;
  if(rows&&rows.every(r=>r&&typeof r.MA_DV_CHINH==='string'&&Number.isFinite(Number(r.GIA_CUOC))&&Number(r.GIA_CUOC)>=0))return rows;
 }
 if(!result||typeof result!=='object'||!Number.isFinite(Number(result.status))||Number(result.status)<100)throw Object.assign(Error('Viettel Post trả kết quả thiếu trạng thái. Kiểm tra tại hãng trước khi gửi lại.'),{unknown:true});
 if(!response.ok||result.error===true||Number(result.status)!==200){let safe=String(result.message||'Viettel Post từ chối yêu cầu.');for(const value of [token,body?.PASSWORD,body?.token])if(value)safe=safe.split(String(value)).join('[ẩn]');safe=safe.replace(/eyJ[a-zA-Z0-9_.-]+/g,'[ẩn token]').slice(0,350);if(/account ha(?:ve|s) logged in (?:on )?another machine/i.test(safe))safe='Viettel Post từ chối phiên xác thực. Kiểm tra cách kết nối: token tạo trên viettelpost.vn cần đổi qua LoginVTP; token Partner cần kết nối shop. Hãng trả: '+safe;throw Object.assign(Error(safe),{status:response.status===401||Number(result.status)===401?401:400,unknown:response.status>=500||Number(result.status)>=500||path==='/v2/order/createOrderNlp'&&/^system error$/i.test(safe.trim())});}
 return fullResponse?result:result.data;
}
export function providerDate(value){if(typeof value!=='string')return null;if(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(value)){const [d,m,y,h,mi,s]=value.match(/\d+/g);value=`${y}-${m}-${d}T${h}:${mi}:${s}+07:00`;}const ms=Date.parse(value);return Number.isFinite(ms)?new Date(ms).toISOString():null;}
export function mappedStatus(code){code=Number(code);if([101,201].includes(code))return 'cancelled';if([102,103,104].includes(code))return 'pickup_pending';if([105,200,300,400,500,508,509,550].includes(code))return 'in_transit';if(code===501)return 'delivered';if([502,503,515].includes(code))return 'returning';if(code===504)return 'returned';if([505,506,507].includes(code))return 'delivery_failed';return null;}
