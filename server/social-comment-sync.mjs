const text=value=>String(value||'').replace(/<br\s*\/?\s*>|<\/p>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
const bskyUrl=post=>`https://bsky.app/profile/${encodeURIComponent(post.author?.handle||post.author?.did)}/post/${encodeURIComponent(post.uri.split('/').pop())}`;
export async function syncSocialComments(channel,state,request,upsert){
 if(channel.provider==='tumblr'){
  const {extraToken}=await import('./social-extra.mjs'),token=await extraToken(channel,request),headers={Authorization:'Bearer '+token};
  const data=await request(`https://api.tumblr.com/v2/blog/${encodeURIComponent(channel.accountId)}/notifications?rollups=false&types%5B%5D=reply`,{headers});
  if(!Array.isArray(data.response?.notifications))throw Error('Tumblr chưa trả danh sách bình luận.');
  for(const n of data.response.notifications){
   if(n.type!=='reply'||!n.id||!n.target_post_id||!n.from_tumblelog_name)continue;
   const timestamp=new Date(n.timestamp*1000).toISOString(),url=`https://www.tumblr.com/${encodeURIComponent(channel.accountId)}/${encodeURIComponent(n.target_post_id)}`;
   upsert(channel,{id:String(n.id),text:n.reply_text||'',timestamp,from:{id:n.from_tumblelog_name,name:n.from_tumblelog_name,profileUrl:`https://www.tumblr.com/${encodeURIComponent(n.from_tumblelog_name)}`},parent:{id:String(n.target_post_id)},permalink:url},{id:String(n.target_post_id),text:'Bài viết Tumblr',permalink:url},Date.parse(timestamp)>=Date.parse(state.startedAt||new Date().toISOString()));
  }
  return;
 }
 const live=timestamp=>state.completedAt?Date.parse(timestamp)>=Date.now()-3600000:Date.parse(timestamp)>=Date.parse(state.startedAt||'');
 if(channel.provider==='mastodon'){
  const posts=await request(`https://mastodon.social/api/v1/accounts/${encodeURIComponent(channel.accountId)}/statuses?limit=20&exclude_replies=true&exclude_reblogs=true`);
  if(!Array.isArray(posts))throw new Error('Mastodon chưa trả danh sách bài công khai.');
  for(const post of posts){
   if(!['public','unlisted'].includes(post.visibility))continue;
   const context=await request(`https://mastodon.social/api/v1/statuses/${encodeURIComponent(post.id)}/context`);
   if(!Array.isArray(context.descendants))throw new Error('Mastodon chưa trả dữ liệu trả lời.');
   const source={id:post.id,text:text(post.content),timestamp:post.created_at,permalink:post.url,attachments:post.media_attachments};
   for(const item of context.descendants){if(!['public','unlisted'].includes(item.visibility))continue;upsert(channel,{id:item.id,text:text(item.content),timestamp:item.created_at,from:{id:item.account?.id,name:item.account?.display_name||item.account?.acct,profileUrl:item.account?.url,picture:{data:{url:item.account?.avatar}}},parent:{id:item.in_reply_to_id},like_count:item.favourites_count,permalink:item.url},source,live(item.created_at));}
  }
  return;
 }
 const feed=await request('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?'+new URLSearchParams({actor:channel.accountId,limit:'20',filter:'posts_no_replies'}));
 if(!Array.isArray(feed.feed))throw new Error('Bluesky chưa trả danh sách bài công khai.');
 for(const row of feed.feed){
  const post=row.post;if(!post?.uri||post.author?.did!==channel.accountId)continue;
  const result=await request('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?'+new URLSearchParams({uri:post.uri,depth:'6',parentHeight:'0'}));
  if(!result.thread?.post)throw new Error('Bluesky chưa trả luồng bình luận.');
  const source={id:post.uri,text:post.record?.text,timestamp:post.record?.createdAt,permalink:bskyUrl(post)};
  const walk=(node,parent,depth)=>{if(depth>6)return;for(const child of node.replies||[]){const item=child.post;if(!item?.uri)continue;const timestamp=item.record?.createdAt||item.indexedAt;upsert(channel,{id:item.uri,text:item.record?.text||'',timestamp,from:{id:item.author?.did,name:item.author?.displayName||item.author?.handle,profileUrl:`https://bsky.app/profile/${encodeURIComponent(item.author?.handle||item.author?.did)}`,picture:{data:{url:item.author?.avatar}}},parent:{id:parent},like_count:item.likeCount,permalink:bskyUrl(item)},source,live(timestamp));walk(child,item.uri,depth+1);}};
  walk(result.thread,post.uri,0);
 }
}
