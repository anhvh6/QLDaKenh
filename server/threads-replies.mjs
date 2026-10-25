import {setTimeout as sleep} from 'node:timers/promises';

export async function sendThreadsReply(channel,conv,text,assets,token,request,mediaUrl,wait=sleep){
 if(!conv.externalCommentId)throw Error('Thiếu ID bình luận gốc.');
 if(Array.from(text||'').length>500)throw Error('Threads giới hạn 500 ký tự.');
 if(!text?.trim()&&!assets.length)throw Error('Nhập nội dung hoặc chọn ảnh.');
 if(assets.length>10||assets.some(a=>a.type!=='image'))throw Error('Trả lời Threads hỗ trợ tối đa 10 ảnh mỗi lần gửi.');
 const urls=assets.map(mediaUrl),base='https://graph.threads.net/v1.0',root=base+'/'+encodeURIComponent(channel.accountId);
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const post=async(path,body)=>request(root+path,{method:'POST',headers,body:JSON.stringify(body)});
 const create=async body=>{const r=await post('/threads',body);if(!r.id)throw Error('Threads chưa trả mã chuẩn bị nội dung. Chưa đăng trả lời.');return r.id;};
 // Only reads are polled. Never repeat a publish call after an ambiguous response.
 const deadline=Date.now()+25000;
 const ready=async id=>{for(let i=0;i<6&&Date.now()<deadline;i++){
  const r=await request(base+'/'+encodeURIComponent(id)+'?fields=status,error_message',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});
  if(r.status==='FINISHED')return;
  if(['ERROR','EXPIRED'].includes(r.status))throw Error('Threads không chuẩn bị được ảnh: '+(r.error_message||r.status));
  if(r.status==='PUBLISHED')throw Object.assign(Error('Threads báo nội dung đã đăng. Kiểm tra bài gốc trước khi thử lại.'),{unknown:true});
  if(r.status!=='IN_PROGRESS')throw Error('Threads chưa xác nhận trạng thái ảnh. Chưa đăng trả lời.');
  if(i<5)await wait(1000);
 }throw Error('Threads vẫn đang chuẩn bị ảnh. Chưa đăng trả lời; có thể thử lại sau.');};
 const body={media_type:urls.length?'IMAGE':'TEXT',...(text?{text}:{}),reply_to_id:conv.externalCommentId};
 if(urls.length>1){const children=[];for(const image_url of urls){const id=await create({media_type:'IMAGE',image_url,is_carousel_item:true});await ready(id);children.push(id);}Object.assign(body,{media_type:'CAROUSEL',children:children.join(',')});}
 else if(urls.length)body.image_url=urls[0];
 const containerId=await create(body);if(urls.length)await ready(containerId);
 const r=await post('/threads_publish',{creation_id:containerId});
 if(!r.id)throw Object.assign(Error('Threads chưa xác nhận đăng trả lời. Kiểm tra bài gốc trước khi thử lại.'),{unknown:true});
 return r;
}
