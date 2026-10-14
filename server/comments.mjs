import {all,get,put,secret,now,db,notification,transaction} from './store.mjs';
import {remote} from './connectors.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel,captureLead} from './taophacdo.mjs';

export const commentProviders=new Set(['facebook','threads']);
const locks=new Map();
const base=c=>c.provider==='threads'?'https://graph.threads.net/v1.0':`https://graph.facebook.com/${c.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}`;
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
export function commentAttachments(item){
 const a=item.attachment,src=a?.media?.image?.src||a?.media?.source||item.media_url;
 return src&&safeUrl(src)?[{type:/video/i.test(a?.type||item.media_type||'')?'video':'image',url:safeUrl(src)}]:[];
}
export function upsertComment(channel,item,post={},live=false){
 if(!item.id)return null;
 return transaction(()=>{
 const existingConvs=all('conversations').filter(c=>c.connectionId===channel.id&&c.kind==='comment'),ids=new Set(existingConvs.map(c=>c.id));
 const existing=all('messages').find(m=>ids.has(m.conversationId)&&(m.externalId===String(item.id)||(m.externalMessages||[]).some(x=>x.id===String(item.id))));
 if(existing?.deletedAt)return existing;
 const own=existing?.direction==='outgoing'||item.is_reply_owned_by_me===true||String(item.from?.id||'')===String(channel.accountId);
 const parent=String(item.parent?.id||item.replied_to?.id||'');
 let conv=existing&&get('conversations',existing.conversationId)||existingConvs.find(c=>c.externalCommentId===String(own?parent:item.id));
 if(own&&!conv)return null;
 const external=String(item.from?.id||item.username||item.id),name=item.from?.name||item.username||'Khách từ bình luận';
 let customer=conv&&get('customers',conv.customerId);
 if(!conv){const identity=all('identities').find(i=>i.connectionId===channel.id&&i.externalUserId===external);customer=identity&&get('customers',identity.customerId);if(!customer){customer=put('customers',{name,avatar:safeUrl(item.from?.picture?.data?.url),phone:'',tags:[],consent:false});put('identities',{customerId:customer.id,connectionId:channel.id,externalUserId:external});}conv=put('conversations',{customerId:customer.id,connectionId:channel.id,externalUserId:external,externalCommentId:String(item.id),postId:String(post.id||item.root_post?.id||''),postTitle:post.message||post.text||'',postUrl:safeUrl(post.permalink_url||post.permalink),kind:'comment',mode:'api',status:'open',tags:[]});}
 if(!own&&customer&&(name!=='Khách từ bình luận')&&(customer.name!==name||item.from?.picture?.data?.url&&!customer.avatar))put('customers',{...customer,name,avatar:safeUrl(item.from?.picture?.data?.url)||customer.avatar||''});
 const created=Date.parse(item.created_time||item.timestamp||'');const createdAt=Number.isFinite(created)?new Date(created).toISOString():existing?.createdAt||now();
 const text=String(item.message??item.text??''),attachments=commentAttachments(item);
 if(existing&&existing.text===text&&JSON.stringify(existing.attachments||[])===JSON.stringify(attachments)&&(item.user_likes===undefined||existing.liked===item.user_likes))return existing;
 const msg=put('messages',{...existing,conversationId:conv.id,externalId:String(item.id),direction:own?'outgoing':'incoming',senderName:own?channel.name:name,text,attachments,liked:item.user_likes??existing?.liked,status:own?'accepted':'received',createdAt,permalink:safeUrl(item.permalink_url||item.permalink),parentCommentId:parent});
 const newest=Date.parse(createdAt)>=Date.parse(conv.lastAt||'1970-01-01');
 put('conversations',{...get('conversations',conv.id),...(newest?{lastAt:createdAt,lastMessage:text||(attachments[0]?.type==='video'?'Video':'Ảnh')}:{}),...(!own&&live?{unread:true,status:'open'}:{})});
 if(!own&&!existing&&live){captureLead(get('conversations',conv.id),msg);notification('Bình luận mới trên '+channel.name,text.slice(0,120),'comments',{conversationId:conv.id});}
 return msg;
 });
}
export function ingestCommentEvents(channel,entries){for(const entry of entries||[]){if(String(entry.id)!==String(channel.accountId))continue;for(const change of entry.changes||[]){const v=change.value;if(change.field!=='feed'||v?.item!=='comment'||!v.comment_id)continue;const key=channel.id+':comment:'+v.comment_id+':'+v.verb+':'+(v.created_time||entry.time||'');if(db.prepare('SELECT id FROM events WHERE id=?').get(key))continue;transaction(()=>{if(v.verb==='remove'){for(const c of all('conversations').filter(c=>c.connectionId===channel.id&&c.kind==='comment')){const m=all('messages').find(m=>m.conversationId===c.id&&m.externalId===v.comment_id);if(m)put('messages',{...m,deletedAt:now(),text:'Bình luận đã xóa',attachments:[],status:'deleted'});if(c.externalCommentId===v.comment_id)put('conversations',{...c,status:'resolved',remoteDeleted:true});}}else if(['add','edited'].includes(v.verb)){upsertComment(channel,{id:v.comment_id,message:v.message||'',from:v.from,parent:{id:v.parent_id},attachment:v.photo?{media:{image:{src:v.photo?.url||v.photo}}}:v.attachment,created_time:new Date(Number(v.created_time||entry.time||Date.now()/1000)*1000).toISOString()},{id:v.post_id},true);}db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(key,channel.id,now(),JSON.stringify(change));});}}}

