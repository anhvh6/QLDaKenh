import {createHash,randomBytes} from 'node:crypto';
import {all,get,put,remove,secret,saveSecret,now,audit} from './store.mjs';
import {remote} from './connectors.mjs';

const graphVersion=process.env.META_GRAPH_VERSION||'v25.0';
const oauthProviders=new Set(['facebook','instagram','threads','x','youtube','blogger','tiktok']);
const oauthRequirements={
 facebook:['META_APP_ID','META_APP_SECRET'],instagram:['META_APP_ID','META_APP_SECRET'],
 threads:['THREADS_APP_ID','THREADS_APP_SECRET'],x:['X_CLIENT_ID','X_CLIENT_SECRET'],
 youtube:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'],blogger:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'],tiktok:['TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET']
};
const env=(name)=>{const value=process.env[name];if(!value)throw Object.assign(new Error(`Chưa cấu hình ${name}. Điền giá trị vào file .env rồi khởi động lại máy chủ.`),{status:503});return value;};
const form=(values)=>new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined&&v!==null)).toString();
const jsonHeaders={Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'};

function baseUrl(req){
 const configured=process.env.OAUTH_BASE_URL?.replace(/\/$/,'');
 if(configured)return configured;
 const host=String(req.headers.host||'127.0.0.1:4317');
 if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host))throw Object.assign(new Error('Cấu hình OAUTH_BASE_URL bằng URL HTTPS công khai.'),{status:503});
 return `http://${host}`;
}
const redirectUri=(provider,req)=>process.env[`${provider.toUpperCase()}_REDIRECT_URI`]||`${baseUrl(req)}/api/oauth/${provider}/callback`;
const encode=params=>new URLSearchParams(params).toString();
const verifier=()=>randomBytes(48).toString('base64url');

export function supportsOAuth(provider){return oauthProviders.has(provider);}
export function oauthMode(provider,currentMode){return ['facebook','instagram','threads','x','blogger','youtube','tiktok'].includes(provider)?'api':currentMode==='demo'?'assisted':currentMode;}
export function oauthConfiguration(req){return Object.fromEntries([...oauthProviders].map(provider=>{const missing=(oauthRequirements[provider]||[]).filter(name=>!process.env[name]);let callback='';try{callback=redirectUri(provider,req);}catch{}return [provider,{ready:missing.length===0,missing,callback}];}));}

export function startOAuth(user,connection,req){
 if(!supportsOAuth(connection.provider))throw Object.assign(new Error('Nền tảng này chưa hỗ trợ OAuth.'),{status:400});
 const state=randomBytes(24).toString('base64url'),codeVerifier=connection.provider==='x'?verifier():'';
 put('oauth_states',{id:state,userId:user.id,connectionId:connection.id,provider:connection.provider,expiresAt:Date.now()+10*60*1000});
 if(codeVerifier)saveSecret(`oauth:${state}`,{codeVerifier});
 const redirect=redirectUri(connection.provider,req);let url;
 if(['facebook','instagram'].includes(connection.provider)){
  const scopes=['pages_show_list','pages_read_engagement','pages_read_user_content','pages_manage_posts','pages_manage_engagement','pages_manage_metadata','pages_messaging','instagram_basic','instagram_content_publish','instagram_manage_contents','instagram_manage_comments'];
  url=`https://www.facebook.com/${graphVersion}/dialog/oauth?${encode({client_id:env('META_APP_ID'),redirect_uri:redirect,state,response_type:'code',scope:scopes.join(',')})}`;
 }else if(connection.provider==='threads'){
  url=`https://threads.net/oauth/authorize?${encode({client_id:env('THREADS_APP_ID'),redirect_uri:redirect,state,response_type:'code',scope:'threads_basic,threads_content_publish,threads_delete,threads_read_replies,threads_manage_replies,threads_manage_insights'})}`;
 }else if(connection.provider==='x'){
  const challenge=createHash('sha256').update(codeVerifier).digest('base64url');
  url=`https://x.com/i/oauth2/authorize?${encode({response_type:'code',client_id:env('X_CLIENT_ID'),redirect_uri:redirect,scope:'tweet.read tweet.write users.read offline.access',state,code_challenge:challenge,code_challenge_method:'S256'})}`;
 }else if(['youtube','blogger'].includes(connection.provider)){
  const scope=connection.provider==='blogger'?'https://www.googleapis.com/auth/blogger':'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl';
  url=`https://accounts.google.com/o/oauth2/v2/auth?${encode({client_id:env('GOOGLE_CLIENT_ID'),redirect_uri:redirect,response_type:'code',scope,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state})}`;
 }else{
  if(!redirect.startsWith('https://'))throw Object.assign(new Error('TikTok yêu cầu TIKTOK_REDIRECT_URI hoặc OAUTH_BASE_URL là HTTPS công khai.'),{status:503});
  url=`https://www.tiktok.com/v2/auth/authorize/?${encode({client_key:env('TIKTOK_CLIENT_KEY'),redirect_uri:redirect,response_type:'code',scope:'user.info.basic,video.publish',state})}`;
 }
 return {url,redirectUri:redirect};
}

