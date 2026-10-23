import {uploadSocialMedia} from './social-media-upload.mjs';
import {secret,saveSecret} from './store.mjs';

export const extraProviders={
 reddit:{label:'Reddit',publish:true,oauth:true,formats:['text'],hint:'OAuth Reddit với quyền identity, submit. Cần ứng dụng API được Reddit cho phép; mặc định đăng lên hồ sơ của bạn.'},
 mastodon:{label:'Mastodon',publish:true,oauth:true,formats:['text','image','video'],hint:'Kết nối mastodon.social bằng OAuth, đọc hồ sơ và đăng trạng thái văn bản.'},
 tumblr:{label:'Tumblr',publish:true,oauth:true,formats:['text','image','video'],hint:'OAuth Tumblr để xác minh blog và đăng nội dung văn bản.'},
 bluesky:{label:'Bluesky',publish:true,formats:['text','image','video'],hint:'Nhập handle và mật khẩu ứng dụng Bluesky tại đây; không dùng mật khẩu đăng nhập chính.'},
 meta_business:{label:'Meta Business Suite',publish:false,formats:[],hint:'Quản trị doanh nghiệp. Xuất bản qua Facebook Page và Instagram đã cấp quyền.'},
 google_business:{label:'Google Doanh nghiệp',publish:false,formats:[],hint:'Hồ sơ chưa xác minh cần hoàn tất xác minh với Google trước khi tích hợp API.'}
};
export const isExtra=provider=>['reddit','mastodon','tumblr','bluesky'].includes(provider);
const agent='QLDaKenh/2.1 (social account integration)';
const bearer=token=>({Authorization:`Bearer ${token}`,'User-Agent':agent});
const post=(body,token)=>({method:'POST',headers:{...bearer(token),'Content-Type':'application/json'},body:JSON.stringify(body)});
export function assertIdentity(connection,profile){
 const expected=String(connection.expectedAccount||'').toLowerCase().replace(/^@/,'');
 if(expected&&![profile.accountId,profile.handle].some(value=>String(value||'').toLowerCase().replace(/^@/,'')===expected))throw new Error(`Bạn đã đăng nhập sai tài khoản. Kênh này cần ${connection.expectedAccount}.`);
 return profile;
}
export async function extraToken(c,remote){
 const s=secret(c.id);
 if(c.provider==='bluesky'&&!s.refreshToken){
  const handle=String(c.expectedAccount||c.accountId||'').trim();
  if(!handle)throw new Error('Nhập handle Bluesky trước khi kiểm tra.');
  const r=await remote('https://bsky.social/xrpc/com.atproto.server.createSession',post({identifier:handle,password:s.token}));
  assertIdentity(c,{accountId:r.did,handle:r.handle});
  if(!r.accessJwt||!r.refreshJwt)throw new Error('Bluesky chưa trả phiên đăng nhập.');
  saveSecret(c.id,{token:r.accessJwt,refreshToken:r.refreshJwt,expiresAt:Date.now()+90*60*1000});return r.accessJwt;
 }
 if(!s.token)throw new Error('Chưa cấp quyền hoặc chưa nhập token của kênh.');
 if(!s.refreshToken||!s.expiresAt||s.expiresAt>Date.now()+60000)return s.token;
 let r;
 if(c.provider==='bluesky')r=await remote('https://bsky.social/xrpc/com.atproto.server.refreshSession',{method:'POST',headers:bearer(s.refreshToken)});
 else if(c.provider==='reddit')r=await remote('https://www.reddit.com/api/v1/access_token',{method:'POST',headers:{'User-Agent':agent,Authorization:`Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID||''}:${process.env.REDDIT_CLIENT_SECRET||''}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:s.refreshToken})});
 else if(c.provider==='tumblr')r=await remote('https://api.tumblr.com/v2/oauth2/token',{method:'POST',headers:{'User-Agent':agent,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:s.refreshToken,client_id:process.env.TUMBLR_CLIENT_ID||'',client_secret:process.env.TUMBLR_CLIENT_SECRET||''})});
 else return s.token;
 const token=r.access_token||r.accessJwt;if(!token)throw new Error('Nền tảng không trả access token mới. Hãy kết nối lại.');
 saveSecret(c.id,{...s,token,refreshToken:r.refresh_token||r.refreshJwt||s.refreshToken,expiresAt:Date.now()+Number(r.expires_in||5400)*1000});return token;
}
export async function extraProfile(c,remote,token){
 token||=await extraToken(c,remote);let profile;
 if(c.provider==='mastodon'){
  const r=await remote('https://mastodon.social/api/v1/accounts/verify_credentials',{headers:bearer(token)});
  profile={accountId:String(r.id),handle:`${r.username}@mastodon.social`,name:r.display_name||r.username,avatar:r.avatar};
 }else if(c.provider==='reddit'){
  const r=await remote('https://oauth.reddit.com/api/v1/me',{headers:bearer(token)});profile={accountId:String(r.id),handle:r.name,name:r.name};
 }else if(c.provider==='tumblr'){
  const r=await remote('https://api.tumblr.com/v2/user/info',{headers:bearer(token)}),blogs=r.response?.user?.blogs||[];
  const wanted=String(c.expectedAccount||c.accountId||'').replace(/\.tumblr\.com$/,'');
  const blog=wanted?blogs.find(b=>[b.name,b.uuid].includes(wanted)):blogs.find(b=>b.primary)||blogs[0];
  if(!blog)throw new Error('Tài khoản Tumblr không quản lý blog đã chọn.');
  profile={accountId:blog.name,handle:blog.name,name:blog.title||blog.name};
 }else{
  const r=await remote('https://bsky.social/xrpc/com.atproto.server.getSession',{headers:bearer(token)});profile={accountId:r.did,handle:r.handle,name:r.handle};
 }
 if(!profile.accountId||!profile.handle)throw new Error('Nền tảng chưa trả hồ sơ hợp lệ.');
 return assertIdentity(c,profile);
}
export async function publishExtra(c,p,remote){
 if(c.provider==='bluesky'&&p.visibility==='private')throw new Error('Bluesky không hỗ trợ bài riêng tư. Chọn công khai trước khi đăng.');
 if(!['text','image','video'].includes(p.type)||c.provider==='reddit'&&p.type!=='text')throw new Error('Định dạng không được hỗ trợ.');
 const token=await extraToken(c,remote),text=String(p.caption||p.title||'');let r;
 const media=p.type==='text'?null:await uploadSocialMedia(c,p,token,remote);
 if(c.provider==='mastodon'){
  if(Array.from(text).length>500)throw new Error('Mastodon: nội dung vượt 500 ký tự.');
  r=await remote('https://mastodon.social/api/v1/statuses',{...post({status:text,...(media?{media_ids:media}:{}),visibility:p.visibility==='private'?'private':'public'},token),headers:{...post({},token).headers,...(p.id?{'Idempotency-Key':String(p.id)}:{})}});
  if(!r.id)throw new Error('Mastodon chưa trả mã bài viết.');return {externalId:String(r.id),url:r.url};
 }
 if(c.provider==='bluesky'){
  if([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].length>300)throw new Error('Bluesky: nội dung vượt 300 ký tự.');
  const profile=await extraProfile(c,remote,token);
  r=await remote('https://bsky.social/xrpc/com.atproto.repo.createRecord',post({repo:profile.accountId,collection:'app.bsky.feed.post',record:{$type:'app.bsky.feed.post',text,...(media?{embed:media}:{}),createdAt:new Date().toISOString()}},token));
  if(!r.uri)throw new Error('Bluesky chưa trả mã bài viết.');return {externalId:r.uri,...(p.type==='video'?{processing:true,socialVerification:true,containerId:r.uri}:{}),url:`https://bsky.app/profile/${profile.handle}/post/${r.uri.split('/').pop()}`};
 }
 if(c.provider==='tumblr'){
  r=await remote(`https://api.tumblr.com/v2/blog/${encodeURIComponent(c.accountId)}/posts`,media?{method:'POST',headers:bearer(token),body:media,signal:AbortSignal.timeout(600000)}:post({content:[{type:'text',text}],state:p.visibility==='private'?'private':'published'},token));
  const id=r.response?.id_string||r.response?.id;if(!id)throw new Error('Tumblr chưa trả mã bài viết.');return {externalId:String(id),...(p.type==='video'?{processing:true,socialVerification:true,containerId:String(id)}:{}),url:`https://www.tumblr.com/${encodeURIComponent(c.accountId)}/${id}`};
 }
 if(p.visibility==='private')throw new Error('Reddit không hỗ trợ bài riêng tư qua cổng này.');
 const profile=await extraProfile(c,remote,token),title=String(p.title||text.split('\n')[0]).slice(0,300);
 r=await remote('https://oauth.reddit.com/api/submit',{method:'POST',headers:{...bearer(token),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({api_type:'json',kind:'self',sr:`u_${profile.handle}`,title,text,resubmit:'false'})});
 if(r.json?.errors?.length)throw new Error(r.json.errors.map(x=>x[1]).join(' · '));
 const result=r.json?.data;if(!result?.name)throw new Error('Reddit chưa xác nhận tạo bài.');return {externalId:result.name,url:result.url};
}