export async function syncComments(channel,request=remote){
 if(locks.has(channel.id))return locks.get(channel.id);
 const job=(async()=>{let state=get('comment_sync',channel.id)||{id:channel.id};try{
 const token=secret(channel.id).token;if(!token)throw Error('Chưa có token kết nối.');
 const headers={Authorization:'Bearer '+token};const read=async(path,params)=>{const url=base(channel)+'/'+encodeURIComponent(path.split('/')[0])+'/'+path.split('/').slice(1).join('/')+'?'+new URLSearchParams(params);try{return await request(url,{headers});}catch(error){if(!error.unknown)throw error;return request(url,{headers});}};
 let queue=state.queue||[],after=state.after||'',processed=0;
 if(!queue.length){const page=await read(channel.accountId+'/'+(channel.provider==='threads'?'threads':'feed'),{fields:channel.provider==='threads'?'id,text,timestamp,permalink':'id,message,created_time,permalink_url',limit:'20',...(after?{after}:{})});queue=page.data||[];after=page.paging?.next?page.paging?.cursors?.after||'':'';}
 for(const post of queue.slice(0,5)){
  const key=channel.id+':'+post.id,p=get('comment_post_sync',key)||{},cursor=p.after||'';
  const page=await read(post.id+'/'+(channel.provider==='threads'?'conversation':'comments'),{fields:channel.provider==='threads'?'id,text,timestamp,username,media_type,media_url,permalink,is_reply_owned_by_me,replied_to,root_post':'id,message,created_time,from{id,name,picture},attachment,parent,user_likes,permalink_url',limit:'50',...(channel.provider==='facebook'?{filter:'stream'}:{}),...(cursor?{after:cursor}:{})});
  const initial=!!state.completedAt;for(const item of [...(page.data||[])].sort((a,b)=>Date.parse(a.created_time||a.timestamp)-Date.parse(b.created_time||b.timestamp)))upsertComment(channel,item,post,initial&&Date.parse(item.created_time||item.timestamp)>Date.now()-3600000);
  const next=page.paging?.next?page.paging?.cursors?.after||'':'';put('comment_post_sync',{id:key,after:next});processed++;if(next){queue=[post,...queue.slice(processed)];processed=0;break;}
 }
 queue=queue.slice(processed);state=put('comment_sync',{...state,queue,after,status:'ready',error:'',syncedAt:now(),...(!queue.length&&!after?{completedAt:now()}:{})});return state;
 }catch(error){return put('comment_sync',{...state,status:'error',error:error.message,syncedAt:now()});}})();locks.set(channel.id,job);try{return await job;}finally{locks.delete(channel.id);}
}
export async function commentsTick(){await Promise.all(all('connections').filter(c=>c.status==='connected'&&c.mode==='api'&&commentProviders.has(c.provider)).map(async c=>{const s=get('comment_sync',c.id);if(Date.now()-Date.parse(s?.syncedAt||0)<(s?.status==='error'?300000:20000))return;await syncComments(c);}));}
export function commentsStatus(user){permission(user,'inbox');return all('connections').filter(c=>c.status==='connected').filter(c=>{try{assertChannel(user,c.id);return true;}catch{return false;}}).map(c=>{const s=get('comment_sync',c.id);return {id:c.id,name:c.name,provider:c.provider,supported:commentProviders.has(c.provider)||c.mode==='demo',status:s?.status||'waiting',syncedAt:s?.syncedAt,error:s?.error||'',backfilling:!!s?.queue?.length||!!s?.after,count:all('conversations').filter(x=>x.kind==='comment'&&x.connectionId===c.id).length};});}
export async function commentsRoute(path,method,input,user){if(path==='/api/comments/status'&&method==='GET')return commentsStatus(user);if(path==='/api/comments/sync'&&method==='POST'){permission(user,'inbox');const channels=commentsStatus(user).filter(c=>c.supported);const apiChannels=channels.filter(c=>get('connections',c.id)?.mode==='api');for(const c of apiChannels)void syncComments(get('connections',c.id));return {started:apiChannels.length};}}
