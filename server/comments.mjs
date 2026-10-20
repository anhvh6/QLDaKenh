import {openCommentPrivateChat} from './comment-private.mjs';
import {commentContext} from './comment-context.mjs';
import {all,get,put,secret,now,db,notification,transaction} from './store.mjs';
import {remote,refreshedToken} from './connectors.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel,observeCareMessage} from './taophacdo.mjs';
import {setImmediate as yieldIO} from 'node:timers/promises';

// Resolve comments in SQLite rather than parsing the entire chat history per item.
// CROSS JOIN fixes join order; unary + removes TEXT affinity so the JSON index is searchable.
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_external ON records(json_extract(data,'$.externalId')) WHERE kind='messages';
CREATE INDEX IF NOT EXISTS idx_comment_channel ON records(json_extract(data,'$.connectionId'),json_extract(data,'$.kind'),json_extract(data,'$.externalCommentId')) WHERE kind='conversations';`);
const stored=row=>row?{...JSON.parse(row.data),id:row.id,version:row.version}:null;
function commentMessage(channelId,externalId){
 const row=db.prepare(`SELECT m.id,m.data,m.version FROM records m INDEXED BY idx_messages_external JOIN records c ON c.kind='conversations' AND c.id=json_extract(m.data,'$.conversationId')
 WHERE m.kind='messages' AND json_extract(m.data,'$.externalId')=? AND json_extract(c.data,'$.connectionId')=? AND json_extract(c.data,'$.kind')='comment' ORDER BY m.updated_at DESC LIMIT 1`).get(externalId,channelId);
 if(row)return stored(row);
 return stored(db.prepare(`SELECT m.id,m.data,m.version FROM records c INDEXED BY idx_comment_channel CROSS JOIN records m INDEXED BY idx_messages_conversation ON m.kind='messages' AND json_extract(m.data,'$.conversationId')=+c.id
 WHERE c.kind='conversations' AND json_extract(c.data,'$.connectionId')=? AND json_extract(c.data,'$.kind')='comment'
 AND EXISTS(SELECT 1 FROM json_each(m.data,'$.externalMessages') e WHERE json_extract(e.value,'$.id')=?) ORDER BY m.updated_at DESC LIMIT 1`).get(channelId,externalId));
}

export const commentProviders=new Set(['facebook','threads','instagram','youtube','blogger','x','devto']);
const locks=new Map();
const base=c=>c.provider==='threads'?'https://graph.threads.net/v1.0':`https://graph.facebook.com/${c.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}`;
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
export function commentAttachments(item){
 const a=item.attachment,src=a?.media?.image?.src||a?.media?.source||item.media_url;
 return src&&safeUrl(src)?[{type:/video/i.test(a?.type||item.media_type||'')?'video':'image',url:safeUrl(src)}]:[];
}
export function updateCommentAuthor(channel,item){
 if(!item.from?.name||!item.from?.id)return;
 const message=commentMessage(channel.id,String(item.id)),c=message&&get('conversations',message.conversationId),customer=c&&get('customers',c.customerId);
 if(!message||message.direction!=='incoming'||!customer)return;
 transaction(()=>{
  if(customer.name!==item.from.name)put('customers',{...customer,name:item.from.name});
  if(message.senderName!==item.from.name||message.authorMissing)put('messages',{...message,senderName:item.from.name,authorMissing:false});
  if(c.authorMissing||c.externalUserId!==String(item.from.id))put('conversations',{...c,authorMissing:false,externalUserId:String(item.from.id)});
 });
}
export function upsertComment(channel,item,post={},live=false){
 if(!item.id)return null;
 return transaction(()=>{
 let existing=commentMessage(channel.id,String(item.id));
 if(existing?.deletedAt)return existing;
 const own=existing?.direction==='outgoing'||item.is_reply_owned_by_me===true||String(item.from?.id||'')===String(channel.accountId);
 const parent=String(item.parent?.id||item.replied_to?.id||'');
 if(own&&!existing)existing=stored(db.prepare(`SELECT m.id,m.data,m.version FROM records c INDEXED BY idx_comment_channel CROSS JOIN records m INDEXED BY idx_messages_conversation ON m.kind='messages' AND json_extract(m.data,'$.conversationId')=+c.id WHERE c.kind='conversations' AND json_extract(c.data,'$.connectionId')=? AND json_extract(c.data,'$.kind')='comment' AND json_extract(m.data,'$.status')='sending' AND json_extract(m.data,'$.replyToExternalId')=? ORDER BY m.updated_at DESC LIMIT 1`).get(channel.id,parent));
 let conv=existing&&get('conversations',existing.conversationId)||stored(db.prepare("SELECT id,data,version FROM records WHERE kind='conversations' AND json_extract(data,'$.connectionId')=? AND json_extract(data,'$.kind')='comment' AND json_extract(data,'$.externalCommentId')=? ORDER BY updated_at DESC LIMIT 1").get(channel.id,String(own?parent:item.id)));
 const standaloneOwnReply=channel.provider==='threads'&&own&&!conv;
 if(own&&!conv&&!standaloneOwnReply)return null;
 const external=String(item.from?.id||item.username||item.id),providedName=String(item.from?.name||item.from?.username||item.username||'').trim();
 let knownIdentity=item.from?.id&&stored(db.prepare("SELECT id,data,version FROM records WHERE kind='identities' AND json_extract(data,'$.connectionId')=? AND json_extract(data,'$.externalUserId')=? LIMIT 1").get(channel.id,external));
 const name=providedName||(knownIdentity&&get('customers',knownIdentity.customerId)?.name)||existing?.senderName||'Khách từ bình luận';
 let customer=conv&&get('customers',conv.customerId);
 if(!conv){const identity=all('identities').find(i=>i.connectionId===channel.id&&i.externalUserId===external);customer=identity&&get('customers',identity.customerId);if(!customer){customer=put('customers',{name,avatar:safeUrl(item.from?.picture?.data?.url),phone:'',tags:[],consent:false});knownIdentity=put('identities',{customerId:customer.id,connectionId:channel.id,externalUserId:external});}conv=put('conversations',{customerId:customer.id,connectionId:channel.id,externalUserId:external,externalCommentId:String(item.id),postId:String(post.id||item.root_post?.id||''),postTitle:post.message||post.text||'',postCreatedAt:post.created_time||post.timestamp||'',postUrl:safeUrl(post.permalink_url||post.permalink),kind:'comment',mode:'api',status:'open',tags:[]});}
 const username=item.username||item.from?.username,profile=safeUrl(item.from?.profileUrl||item.from?.url)||(username&&['instagram','threads'].includes(channel.provider)?'https://'+(channel.provider==='instagram'?'www.instagram.com':'www.threads.net')+'/'+encodeURIComponent(username)+'/':'');
 if(!own&&profile&&conv.authorProfileUrl!==profile)conv=put('conversations',{...get('conversations',conv.id),authorProfileUrl:profile});
 const postUrl=safeUrl(post.permalink_url||post.permalink);if(postUrl&&!conv.postUrl)conv=put('conversations',{...get('conversations',conv.id),postUrl,postTitle:post.message||post.text||conv.postTitle||''});
 if(!own&&customer&&(name!=='Khách từ bình luận')&&(customer.name!==name||item.from?.picture?.data?.url&&!customer.avatar))put('customers',{...customer,name,avatar:safeUrl(item.from?.picture?.data?.url)||customer.avatar||''});
 const created=Date.parse(item.created_time||item.timestamp||'');const createdAt=Number.isFinite(created)?new Date(created).toISOString():existing?.createdAt||now();
 const text=String(item.message??item.text??''),attachments=commentAttachments(item);
 if(existing?.reactionUpdatedAt&&Date.now()-Date.parse(existing.reactionUpdatedAt)<30000)item={...item,user_likes:existing.liked,like_count:existing.likeCount};
 const authorMissing=!own&&!providedName&&name==='Khách từ bình luận';
 if(!own&&item.from?.id&&!knownIdentity)put('identities',{customerId:customer?.id||conv.customerId,connectionId:channel.id,externalUserId:external});
 if(!own){const current=get('conversations',conv.id);if(current.authorMissing!==authorMissing)put('conversations',{...current,authorMissing});}
 if(existing&&existing.senderName===(own?channel.name:name)&&existing.externalId===String(item.id)&&existing.parentCommentId===parent&&existing.likeCount===(item.like_count??existing.likeCount)&&existing.text===text&&JSON.stringify(existing.attachments||[])===JSON.stringify(attachments)&&(item.user_likes===undefined||existing.liked===item.user_likes))return existing;
 const msg=put('messages',{...existing,conversationId:conv.id,externalId:String(item.id),direction:own?'outgoing':'incoming',senderName:own?channel.name:name,authorMissing,text,attachments,liked:item.user_likes??existing?.liked,status:own?'accepted':'received',history:existing?.history??(!own&&!live),createdAt,permalink:safeUrl(item.permalink_url||item.permalink),parentCommentId:parent,likeCount:item.like_count??existing?.likeCount??null});
 const newest=Date.parse(createdAt)>=Date.parse(conv.lastAt||'1970-01-01');
 put('conversations',{...get('conversations',conv.id),...(newest?{lastAt:createdAt,lastMessage:text||(attachments[0]?.type==='video'?'Video':'Ảnh')}:{}),...(!own&&live?{unread:true,status:'open'}:{})});
 if(!own&&!existing&&live){observeCareMessage(get('conversations',conv.id),msg);notification('Bình luận mới trên '+channel.name,text.slice(0,120),'comments',{conversationId:conv.id,messageId:msg.id});}
 return msg;
 });
}

