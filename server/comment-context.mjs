import {all,get,put,secret,now} from './store.mjs';
import {remote} from './connectors.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';

const pending=new Map();
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
function contextError(label,error,provider){
 const message=String(error?.message||error||'');
 if(provider==='facebook'&&(/pages_read_engagement|Page Public Content Access|code 10|subcode 33|Unsupported get request/i.test(message)))return `${label}: Meta chưa cho token hiện tại đọc chi tiết bài viết/bình luận. Hãy kết nối lại Facebook Page và cấp quyền pages_read_engagement.`;
 return `${label}: ${message.replace(/\s*·\s*(?:code|subcode|trace)\b.*$/i,'').trim()||'Không đọc được dữ liệu.'}`;
}
export function summarizeComment(item,local={}){
 return {id:String(item.id||local.externalId||''),text:String(item.message??item.text??local.text??''),name:item.from?.name||item.username||local.senderName||'Người bình luận',createdAt:item.created_time||item.timestamp||local.createdAt||'',likes:item.like_count??local.likeCount??null,dislikes:null,deleted:!!local.deletedAt,parentId:String(item.parent?.id||item.replied_to?.id||local.parentCommentId||'')};
}
export function localCommentContext(c){
 const root=all('messages').find(m=>m.conversationId===c.id&&m.externalId===c.externalCommentId)||all('messages').find(m=>m.conversationId===c.id&&m.direction==='incoming');
 const current=summarizeComment({},root||{}),parent=current.parentId&&current.parentId!==c.postId?all('messages').find(m=>m.externalId===current.parentId&&get('conversations',m.conversationId)?.connectionId===c.connectionId):null;
 return {conversationId:c.id,post:{id:c.postId||'',text:c.postTitle||'',url:safeUrl(c.postUrl),createdAt:c.postCreatedAt||'',likes:null,shares:null,comments:null},current,parent:parent?summarizeComment({},parent):null,parentId:current.parentId&&current.parentId!==c.postId?current.parentId:'',errors:[],loadedAt:''};
}
export async function commentContext(user,id,request=remote){
 permission(user,'inbox');const c=get('conversations',id);if(!c||c.kind!=='comment'||c.deletedAt)fail('Không tìm thấy bình luận.',404);assertChannel(user,c.connectionId);
 const channel=get('connections',c.connectionId);if(channel?.status!=='connected')fail('Kênh chưa kết nối.',409);
 // Only Facebook supports the object-detail fields used below. Rebuild local
 // context before consulting the cache so stale Graph errors from older builds
 // disappear immediately for Blogger, Threads and the other providers.
 if(channel.mode==='demo'||channel.provider!=='facebook'){const out=localCommentContext(c);out.loadedAt=now();return put('comment_context',{...out,id});}
 const cached=get('comment_context',id);if(cached&&Date.now()-Date.parse(cached.loadedAt)<60000)return cached;
 if(pending.has(id))return pending.get(id);
 const job=(async()=>{const out=localCommentContext(c);
 const threads=channel.provider==='threads',base=threads?'https://graph.threads.net/v1.0':`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}`;
 const read=(object,fields)=>request(base+'/'+encodeURIComponent(object)+'?'+new URLSearchParams({fields}),{headers:{Authorization:'Bearer '+secret(channel.id).token}});
 const jobs=[];
 if(c.postId)jobs.push((async()=>{try{const p=await read(c.postId,threads?'id,text,timestamp,permalink':'id,message,created_time,permalink_url,likes.limit(0).summary(true),comments.limit(0).summary(true),shares');out.post={id:p.id||c.postId,text:p.message||p.text||out.post.text,url:safeUrl(p.permalink_url||p.permalink)||out.post.url,createdAt:p.created_time||p.timestamp||out.post.createdAt,likes:p.likes?.summary?.total_count??null,comments:p.comments?.summary?.total_count??null,shares:p.shares?.count??null};if(threads){try{const stats=await request(base+'/'+encodeURIComponent(c.postId)+'/insights?metric=likes,replies,shares',{headers:{Authorization:'Bearer '+secret(channel.id).token}});for(const row of stats.data||[]){const key={likes:'likes',replies:'comments',shares:'shares'}[row.name];if(key)out.post[key]=row.values?.[0]?.value??row.total_value?.value??null;}}catch(e){out.errors.push(contextError('Chỉ số bài viết',e,channel.provider));}}}catch(e){out.errors.push(contextError('Bài viết',e,channel.provider));}})());
 jobs.push((async()=>{try{const item=await read(c.externalCommentId,threads?'id,text,timestamp,username,replied_to':'id,message,from,created_time,like_count,parent');out.current=summarizeComment(item,out.current);out.parentId=out.current.parentId&&out.current.parentId!==c.postId?out.current.parentId:'';}catch(e){out.errors.push(contextError('Bình luận',e,channel.provider));}
 if(out.parentId){try{const parent=await read(out.parentId,threads?'id,text,timestamp,username,replied_to':'id,message,from,created_time,like_count,parent');out.parent=summarizeComment(parent,out.parent||{});}catch(e){out.errors.push(contextError('Bình luận gốc',e,channel.provider));}}})());
 await Promise.all(jobs);out.loadedAt=now();return put('comment_context',{...out,id});})();pending.set(id,job);try{return await job;}finally{pending.delete(id);}
}
export async function commentReplyTarget(user,c,target){
 if(!target||target==='current')return c.externalCommentId;
 if(target!=='parent'||c.kind!=='comment')fail('Đích trả lời không hợp lệ.');
 const context=await commentContext(user,c.id);if(!context.parent?.id||context.parent.deleted)fail('Không đọc được bình luận gốc để trả lời.');
 return context.parent.id;
}
