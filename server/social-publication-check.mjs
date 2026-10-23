import {extraToken} from './social-extra.mjs';
export async function verifySocialPublication(c,p,request,fetchMedia=fetch){
 if(c.provider==='bluesky'){
  const r=await request('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?'+new URLSearchParams({uris:p.externalId})),post=r.posts?.find(x=>x.uri===p.externalId);
  if(!post?.embed?.playlist)return null;
  const url=new URL(post.embed.playlist);if(url.protocol!=='https:'||url.hostname!=='video.bsky.app')throw Error('Bluesky trả địa chỉ video không hợp lệ.');
  const media=await fetchMedia(url,{signal:AbortSignal.timeout(20000)});if(!media.ok)return null;
  if(!(await media.text()).startsWith('#EXTM3U'))return null;
  return {processing:false,mediaVerifiedAt:new Date().toISOString()};
 }
 const token=await extraToken(c,request),root=`https://api.tumblr.com/v2/blog/${encodeURIComponent(c.accountId)}`,headers={Authorization:'Bearer '+token};let post;
 try{const r=await request(root+'/posts/'+encodeURIComponent(p.externalId),{headers});post=r.response?.post||r.response;}catch(e){
  if(e.providerStatus!==404)throw e;
  // Tumblr can replace a video post ID after transcoding. Reconcile only an exact,
  // unique caption, video and dispatch-time match; never publish a second copy.
  const r=await request(root+'/posts?limit=20&npf=true',{headers}),matches=(r.response?.posts||[]).filter(x=>x.content?.some(b=>b.type==='text'&&b.text===p.caption)&&x.content.some(b=>b.type==='video')&&Math.abs(x.timestamp*1000-Date.parse(p.dispatchedAt||p.processingStartedAt))<600000);
  if(matches.length!==1)return null;post=matches[0];
 }
 if(!post||post.state!=='published')return null;
 if(p.type==='video'&&!post.content?.some(x=>x.type==='video'&&(x.media?.url||x.url)))return null;
 return {processing:false,externalId:post.id_string||String(post.id||p.externalId),url:post.post_url||p.url,mediaVerifiedAt:new Date().toISOString()};
}