async function tokenRequest(url,values,headers={}){
 return remote(url,{method:'POST',headers:{...jsonHeaders,...headers},body:form(values)});
}

export function metaAccounts(provider,pages=[]){
 if(provider==='instagram')return pages.filter(page=>page.instagram_business_account?.id).map(page=>{const ig=page.instagram_business_account;return {accountId:ig.id,name:ig.username||ig.name||'Instagram',avatar:ig.profile_picture_url||'',token:page.access_token,extra:{pageId:page.id}};});
 return pages.map(page=>({accountId:page.id,name:page.name||'Facebook Page',avatar:page.picture?.data?.url||'',token:page.access_token}));
}

async function metaProfile(provider,code,redirect){
 const token=await remote(`https://graph.facebook.com/${graphVersion}/oauth/access_token?${encode({client_id:env('META_APP_ID'),client_secret:env('META_APP_SECRET'),redirect_uri:redirect,code})}`);
 const pages=await remote(`https://graph.facebook.com/${graphVersion}/me/accounts?${encode({fields:'id,name,access_token,picture,instagram_business_account{id,username,name,profile_picture_url}',access_token:token.access_token})}`);
 const accounts=metaAccounts(provider,pages.data||[]);
 if(!accounts.length)throw new Error(provider==='instagram'?'Các Facebook Page được cấp quyền chưa liên kết Instagram Professional.':'Tài khoản chưa cấp quyền cho Facebook Page nào.');
 return {...accounts[0],accounts};
}

