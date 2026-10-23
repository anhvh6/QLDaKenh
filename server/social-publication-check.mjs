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
 const token=await extraToken(c,request),r=await request(`https://api.tumblr.com/v2/blog/${encodeURIComponent(c.accountId)}/posts/${encodeURIComponent(p.externalId)}`,{headers:{Authorization:'Bearer '+token}}),post=r.response?.post||r.response;
 if(!post||post.state!=='published')return null;
 if(p.type==='video'&&!post.content?.some(x=>x.type==='video'&&(x.media?.url||x.url)))return null;
 return {processing:false,url:post.post_url||p.url,mediaVerifiedAt:new Date().toISOString()};
}
