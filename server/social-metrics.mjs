import {secret} from './store.mjs';
import {redditRequest} from './reddit-interactions.mjs';
export async function publicationMetrics(c,p,request){
 if(!p.externalId)throw Error('Bài chưa có ID trên nền tảng.');
 if(c.provider==='threads'){
  if(!/^\d+$/.test(p.externalId))throw Error('ID Threads không hợp lệ.');
  const r=await request(`https://graph.threads.net/v1.0/${p.externalId}/insights?metric=views,likes,replies,reposts,quotes,shares`,{headers:{Authorization:'Bearer '+secret(c.id).token}});
  if(!Array.isArray(r.data)||!r.data.length)throw Error('Threads chưa trả số liệu cho bài này.');
  return Object.fromEntries(r.data.filter(m=>['views','likes','replies','reposts','quotes','shares'].includes(m.name)&&Number.isFinite(m.values?.[0]?.value)).map(m=>[m.name,m.values[0].value]));
 }
 if(c.provider==='reddit'){
  if(!/^t3_[a-z0-9]+$/i.test(p.externalId))throw Error('ID Reddit không hợp lệ.');
  const r=await redditRequest(c,'api/info?'+new URLSearchParams({id:p.externalId}),request),d=r?.data?.children?.find(t=>t.data?.name===p.externalId)?.data;
  if(!d)throw Error('Reddit không trả bài này.');
  return Object.fromEntries(Object.entries({score:d.score,upvoteRatio:d.upvote_ratio,replies:d.num_comments,crossposts:d.num_crossposts}).filter(([,v])=>Number.isFinite(v)));
 }
 throw Error('Chưa hỗ trợ số liệu cho nền tảng này.');
}
export async function threadsRepost(c,id,request){
 if(!/^\d+$/.test(id))throw Error('ID Threads không hợp lệ.');
 const r=await request(`https://graph.threads.net/v1.0/${id}/repost`,{method:'POST',headers:{Authorization:'Bearer '+secret(c.id).token}});
 if(!r?.id)throw Object.assign(Error('Threads chưa xác nhận Repost. Kiểm tra trên nền tảng trước khi thử lại.'),{unknown:true});
 return {uri:String(r.id)};
}
