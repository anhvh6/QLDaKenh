export function connectionProfileURL(c){
 try{const u=new URL(c.profileUrl);if(u.protocol==='https:')return u.href;}catch{}
 const id=String(c.accountId||'').trim(),account=String(c.expectedAccount||'').replace(/^@/,'').trim();
 const handle=account||id;
 if(c.provider==='facebook'&&/^\d+$/.test(id))return 'https://www.facebook.com/profile.php?id='+id;
 if(c.provider==='youtube'&&/^UC[\w-]+$/.test(id))return 'https://www.youtube.com/channel/'+encodeURIComponent(id);
 if(c.provider==='bluesky'&&handle)return 'https://bsky.app/profile/'+encodeURIComponent(handle);
 if(c.provider==='mastodon'&&handle){const [name,host='mastodon.social']=handle.split('@');if(/^[a-z0-9.-]+$/i.test(host))return 'https://'+host+'/@'+encodeURIComponent(name);}
 if(c.provider==='instagram'&&account)return 'https://www.instagram.com/'+encodeURIComponent(account)+'/';
 if(c.provider==='threads'&&account)return 'https://www.threads.com/@'+encodeURIComponent(account);
 if(c.provider==='x'&&account)return 'https://x.com/'+encodeURIComponent(account);
 if(c.provider==='tumblr'&&handle)return 'https://www.tumblr.com/'+encodeURIComponent(handle);
 if(c.provider==='reddit'&&account)return 'https://www.reddit.com/user/'+encodeURIComponent(account.replace(/^u\//,''))+'/';
 return ({facebook:'https://www.facebook.com/',instagram:'https://www.instagram.com/',threads:'https://www.threads.com/',youtube:'https://www.youtube.com/',x:'https://x.com/',blogger:'https://www.blogger.com/',devto:'https://dev.to/',tiktok:'https://www.tiktok.com/',zalo_personal:'https://chat.zalo.me/',zalo:'https://oa.zalo.me/',google_drive:'https://drive.google.com/',meta_business:'https://business.facebook.com/',google_business:'https://business.google.com/'})[c.provider]||'';
}
