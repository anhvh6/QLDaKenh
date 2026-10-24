import {get,put,secret,now,db} from './store.mjs';
import {remote} from './connectors.mjs';
import {updateCommentAuthor} from './comments.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {commentPostMedia} from '../public/comment-post-media.js';

const pending=new Map();
const previewRefreshes=new Map();
// Opening a thread never waits for Graph. Persisted context stays available
// while its refresh runs independently; direct refresh remains awaitable.
export function commentContextPreview(user,id,request=remote){
 permission(user,'inbox');const c=get('conversations',id);if(!c||c.kind!=='comment'||c.deletedAt||c.remoteDeleted)fail('Không tìm thấy bình luận.',404);assertChannel(user,c.connectionId);
 if(get('connections',c.connectionId)?.status!=='connected')fail('Kênh chưa kết nối.',409);
 const cached=get('comment_context',id),valid=cached?.mediaVersion===1;
 if(valid&&Date.now()-Date.parse(cached.loadedAt)<60000)return cached;
 if(!previewRefreshes.has(id)){const job=commentContext(user,id,request).catch(()=>null).finally(()=>previewRefreshes.delete(id));previewRefreshes.set(id,job);}
 return {...(valid?cached:localCommentContext(c)),refreshing:true};
}
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
function contextError(label,error,provider){
 const message=String(error?.message||error||'');
 if(provider==='facebook'&&(/pages_read_engagement|Page Public Content Access|code 10|subcode 33|Unsupported get request/i.test(message)))return `${label}: Meta chưa cho token hiện tại đọc chi tiết bài viết/bình luận. Hãy kết nối lại Facebook Page và cấp quyền pages_read_engagement.`;
 return `${label}: ${message.replace(/\s*·\s*(?:code|subcode|trace)\b.*$/i,'').trim()||'Không đọc được dữ liệu.'}`;
}
export function summarizeComment(item,local={}){
 return {id:String(item.id||local.externalId||''),text:String(item.message??item.text??local.text??''),name:item.from?.name||item.username||local.senderName||local.name||'Người bình luận',createdAt:item.created_time||item.timestamp||local.createdAt||'',likes:item.like_count??local.likeCount??null,dislikes:null,deleted:!!local.deletedAt,parentId:String(item.parent?.id||item.replied_to?.id||local.parentCommentId||'')};
}
export function localCommentContext(c){
 const decode=r=>r?{...JSON.parse(r.data),id:r.id,version:r.version}:null;
 const root=decode(db.prepare("SELECT id,data,version FROM records INDEXED BY idx_messages_conversation_external WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.externalId')=? LIMIT 1").get(c.id,c.externalCommentId||''))||decode(db.prepare("SELECT id,data,version FROM records INDEXED BY idx_messages_live_order WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction')='incoming' ORDER BY json_extract(data,'$.createdAt'),id LIMIT 1").get(c.id));
 const current=summarizeComment({},root||{}),parent=current.parentId&&current.parentId!==c.postId?decode(db.prepare("SELECT m.id,m.data,m.version FROM records m INDEXED BY idx_messages_external JOIN records c ON c.kind='conversations' AND c.id=json_extract(m.data,'$.conversationId') WHERE m.kind='messages' AND json_extract(m.data,'$.externalId')=? AND json_extract(c.data,'$.connectionId')=? LIMIT 1").get(current.parentId,c.connectionId)):null;
 return {conversationId:c.id,post:{id:c.postId||'',text:c.postTitle||'',url:safeUrl(c.postUrl),media:c.postMedia?.length?c.postMedia:commentPostMedia({url:c.postUrl}),createdAt:c.postCreatedAt||'',likes:null,shares:null,comments:null},current,parent:parent?summarizeComment({},parent):null,parentId:current.parentId&&current.parentId!==c.postId?current.parentId:'',errors:[],loadedAt:''};
}
export async function commentContext(user,id,request=remote){
 permission(user,'inbox');const c=get('conversations',id);if(!c||c.kind!=='comment'||c.deletedAt)fail('Không tìm thấy bình luận.',404);assertChannel(user,c.connectionId);
 const channel=get('connections',c.connectionId);if(channel?.status!=='connected')fail('Kênh chưa kết nối.',409);
 // Only Facebook supports the object-detail fields used below. Rebuild local
 // context before consulting the cache so stale Graph errors from older builds
 // disappear immediately for Blogger, Threads and the other providers.
 if(channel.provider==='instagram'&&channel.mode!=='demo'){
  const cached=get('comment_context',id);if(cached?.mediaVersion===1&&Date.now()-Date.parse(cached.loadedAt)<60000)return cached;
  const out=localCommentContext(c);if(c.postId)try{const p=await request(`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}/${encodeURIComponent(c.postId)}?`+new URLSearchParams({fields:'id,caption,timestamp,permalink,media_type,media_url,thumbnail_url,children{media_type,media_url,thumbnail_url}'}),{headers:{Authorization:'Bearer '+secret(channel.id).token}});out.post={...out.post,text:p.caption||out.post.text,url:safeUrl(p.permalink)||out.post.url,createdAt:p.timestamp||out.post.createdAt,media:commentPostMedia(p)};}catch(error){out.errors.push(contextError('Bài viết',error,channel.provider));}out.loadedAt=now();return put('comment_context',{...out,mediaVersion:1,id});
 }
 if(channel.mode==='demo'||channel.provider!=='facebook'){const out=localCommentContext(c);out.loadedAt=now();return put('comment_context',{...out,mediaVersion:1,id});}
 const cached=get('comment_context',id);if(cached?.mediaVersion===1&&Date.now()-Date.parse(cached.loadedAt)<60000)return cached;
 if(pending.has(id))return pending.get(id);
 const job=(async()=>{const out=localCommentContext(c);
 const threads=channel.provider==='threads',base=threads?'https://graph.threads.net/v1.0':`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}`;
 const read=(object,fields)=>request(base+'/'+encodeURIComponent(object)+'?'+new URLSearchParams({fields}),{headers:{Authorization:'Bearer '+secret(channel.id).token}});
 const jobs=[];
 if(c.postId)jobs.push((async()=>{try{const p=await read(c.postId,threads?'id,text,timestamp,permalink':'id,message,created_time,permalink_url,full_picture,attachments{media,type,url,subattachments},likes.limit(0).summary(true),comments.limit(0).summary(true),shares');out.post={media:commentPostMedia(p).length?commentPostMedia(p):out.post.media,id:p.id||c.postId,text:p.message||p.text||out.post.text,url:safeUrl(p.permalink_url||p.permalink)||out.post.url,createdAt:p.created_time||p.timestamp||out.post.createdAt,likes:p.likes?.summary?.total_count??null,comments:p.comments?.summary?.total_count??null,shares:p.shares?.count??null};if(threads){try{const stats=await request(base+'/'+encodeURIComponent(c.postId)+'/insights?metric=likes,replies,shares',{headers:{Authorization:'Bearer '+secret(channel.id).token}});for(const row of stats.data||[]){const key={likes:'likes',replies:'comments',shares:'shares'}[row.name];if(key)out.post[key]=row.values?.[0]?.value??row.total_value?.value??null;}}catch(e){out.errors.push(contextError('Chỉ số bài viết',e,channel.provider));}}}catch(e){out.errors.push(contextError('Bài viết',e,channel.provider));}})());
 jobs.push((async()=>{try{const item=await read(c.externalCommentId,threads?'id,text,timestamp,username,replied_to':'id,message,from,created_time,like_count,parent');out.current=summarizeComment(item,out.current);if(item.from?.name)updateCommentAuthor(channel,item);out.parentId=out.current.parentId&&out.current.parentId!==c.postId?out.current.parentId:'';}catch(e){out.errors.push(contextError('Bình luận',e,channel.provider));}
 if(out.parentId){try{const parent=await read(out.parentId,threads?'id,text,timestamp,username,replied_to':'id,message,from,created_time,like_count,parent');out.parent=summarizeComment(parent,out.parent||{});}catch(e){out.errors.push(contextError('Bình luận gốc',e,channel.provider));}}})());
 await Promise.all(jobs);out.loadedAt=now();return put('comment_context',{...out,mediaVersion:1,id});})();pending.set(id,job);try{return await job;}finally{pending.delete(id);}
}
export async function commentReplyTarget(user,c,target){
 if(!target||target==='current')return c.externalCommentId;
 if(target!=='parent'||c.kind!=='comment')fail('Đích trả lời không hợp lệ.');
 const context=await commentContext(user,c.id);if(!context.parent?.id||context.parent.deleted)fail('Không đọc được bình luận gốc để trả lời.');
 return context.parent.id;
}
