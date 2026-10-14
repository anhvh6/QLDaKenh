// Canonical platform video identity also covers copies created before automatic plans existed.
export function sourceVideoKey(post){
 if(!post)return '';
 if(post.sourceVideoKey)return post.sourceVideoKey;
 let id=String(post.externalId||'');
 if(!id)try{const u=new URL(post.url||post.sourceURL),p=u.pathname;id=post.provider==='tiktok'?p.match(/\/video\/(\d+)/)?.[1]||'':post.provider==='facebook'?p.match(/\/(?:reel|reels|videos)\/(\d+)/)?.[1]||u.searchParams.get('v')||'':'';}catch{}
 return ['facebook','tiktok'].includes(post.provider)&&/^\d{5,25}$/.test(id)?post.provider+':'+id:'';
}
