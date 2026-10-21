import {socialOperations,socialOperationLabels} from '../public/social-capabilities.js';
import {get,put,secret,now,audit,db} from './store.mjs';
import {remote,refreshedToken} from './connectors.mjs';
import {extraProfile} from './social-extra.mjs';
import {blueskyInteraction} from './social-replies.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
const locks=new Map();
export async function checkSocialHealth(c,request=remote){
 if(locks.has(c.id))return locks.get(c.id);
 const job=(async()=>{
 const operations=socialOperations[c.provider]||{},checks=[],s=secret(c.id),headers={Authorization:`Bearer ${s.token}`};
 const probe=async(key,fn)=>{try{await fn();checks.push({key,status:'ok'});}catch(error){checks.push({key,status:'error',message:String(error.message).replace(/<[^>]*>/g,'').slice(0,650)});}};
 if(c.mode!=='api'||c.status!=='connected')checks.push({key:'profile',status:'waiting',message:'Kênh chưa được xác thực API.'});
 else if(c.provider==='zalo_personal')checks.push({key:'chat',status:c.listenerState==='listening'?'ok':'error',message:c.listenerError||'Trạng thái phiên nhận tin: '+(c.listenerState||'chưa biết')});
 else{
 await probe('profile',async()=>{
  if(['bluesky','mastodon','tumblr','reddit'].includes(c.provider))return extraProfile(c,request);
  if(['facebook','instagram'].includes(c.provider))return request(`https://graph.facebook.com/${c.apiVersion||'v25.0'}/${encodeURIComponent(c.accountId)}?fields=id,${c.provider==='instagram'?'username':'name'}`,{headers});
  if(c.provider==='threads')return request(`https://graph.threads.net/v1.0/${encodeURIComponent(c.accountId)}?fields=id,username`,{headers});
  if(c.provider==='devto')return request('https://dev.to/api/users/me',{headers:{'api-key':s.token}});
  const token=await refreshedToken(c);headers.Authorization=`Bearer ${token}`;
  if(c.provider==='x')return request('https://api.x.com/2/users/me',{headers});
  if(c.provider==='youtube')return request('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers});
  if(c.provider==='blogger')return request(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(c.accountId)}`,{headers});
  if(c.provider==='tiktok')return request('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers});
  if(c.provider==='zalo')return request('https://openapi.zalo.me/v2.0/oa/getoa',{headers:{access_token:s.token}});
  throw new Error('Chưa có phép kiểm tra hồ sơ cho cổng này.');
 });
 if(checks[0]?.status==='ok'){
  if(['facebook','instagram'].includes(c.provider)){
   const root=`https://graph.facebook.com/${c.apiVersion||'v25.0'}/${encodeURIComponent(c.accountId)}`;
   await probe('webhook',async()=>{const r=await request(root+'/subscribed_apps?fields=subscribed_fields',{headers});const fields=new Set((r.data||[]).flatMap(x=>x.subscribed_fields||[])),required=c.provider==='facebook'?['feed','messages']:['comments','messages'];if(!required.every(f=>fields.has(f)))throw new Error('Webhook chưa đăng ký đủ trường: '+required.filter(f=>!fields.has(f)).join(', '));});
   await probe('comments',()=>request(root+(c.provider==='facebook'?'/feed?fields=id&limit=1':'/media?fields=id&limit=1'),{headers}));
   await probe('chat',()=>request(root+'/conversations?fields=id&limit=1'+(c.provider==='instagram'?'&platform=instagram':''),{headers}));
  }else if(c.provider==='x')await probe('comments',()=>request(`https://api.x.com/2/users/${encodeURIComponent(c.accountId)}/tweets?max_results=5`,{headers}));
  else if(c.provider==='youtube')await probe('comments',()=>request(`https://www.googleapis.com/youtube/v3/commentThreads?part=id&allThreadsRelatedToChannelId=${encodeURIComponent(c.accountId)}&maxResults=1`,{headers}));
  else if(c.provider==='threads')await probe('comments',async()=>{const posts=await request(`https://graph.threads.net/v1.0/${encodeURIComponent(c.accountId)}/threads?fields=id&limit=1`,{headers});if(posts.data?.[0]?.id)await request(`https://graph.threads.net/v1.0/${encodeURIComponent(posts.data[0].id)}/replies?fields=id&limit=1`,{headers});else throw new Error('Chưa có bài Threads để kiểm tra quyền đọc phản hồi.');});
  else if(c.provider==='bluesky')await probe('comments',()=>request('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?'+new URLSearchParams({actor:c.accountId,limit:'1'})));
  else if(c.provider==='mastodon')await probe('comments',()=>request(`https://mastodon.social/api/v1/accounts/${encodeURIComponent(c.accountId)}/statuses?limit=1`));
  else if(c.provider==='blogger')await probe('comments',()=>request(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(c.accountId)}/comments?maxResults=1`,{headers}));
  else if(c.provider==='devto')await probe('comments',()=>request('https://dev.to/api/articles/me?per_page=1',{headers:{'api-key':s.token}}));
 }
 }
 const sync=get('comment_sync',c.id),normalize=value=>String(value).replace(/<[^>]*>/g,'').replace(/\s*·\s*trace\s+\S+/g,'').trim();if(sync?.status==='error'&&operations.comments&&!checks.some(check=>check.status==='error'&&normalize(check.message)===normalize(sync.error)))checks.push({key:'sync',status:'error',message:normalize(sync.error||'Đồng bộ bình luận lỗi').slice(0,650)});
 const report={checkedAt:now(),checks,operations:Object.fromEntries(Object.keys(socialOperationLabels).map(key=>[key,{implemented:!!operations[key],verification:checks.find(x=>x.key===key)?.status||(operations[key]?'not_tested':'unsupported')}]))};
 return report;
 })();locks.set(c.id,job);try{return await job;}finally{locks.delete(c.id);}
}
export async function socialHealthRoute(path,method,input,user){
 const match=path.match(/^\/api\/connections\/([^/]+)\/health$/);
 if(match&&method==='POST'){
  if(user.role!=='owner')fail('Cần quyền chủ hệ thống.',403);
  const c=get('connections',match[1]);if(!c||c.deletedAt)fail('Kênh không tồn tại.',404);
  const result=await checkSocialHealth(c);put('connections',{...get('connections',c.id),health:result});
  // Connection sync timestamps intentionally skip state invalidation; a user-requested health report must not.
  db.prepare('UPDATE state_revision SET value=value+1 WHERE id=1').run();
  audit(user.id,'connection_health_checked',c.id);return result;
 }
 const share=path.match(/^\/api\/messages\/([^/]+)\/share$/);
 if(share&&method==='POST'){
  permission(user,'inbox');const m=get('messages',share[1]),conv=m&&get('conversations',m.conversationId),c=conv&&get('connections',conv.connectionId);
  if(!m||m.deletedAt||!conv||conv.kind!=='comment'||!c||c.deletedAt)fail('Không tìm thấy bình luận.',404);assertChannel(user,c.id);
  if(c.status!=='connected'||!socialOperations[c.provider]?.share)fail('Kênh chưa hỗ trợ chia sẻ bình luận qua API.');
  if(m.sharedExternalId)return {id:m.sharedExternalId,alreadyShared:true};
  if(['sending','unknown'].includes(m.shareStatus))fail('Đang chia sẻ hoặc cần kiểm tra bài gốc trước khi thử lại.',409);
  put('messages',{...m,shareStatus:'sending'});
  try{const result=await blueskyInteraction(c,m.externalId,'app.bsky.feed.repost',remote);
  put('messages',{...get('messages',m.id),sharedExternalId:result.uri,shareStatus:'accepted'});audit(user.id,'comment_shared',m.id);return {id:result.uri};}
  catch(error){put('messages',{...get('messages',m.id),shareStatus:error.unknown?'unknown':'failed'});throw error;}
 }
}