const authHeaders=token=>({Authorization:'Bearer '+token});
const newerThan=(value,state)=>Date.parse(value||0)>=(state.completedAt?Date.now()-3600000:Date.parse(state.startedAt||state.createdAt||''));
async function syncInstagram(channel,state,request){
 const token=secret(channel.id).token,headers=authHeaders(token),root=`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}`;
 const media=await request(`${root}/${encodeURIComponent(channel.accountId)}/media?`+new URLSearchParams({fields:'id,caption,timestamp,permalink',limit:'25'}),{headers});
 for(const post of media.data||[]){const page=await request(`${root}/${encodeURIComponent(post.id)}/comments?`+new URLSearchParams({fields:'id,text,timestamp,username,from{id,username},like_count,replies{id,text,timestamp,username,from{id,username},like_count}',limit:'100'}),{headers});for(const item of page.data||[]){upsertComment(channel,item,post,newerThan(item.timestamp,state));for(const reply of item.replies?.data||[])upsertComment(channel,{...reply,parent:{id:item.id}},post,newerThan(reply.timestamp,state));}}
}
async function syncYouTube(channel,state,request){
 const token=await refreshedToken(channel),headers=authHeaders(token),api='https://www.googleapis.com/youtube/v3';
 const mine=await request(`${api}/channels?part=contentDetails&mine=true`,{headers}),uploads=mine.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;if(!uploads)throw Error('YouTube chưa trả danh sách video của kênh.');
 const videos=await request(`${api}/playlistItems?`+new URLSearchParams({part:'snippet,contentDetails',playlistId:uploads,maxResults:'25'}),{headers});
 for(const row of videos.items||[]){const videoId=row.contentDetails?.videoId;if(!videoId)continue;const post={id:videoId,text:row.snippet?.title||'',timestamp:row.snippet?.publishedAt||'',permalink:`https://www.youtube.com/watch?v=${videoId}`};let page;try{page=await request(`${api}/commentThreads?`+new URLSearchParams({part:'snippet,replies',videoId,maxResults:'100',textFormat:'plainText',order:'time'}),{headers});}catch(error){if(error.providerStatus===404||/disabled|commentsDisabled|videoNotFound|video[^.]*could not be found/i.test(error.message))continue;throw error;}for(const thread of page.items||[]){const top=thread.snippet?.topLevelComment?.snippet||{},topId=thread.snippet?.topLevelComment?.id||thread.id,item={id:topId,text:top.textDisplay||top.textOriginal||'',timestamp:top.publishedAt,from:{id:top.authorChannelId?.value||top.authorDisplayName,name:top.authorDisplayName,picture:{data:{url:top.authorProfileImageUrl}}},like_count:top.likeCount,permalink:`https://www.youtube.com/watch?v=${videoId}&lc=${topId}`};upsertComment(channel,item,post,newerThan(item.timestamp,state));for(const child of thread.replies?.comments||[]){const reply=child.snippet||{};upsertComment(channel,{id:child.id,text:reply.textDisplay||reply.textOriginal||'',timestamp:reply.publishedAt,from:{id:reply.authorChannelId?.value||reply.authorDisplayName,name:reply.authorDisplayName,picture:{data:{url:reply.authorProfileImageUrl}}},like_count:reply.likeCount,parent:{id:topId},permalink:`https://www.youtube.com/watch?v=${videoId}&lc=${child.id}`},post,newerThan(reply.publishedAt,state));}}}
}
async function syncBlogger(channel,state,request){
 const token=await refreshedToken(channel),headers=authHeaders(token),api=`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(channel.accountId)}`;
 const posts=await request(`${api}/posts?`+new URLSearchParams({maxResults:'25',status:'live',fetchBodies:'false'}),{headers});
 for(const post of posts.items||[]){let page;try{page=await request(`${api}/posts/${encodeURIComponent(post.id)}/comments?`+new URLSearchParams({maxResults:'100',fetchBodies:'true'}),{headers});}catch(error){if(error.providerStatus===404)continue;throw error;}const source={id:post.id,text:post.title||'',timestamp:post.published||post.updated,permalink:post.url||''};for(const row of page.items||[]){const item={id:row.id,text:String(row.content||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(),timestamp:row.published||row.updated,from:{id:row.author?.id||row.author?.displayName,name:row.author?.displayName,profileUrl:row.author?.url,picture:{data:{url:row.author?.image?.url}}},permalink:row.selfLink||post.url,parent:row.inReplyTo?.id?{id:row.inReplyTo.id}:undefined};upsertComment(channel,item,source,newerThan(item.timestamp,state));}}
}
async function syncDevto(channel,state,request){
 const token=secret(channel.id).token,headers={'api-key':token,Accept:'application/vnd.forem.api-v1+json'},articles=await request('https://dev.to/api/articles/me?per_page=30',{headers});
 for(const post of articles||[]){const comments=await request(`https://dev.to/api/comments?a_id=${encodeURIComponent(post.id)}`,{headers});const source={id:post.id,text:post.title||'',timestamp:post.published_at||post.created_at,permalink:post.url||''};const walk=(rows,parent='')=>{for(const row of rows||[]){const commentId=row.id_code||row.id;if(!commentId)continue;const item={id:commentId,text:String(row.body_html||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(),timestamp:row.created_at,from:{id:row.user?.user_id||row.user?.username,name:row.user?.name||row.user?.username,profileUrl:row.user?.username?'https://dev.to/'+encodeURIComponent(row.user.username):'',picture:{data:{url:row.user?.profile_image_90}}},permalink:row.url||post.url,...(parent?{parent:{id:parent}}:{})};upsertComment(channel,item,source,newerThan(item.timestamp,state));walk(row.children,commentId);}};walk(comments);}
}
async function syncX(channel,state,request){
 const token=await refreshedToken(channel),headers=authHeaders(token),api='https://api.x.com/2',tweets=await request(`${api}/users/${encodeURIComponent(channel.accountId)}/tweets?`+new URLSearchParams({max_results:'20','tweet.fields':'created_at,conversation_id,author_id'}),{headers});
 for(const post of tweets.data||[]){const conversationId=post.conversation_id||post.id,result=await request(`${api}/tweets/search/recent?`+new URLSearchParams({query:`conversation_id:${conversationId} -from:${channel.accountId}`,'tweet.fields':'created_at,author_id,conversation_id','user.fields':'name,username,profile_image_url',expansions:'author_id',max_results:'100'}),{headers}),users=new Map((result.includes?.users||[]).map(u=>[u.id,u]));const source={id:post.id,text:post.text||'',timestamp:post.created_at,permalink:`https://x.com/i/web/status/${post.id}`};for(const row of result.data||[]){const user=users.get(row.author_id)||{};upsertComment(channel,{id:row.id,text:row.text||'',timestamp:row.created_at,from:{id:row.author_id,name:user.name||user.username,picture:{data:{url:user.profile_image_url}}},parent:{id:conversationId},permalink:`https://x.com/i/web/status/${row.id}`},source,newerThan(row.created_at,state));}}
}
async function syncProviderComments(channel,state,request){
 if(channel.provider==='instagram')return syncInstagram(channel,state,request);
 if(channel.provider==='youtube')return syncYouTube(channel,state,request);
 if(channel.provider==='blogger')return syncBlogger(channel,state,request);
 if(channel.provider==='devto')return syncDevto(channel,state,request);
 if(channel.provider==='x')return syncX(channel,state,request);
}
export function ingestCommentEvents(channel,entries){for(const entry of entries||[]){if(String(entry.id)!==String(channel.accountId))continue;for(const change of entry.changes||[]){const v=change.value||{},instagram=channel.provider==='instagram'&&change.field==='comments',commentId=String(instagram?v.id||'':v.comment_id||'');if(!commentId||(!instagram&&(change.field!=='feed'||v.item!=='comment')))continue;const verb=instagram?'add':v.verb,key=channel.id+':comment:'+commentId+':'+verb+':'+(v.created_time||entry.time||'');if(db.prepare('SELECT id FROM events WHERE id=?').get(key))continue;transaction(()=>{if(verb==='remove'){for(const c of db.prepare("SELECT id,data,version FROM records WHERE kind='conversations' AND json_extract(data,'$.connectionId')=? AND json_extract(data,'$.kind')='comment'").all(channel.id).map(stored)){const m=stored(db.prepare("SELECT id,data,version FROM records WHERE kind='messages' AND json_extract(data,'$.externalId')=? AND json_extract(data,'$.conversationId')=? ORDER BY updated_at DESC LIMIT 1").get(commentId,c.id));if(m)put('messages',{...m,deletedAt:now(),text:'Bình luận đã xóa',attachments:[],status:'deleted'});if(c.externalCommentId===commentId)put('conversations',{...c,status:'resolved',remoteDeleted:true});}}else if(instagram||['add','edited'].includes(verb)){const from=instagram?{id:v.from?.id||v.from?.username,name:v.from?.username}:v.from||{id:v.sender_id,name:v.sender_name};upsertComment(channel,{id:commentId,message:instagram?v.text||'':v.message||'',from,parent:{id:v.parent_id},attachment:v.photo?{media:{image:{src:v.photo?.url||v.photo}}}:v.attachment,created_time:new Date(Number(v.created_time||entry.time||Date.now()/1000)*1000).toISOString()},{id:instagram?v.media?.id:v.post_id},true);}db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(key,channel.id,now(),JSON.stringify(change));});}}}

export async function syncComments(channel,request=remote){
 if(locks.has(channel.id))return locks.get(channel.id);
 const job=(async()=>{let state=get('comment_sync',channel.id)||{id:channel.id};try{
 if(!state.startedAt)state=put('comment_sync',{...state,startedAt:state.createdAt||now()});
 const token=secret(channel.id).token;if(!token)throw Error('Chưa có token kết nối.');
 if(!['facebook','threads'].includes(channel.provider)){await syncProviderComments(channel,state,request);state=put('comment_sync',{...state,queue:[],after:'',status:'ready',error:'',syncedAt:now(),completedAt:now()});return state;}
 const headers={Authorization:'Bearer '+token};const read=async(path,params)=>{const url=base(channel)+'/'+encodeURIComponent(path.split('/')[0])+'/'+path.split('/').slice(1).join('/')+'?'+new URLSearchParams(params);try{return await request(url,{headers});}catch(error){if(!error.retryable&&!error.unknown)throw error;return request(url,{headers});}};
 let queue=state.queue||[],after=state.after||'',processed=0;
 if(!queue.length){const page=await read(channel.accountId+'/'+(channel.provider==='threads'?'threads':'feed'),{fields:channel.provider==='threads'?'id,text,timestamp,permalink':'id,message,created_time,permalink_url',limit:'20',...(after?{after}:{})});queue=page.data||[];after=page.paging?.next?page.paging?.cursors?.after||'':'';}
 for(const post of queue.slice(0,5)){
  const key=channel.id+':'+post.id,p=get('comment_post_sync',key)||{},cursor=p.after||'';
  const page=await read(post.id+'/'+(channel.provider==='threads'?'replies':'comments'),{fields:channel.provider==='threads'?'id,text,timestamp,username,media_type,media_url,permalink,is_reply_owned_by_me,replied_to,root_post':'id,message,created_time,from{id,name,picture},attachment,parent,user_likes,like_count,permalink_url',limit:'50',...(channel.provider==='facebook'?{filter:'stream'}:{}),...(cursor?{after:cursor}:{})});
  for(const item of [...(page.data||[])].sort((a,b)=>Date.parse(a.created_time||a.timestamp)-Date.parse(b.created_time||b.timestamp))){upsertComment(channel,item,post,newerThan(item.created_time||item.timestamp,state));await yieldIO();}
  const next=page.paging?.next?page.paging?.cursors?.after||'':'';put('comment_post_sync',{id:key,after:next});processed++;if(next){queue=[post,...queue.slice(processed)];processed=0;break;}
 }
 queue=queue.slice(processed);state=put('comment_sync',{...state,queue,after,status:'ready',error:'',syncedAt:now(),...(!queue.length&&!after?{completedAt:now()}:{})});return state;
 }catch(error){const transient=error.retryable===true&&!!state.completedAt;return put('comment_sync',{...state,status:transient?'ready':'error',error:transient?'':error.message,...(transient?{lastTransientError:error.message,lastTransientAt:now()}:{}),syncedAt:now()});}})();locks.set(channel.id,job);try{return await job;}finally{locks.delete(channel.id);}
}
export async function commentsTick(){await Promise.all(all('connections').filter(c=>c.status==='connected'&&c.mode==='api'&&commentProviders.has(c.provider)).map(async c=>{const s=get('comment_sync',c.id);if(Date.now()-Date.parse(s?.syncedAt||0)<(s?.status==='error'?300000:15000))return;await syncComments(c);}));}
export function commentsStatus(user){permission(user,'inbox');return all('connections').filter(c=>c.status==='connected').filter(c=>{try{assertChannel(user,c.id);return true;}catch{return false;}}).map(c=>{const s=get('comment_sync',c.id);return {id:c.id,name:c.remoteName||c.name,provider:c.provider,supported:commentProviders.has(c.provider)||c.mode==='demo',status:s?.status||'waiting',syncedAt:s?.syncedAt,error:s?.error||'',backfilling:!!s?.queue?.length||!!s?.after,count:all('conversations').filter(x=>x.kind==='comment'&&x.connectionId===c.id).length,missingAuthorCount:db.prepare("SELECT count(*) AS n FROM records c JOIN records p ON p.kind='customers' AND p.id=json_extract(c.data,'$.customerId') WHERE c.kind='conversations' AND json_extract(c.data,'$.kind')='comment' AND json_extract(c.data,'$.connectionId')=? AND json_extract(p.data,'$.name')=?").get(c.id,'Khách từ bình luận').n};});}
export async function commentsRoute(path,method,input,user){const privateChat=path.match(/^\/api\/comments\/conversations\/([^/]+)\/private-chat$/);if(privateChat&&method==='POST')return openCommentPrivateChat(user,privateChat[1]);const context=path.match(/^\/api\/comments\/conversations\/([^/]+)\/context$/);if(context&&method==='GET')return commentContext(user,context[1]);if(path==='/api/comments/status'&&method==='GET')return commentsStatus(user);if(path==='/api/comments/sync'&&method==='POST'){permission(user,'inbox');const channels=commentsStatus(user).filter(c=>c.supported);const apiChannels=channels.filter(c=>get('connections',c.id)?.mode==='api');for(const c of apiChannels)void syncComments(get('connections',c.id));return {started:apiChannels.length};}}
