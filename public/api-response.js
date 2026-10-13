export async function requestJSON(url,options={},fetcher=fetch,timeoutMs=options.method&&options.method!=='GET'?120000:30000){
 const timeout=AbortSignal.timeout(timeoutMs),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
 let response;
 try{response=await fetcher(url,{...options,signal});const data=await response.json().catch(()=>null);if(!response.ok){const message=typeof data?.error==='string'&&data.error?data.error:[502,503,504].includes(response.status)?'Máy chủ đang quá tải hoặc tạm gián đoạn. Vui lòng thử lại.':'Không thể thực hiện yêu cầu ('+response.status+').';const error=new Error(message);error.status=response.status;throw error;}if(data===null)throw new Error('Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.');return data;}
 catch(error){if(timeout.aborted)throw new Error('Tải dữ liệu quá lâu. Kiểm tra kết nối và thử lại.');if(error instanceof TypeError)throw new Error('Không kết nối được với máy chủ. Vui lòng thử lại.');throw error;}
}
