// Pancake POS OpenAPI: https://docs.pancake.biz/pos/api/openapi.json
export async function pancakeRequest(apiKey,path,{method='GET',query={},body,fetcher=fetch}={}){
 const geo=/^\/geo\/(provinces|districts|communes)$/.test(path);
 if(geo&&(method!=='GET'||Object.entries(query).some(([k,v])=>!['country_code','is_new','province_id','district_id'].includes(k)||!/^[-_A-Za-z0-9]{1,40}$/.test(String(v)))))throw Error('Tham số danh mục địa chỉ POS không hợp lệ.');
 if((!geo&&!/^\/shops(?:\/[A-Za-z0-9_%.-]+){0,5}$/.test(path))||path.split('/').some(segment=>['.','..'].includes(decodeURIComponent(segment))))throw Error('Đường dẫn Pancake POS không hợp lệ.');
 const url=new URL('https://pos.pages.fm/api/v1'+path);url.searchParams.set('api_key',apiKey);
 for(const [key,value] of Object.entries(query))if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
 let response,data;
 try{response=await fetcher(url,{method,headers:{'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});data=await response.json();}
 catch{throw Object.assign(Error('Chưa nhận được kết quả từ Pancake POS. Đang chờ đối soát trước khi gửi lại.'),{unknown:method!=='GET',retryable:true});}
 if(!response.ok||data?.success===false){const code=data?.message_code??data?.error_code;const message=(String(data?.message||data?.error?.message||(typeof data?.error==='string'?data.error:'')||'Pancake POS từ chối yêu cầu.')+(code!==undefined?' (mã '+String(code)+')':'')).split(apiKey||'\0').join('[ẩn API key]').replace(/api_key=[^&\s]+/gi,'api_key=[ẩn]').slice(0,400);throw Object.assign(Error(message),{status:response.status===401||response.status===403?401:422,unknown:method!=='GET'&&response.status>=500,retryable:response.status===429||response.status>=500,diagnostics:{httpStatus:response.status,code,endpoint:path}});}
 if(!data||typeof data!=='object')throw Object.assign(Error('Kết quả Pancake POS không hợp lệ.'),{unknown:method!=='GET'});
 return data;
}
// POS can acknowledge creation before its search index exposes the new record.
// Only repeat the read; never repeat a create because its read-back is delayed.
export async function pancakeReadBack(find,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(const delay of [0,750,1500,3000]){if(delay)await wait(delay);try{const row=await find();if(row)return row;}catch(error){if(!error.retryable||delay===3000)throw error;}}
 return null;
}
export async function pancakePages(request,path,query={},consume=()=>{}){
 let page=1,total=0;
 while(page<=10000){const response=await request(path,{query:{...query,page_size:100,page_number:page}}),rows=response.data;
  if(!Array.isArray(rows))throw Error('Pancake POS chưa trả danh sách hợp lệ; chưa hoàn tất đồng bộ.');
  await consume(rows);total+=rows.length;
  if(response.total_pages!==null&&response.total_pages!==undefined){if(page>=Number(response.total_pages))return total;if(!rows.length)throw Error('Pancake POS trả trang rỗng trước khi hết dữ liệu.');}
  else if(response.total_entries!==null&&response.total_entries!==undefined){if(total>=Number(response.total_entries))return total;if(!rows.length)throw Error('Pancake POS trả thiếu dữ liệu phân trang.');}
  else if(rows.length<Number(response.page_size||100))return total;
  page++;
 }
 throw Error('Quá giới hạn một đợt đồng bộ; cần kiểm tra phân trang.');
}
