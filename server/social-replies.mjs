import {blueskyPublicRead} from './bluesky-read.mjs';
import {extraToken} from './social-extra.mjs';
const auth=token=>({Authorization:`Bearer ${token}`});
const json=(body,token)=>({method:'POST',headers:{...auth(token),'Content-Type':'application/json'},body:JSON.stringify(body)});
export async function mastodonReaction(c,id,like,request){
 if(!/^\d+$/.test(String(id)))throw new Error('ID bình luận Mastodon không hợp lệ.');
 const token=await extraToken(c,request);
 const r=await request(`https://mastodon.social/api/v1/statuses/${id}/${like?'favourite':'unfavourite'}`,{method:'POST',headers:auth(token)});
 if(String(r?.id)!==String(id)||r.favourited!==like)throw Object.assign(new Error('Mastodon chưa xác nhận thay đổi Like. Kiểm tra bài gốc trước khi thử lại.'),{unknown:true});
 return {success:true,likeCount:r.favourites_count};
}
export async function replySocial(c,conv,text,options,request,refresh){
 if(options.assetRefs?.length)throw new Error('Trả lời bình luận kênh này hiện chỉ hỗ trợ văn bản.');
 if(!String(text||'').trim()||!conv.externalCommentId)throw new Error('Thiếu nội dung hoặc ID bình luận cần trả lời.');
 let r;
 if(c.provider==='youtube'){
  const token=await refresh(c),api='https://www.googleapis.com/youtube/v3';
  // YouTube accepts replies only under a top-level comment, including when staff selected a child reply.
  const target=await request(`${api}/comments?part=snippet&id=${encodeURIComponent(conv.externalCommentId)}`,{headers:auth(token)});
  const comment=target.items?.[0];if(!comment)throw new Error('Bình luận YouTube không còn tồn tại.');
  r=await request(`${api}/comments?part=snippet`,json({snippet:{parentId:comment.snippet?.parentId||comment.id,textOriginal:text}},token));
 }else if(c.provider==='x'){
  if(Array.from(text).length>280)throw new Error('X: nội dung trả lời vượt 280 ký tự.');
  r=await request('https://api.x.com/2/tweets',json({text,reply:{in_reply_to_tweet_id:conv.externalCommentId}},await refresh(c)));r=r.data;
 }else if(c.provider==='mastodon'){
  if(Array.from(text).length>500)throw new Error('Mastodon: nội dung vượt 500 ký tự.');
  const token=await extraToken(c,request),parent=await request(`https://mastodon.social/api/v1/statuses/${encodeURIComponent(conv.externalCommentId)}`);
  if(!['public','unlisted'].includes(parent.visibility))throw new Error('Chỉ trả lời bình luận công khai ở cổng Mastodon này.');
  const mention=parent.account?.acct?`@${parent.account.acct} `:'';
  if(Array.from(mention+text).length>500)throw new Error('Mastodon: nội dung kèm tên người nhận vượt 500 ký tự.');
  r=await request('https://mastodon.social/api/v1/statuses',json({status:mention+text,in_reply_to_id:parent.id,visibility:parent.visibility},token));
 }else{
  if([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].length>300)throw new Error('Bluesky: nội dung vượt 300 ký tự.');
  const token=await extraToken(c,request),parent=await blueskyPost(conv.externalCommentId,request);
  const root=parent.record?.reply?.root||{uri:parent.uri,cid:parent.cid};
  r=await request('https://bsky.social/xrpc/com.atproto.repo.createRecord',json({repo:c.accountId,collection:'app.bsky.feed.post',record:{$type:'app.bsky.feed.post',text,createdAt:new Date().toISOString(),reply:{root,parent:{uri:parent.uri,cid:parent.cid}}}},token));
  r={id:r.uri};
 }
 if(!r?.id)throw Object.assign(new Error('Nền tảng chưa xác nhận trả lời. Kiểm tra bài gốc trước khi thử lại.'),{unknown:true});
 return r;
}
export async function blueskyPost(uri,request){
 if(!/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/[^/]+$/.test(uri))throw new Error('ID bài Bluesky không hợp lệ.');
 const data=await blueskyPublicRead('app.bsky.feed.getPostThread',{uri,depth:'0',parentHeight:'0'},request);
 const post=data.thread?.post;if(!post?.cid||!post?.uri)throw new Error('Không đọc được bài Bluesky gốc.');return post;
}
export async function blueskyInteraction(c,uri,collection,request){
 if(!['app.bsky.feed.like','app.bsky.feed.repost'].includes(collection))throw new Error('Thao tác không hợp lệ.');
 const token=await extraToken(c,request),post=await blueskyPost(uri,request);
 const r=await request('https://bsky.social/xrpc/com.atproto.repo.createRecord',json({repo:c.accountId,collection,record:{$type:collection,subject:{uri:post.uri,cid:post.cid},createdAt:new Date().toISOString()}},token));
 if(!r.uri)throw Object.assign(new Error('Bluesky chưa xác nhận tương tác.'),{unknown:true});return r;
}
export async function removeBlueskyLike(c,uri,request){
 const parts=String(uri||'').match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.like\/([^/]+)$/);
 if(!parts||parts[1]!==c.accountId)throw new Error('Không có mã Like thuộc tài khoản này để gỡ. Hãy đồng bộ lại.');
 await request('https://bsky.social/xrpc/com.atproto.repo.deleteRecord',json({repo:c.accountId,collection:'app.bsky.feed.like',rkey:parts[2]},await extraToken(c,request)));return {success:true};
}
