// Stable source post identity, independent of tracking query strings and local copy IDs.
export function sourceVideoKey(post){
 if(!post)return '';if(post.sourceVideoKey)return post.sourceVideoKey;
 let provider=post.provider||'',id=String(post.externalId||'');let u;
 try{u=new URL(post.url||post.sourceURL);const host=u.hostname.toLowerCase();if(!provider)provider=/facebook\.com$|fb\.watch$/.test(host)?'facebook':/tiktok\.com$/.test(host)?'tiktok':/instagram\.com$/.test(host)?'instagram':/youtube\.com$|youtu\.be$/.test(host)?'youtube':/threads\.(net|com)$/.test(host)?'threads':/(^|\.)(x|twitter)\.com$/.test(host)?'x':/reddit\.com$|redd\.it$/.test(host)?'reddit':/pinterest\.com$|pin\.it$/.test(host)?'pinterest':'';
 const path=u.pathname;
 id=(provider==='tiktok'?path.match(/\/(?:video|photo)\/(\d+)/)?.[1]:provider==='facebook'?path.match(/\/(?:reel|reels|videos|posts)\/(\w+)/)?.[1]||u.searchParams.get('v')||u.searchParams.get('story_fbid')||u.searchParams.get('fbid'):provider==='youtube'?(u.hostname==='youtu.be'?path.split('/')[1]:u.searchParams.get('v')||path.match(/\/(?:shorts|embed|live)\/([^/]+)/)?.[1]):['instagram','threads'].includes(provider)?path.match(/\/(?:p|reel|reels|post)\/([^/]+)/)?.[1]:provider==='x'?path.match(/\/status\/(\d+)/)?.[1]:provider==='reddit'?path.match(/\/comments\/([^/]+)/)?.[1]||(u.hostname==='redd.it'?path.split('/')[1]:''):provider==='pinterest'?path.match(/\/pin\/(\d+)/)?.[1]:'')||id;
 }catch{}
 if(provider&&id&&/^[\w-]{1,120}$/.test(id))return provider+':'+id;
 // Unresolved share links remain comparable until extraction provides a platform ID.
 if(provider&&u)return provider+':url:'+u.hostname.replace(/^www\.|^m\./,'')+u.pathname.replace(/\/$/,'');
 return '';
}
