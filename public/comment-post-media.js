const safe=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
export function commentPostMedia(post={}){
 const items=[],add=(type,url,poster)=>{url=safe(url);if(url&&!items.some(x=>x.url===url))items.push({type,url,...(safe(poster)?{poster:safe(poster)}:{})});};
 const walk=a=>{const children=a.subattachments?.data||a.children?.data;if(children?.length){children.forEach(walk);return;}const video=/video|reel/i.test(a.media_type||a.type||'');const source=a.media?.source||a.source||a.media_url;const image=a.media?.image?.src||a.full_picture||a.thumbnail_url;const link=safe(a.url||a.permalink);
  if(video&&source)add('video',source,image);
  else if(video&&link&&(new URL(link).hostname==='facebook.com'||new URL(link).hostname.endsWith('.facebook.com')))add('embed','https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(link),image);
  else if(source)add('image',source);
  else if(image)add('image',image);
 };
 const attachments=post.attachments?.data||post.children?.data;
 if(attachments?.length)attachments.forEach(walk);else if(post.media_url||post.source)walk(post);
 if(!items.length&&post.full_picture)add('image',post.full_picture);
 if(!items.length){const url=safe(post.permalink||post.url);if(url){const u=new URL(url),id=u.hostname==='youtu.be'?u.pathname.slice(1):['www.youtube.com','youtube.com'].includes(u.hostname)?u.searchParams.get('v'):'';if(/^[\w-]{11}$/.test(id||''))add('embed','https://www.youtube-nocookie.com/embed/'+id);}}
 return items;
}
