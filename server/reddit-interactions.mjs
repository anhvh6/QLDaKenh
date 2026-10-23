import {extraToken,extraProfile} from './social-extra.mjs';

export async function redditRequest(c,path,request,body){
 const token=await extraToken(c,request);
 const result=await request('https://oauth.reddit.com/'+path,{headers:{Authorization:'Bearer '+token,'User-Agent':'web:QLDaKenh:v2.1 (by /u/faceyoga_megaphuong)',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{method:'POST',body:new URLSearchParams({api_type:'json',...body})}:{})});
 if(result?.json?.errors?.length)throw Error(result.json.errors.map(e=>e[1]||e[0]).join(' · '));
 return result;
}
const fullname=id=>{if(!/^t[13]_[a-z0-9]+$/i.test(String(id)))throw Error('ID bài/bình luận Reddit không hợp lệ.');return id;};
export async function redditReply(c,id,text,request){
 if(!String(text||'').trim())throw Error('Thiếu nội dung trả lời.');
 const result=await redditRequest(c,'api/comment',request,{thing_id:fullname(id),text});
 const comment=result?.json?.data?.things?.find(t=>t.kind==='t1')?.data;
 if(!comment?.name)throw Object.assign(Error('Reddit chưa xác nhận trả lời. Kiểm tra bài gốc trước khi thử lại.'),{unknown:true});
 return {id:comment.name};
}
export async function redditVote(c,id,like,request){
 await redditRequest(c,'api/vote',request,{id:fullname(id),dir:like?'1':'0'});
 const result=await redditRequest(c,'api/info?'+new URLSearchParams({id}),request);
 const item=result?.data?.children?.find(t=>t.data?.name===id)?.data;
 if(!item||(like?item.likes!==true:item.likes!==null))throw Object.assign(Error('Reddit chưa xác nhận thay đổi Upvote. Hãy đồng bộ lại.'),{unknown:true});
 return {success:true,score:item.score};
}
export async function syncRedditComments(c,state,request,upsert){
 const profile=await extraProfile(c,request);
 const posts=await redditRequest(c,'user/'+encodeURIComponent(profile.handle)+'/submitted?limit=20&sort=new',request);
 if(!Array.isArray(posts?.data?.children))throw Error('Reddit chưa trả danh sách bài.');
 for(const row of posts.data.children){
  const p=row.data;if(row.kind!=='t3'||!p?.id)continue;
  const tree=await redditRequest(c,'comments/'+encodeURIComponent(p.id)+'?limit=100&depth=6&sort=new&raw_json=1',request);
  if(!Array.isArray(tree?.[1]?.data?.children))throw Error('Reddit chưa trả luồng bình luận.');
  const source={id:p.name,text:p.title,timestamp:new Date(p.created_utc*1000).toISOString(),permalink:'https://www.reddit.com'+p.permalink};
  const walk=(nodes,depth=0)=>{if(depth>6)return;for(const node of nodes){
   const d=node.data;if(node.kind!=='t1'||!d?.name)continue;
   // Deleted/removed content must never be retained as customer text.
   if(['[deleted]','[removed]'].includes(d.body)||d.author==='[deleted]')upsert(c,{id:d.name,remote_deleted:true},source,false);
   else{
    const timestamp=new Date(d.created_utc*1000).toISOString();
    upsert(c,{id:d.name,text:d.body,timestamp,is_reply_owned_by_me:d.author===profile.handle,from:{id:d.author===profile.handle?c.accountId:d.author_fullname||d.author,name:d.author,profileUrl:'https://www.reddit.com/user/'+encodeURIComponent(d.author)},parent:{id:d.parent_id},score:d.score,user_likes:d.likes===true,permalink:'https://www.reddit.com'+d.permalink},source,Date.parse(timestamp)>=(state.completedAt?Date.now()-3600000:Date.parse(state.startedAt||'')));
   }
   if(d.replies?.data?.children)walk(d.replies.data.children,depth+1);
  }};walk(tree[1].data.children);
 }
}