async function exchange(provider,code,redirect,state){
 if(provider==='facebook'||provider==='instagram')return metaProfile(provider,code,redirect);
 if(provider==='threads'){
  const short=await tokenRequest('https://graph.threads.net/oauth/access_token',{client_id:env('THREADS_APP_ID'),client_secret:env('THREADS_APP_SECRET'),grant_type:'authorization_code',redirect_uri:redirect,code});
  const long=await remote(`https://graph.threads.net/access_token?${encode({grant_type:'th_exchange_token',client_secret:env('THREADS_APP_SECRET'),access_token:short.access_token})}`);
  const profile=await remote(`https://graph.threads.net/v1.0/me?${encode({fields:'id,username,name,threads_profile_picture_url',access_token:long.access_token})}`);
  return {accountId:profile.id,name:profile.username||profile.name||'Threads',avatar:profile.threads_profile_picture_url||'',token:long.access_token,expiresIn:long.expires_in};
 }
 if(provider==='x'){
  const {codeVerifier}=secret(`oauth:${state}`);const basic=Buffer.from(`${env('X_CLIENT_ID')}:${env('X_CLIENT_SECRET')}`).toString('base64');
  const tokens=await tokenRequest('https://api.x.com/2/oauth2/token',{code,grant_type:'authorization_code',redirect_uri:redirect,code_verifier:codeVerifier},{Authorization:`Basic ${basic}`});
  const profile=await remote('https://api.x.com/2/users/me?user.fields=name,username,profile_image_url',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
  return {accountId:profile.data.id,name:profile.data.username||profile.data.name||'X',avatar:profile.data.profile_image_url||'',token:tokens.access_token,refreshToken:tokens.refresh_token,expiresIn:tokens.expires_in};
 }
 if(provider==='youtube'||provider==='blogger'){
  const tokens=await tokenRequest('https://oauth2.googleapis.com/token',{code,client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET'),redirect_uri:redirect,grant_type:'authorization_code'});
  if(provider==='blogger'){
   const blogs=await remote('https://www.googleapis.com/blogger/v3/users/self/blogs',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
   const accounts=(blogs.items||[]).map(blog=>({accountId:String(blog.id),name:blog.name||'Blogger',avatar:'',token:tokens.access_token,refreshToken:tokens.refresh_token,expiresIn:tokens.expires_in}));
   if(!accounts.length)throw new Error('Tài khoản Google chưa có blog Blogger.');
   return {...accounts[0],accounts};
  }
  const channels=await remote('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',{headers:{Authorization:`Bearer ${tokens.access_token}`}});const channel=channels.items?.[0];
  if(!channel)throw new Error('Tài khoản Google chưa có kênh YouTube.');
  return {accountId:channel.id,name:channel.snippet?.title||'YouTube',avatar:channel.snippet?.thumbnails?.default?.url||'',token:tokens.access_token,refreshToken:tokens.refresh_token,expiresIn:tokens.expires_in};
 }
 const tokens=await tokenRequest('https://open.tiktokapis.com/v2/oauth/token/',{client_key:env('TIKTOK_CLIENT_KEY'),client_secret:env('TIKTOK_CLIENT_SECRET'),code,grant_type:'authorization_code',redirect_uri:redirect});
 const profile=await remote('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',{headers:{Authorization:`Bearer ${tokens.access_token}`}});const user=profile.data?.user||{};
 return {accountId:tokens.open_id||user.open_id,name:user.display_name||'TikTok',avatar:user.avatar_url||'',token:tokens.access_token,refreshToken:tokens.refresh_token,expiresIn:tokens.expires_in,extra:{scope:tokens.scope||''}};
}

export async function finishOAuth(req,res,url){
 const provider=url.pathname.split('/')[3],state=url.searchParams.get('state')||'',record=get('oauth_states',state);
 const done=(ok,message)=>{res.writeHead(302,{Location:`/?oauth=${ok?'success':'error'}&message=${encodeURIComponent(message)}#settings`,'Cache-Control':'no-store'});res.end();};
 if(!record||record.provider!==provider||record.expiresAt<Date.now()){done(false,'Phiên kết nối đã hết hạn. Vui lòng thử lại.');return;}
 remove('oauth_states',state);
 try{
  if(url.searchParams.get('error'))throw new Error(url.searchParams.get('error_description')||'Bạn đã hủy cấp quyền.');
  const code=url.searchParams.get('code');if(!code)throw new Error('Nền tảng không trả mã xác thực.');
  const connection=get('connections',record.connectionId);if(!connection)throw new Error('Kênh kết nối không còn tồn tại.');
  const profile=await exchange(provider,code,redirectUri(provider,req),state),profiles=profile.accounts||[profile];let primaryUsed=false;
  for(const item of profiles){
   let target=all('connections').find(c=>!c.deletedAt&&c.provider===provider&&String(c.accountId||'')===String(item.accountId));if(target?.id===connection.id)primaryUsed=true;
   if(!target&&!primaryUsed){target=connection;primaryUsed=true;}
   if(!target)target=put('connections',{name:item.name,provider,mode:connection.mode});
   const previous=secret(target.id);
   saveSecret(target.id,{...previous,token:item.token,...(item.refreshToken?{refreshToken:item.refreshToken}:{}),...(item.expiresIn?{expiresAt:Date.now()+Number(item.expiresIn)*1000}:{}),...(item.extra||{})});
   target=put('connections',{...target,name:target.name||item.name,mode:oauthMode(provider,target.mode),...(provider==='facebook'||provider==='instagram'?{apiVersion:target.apiVersion||graphVersion}:{}),accountId:String(item.accountId),remoteName:item.name,avatar:item.avatar,status:'connected',verifiedAt:now()});
   audit(record.userId,'oauth_connected',target.id,{provider,accountId:item.accountId});
   // A Page's access token alone is not enough: Facebook only starts sending webhook events (comments, messages)
   // for a Page once it is explicitly subscribed to this app via subscribed_apps. Without this call, the
   // /api/webhooks/:id receiver never fires even though everything else is configured correctly.
   if(provider==='facebook')try{
    await remote(`https://graph.facebook.com/${graphVersion}/${item.accountId}/subscribed_apps?subscribed_fields=feed,messages,message_echoes,message_reactions`,{method:'POST',headers:{Authorization:`Bearer ${item.token}`}});
    audit(record.userId,'oauth_webhook_subscribed',target.id);
    const {hydrateCommentAuthors}=await import('./taophacdo.mjs');
    await hydrateCommentAuthors(target,500);
   }catch(error){audit(record.userId,'oauth_webhook_subscribe_failed',target.id,{error:error.message});}
   if(provider==='instagram')try{
    await remote(`https://graph.facebook.com/${graphVersion}/${item.accountId}/subscribed_apps?subscribed_fields=comments`,{method:'POST',headers:{Authorization:`Bearer ${item.token}`}});
    audit(record.userId,'oauth_webhook_subscribed',target.id,{provider:'instagram'});
   }catch(error){audit(record.userId,'oauth_webhook_subscribe_failed',target.id,{provider:'instagram',error:error.message});}
  }
  done(true,`Đã kết nối ${profiles.length} ${provider==='facebook'?'Facebook Page':'tài khoản'}.`);
 }catch(error){done(false,String(error.message||'Kết nối thất bại.').slice(0,300));}
 finally{try{remove('oauth_states',state);}catch{}try{saveSecret(`oauth:${state}`,{});}catch{}}
}
