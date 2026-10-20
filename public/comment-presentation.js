export const commentAwaitingReply=c=>c.lastCommentDirection==='incoming';
export function commentCardTime(value,now=new Date()){
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
 const day=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
 return day(d)===day(new Date(now))?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}).format(d):new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit'}).format(d);
}
export function commentProfileURL(c,channel){
 const explicit=c?.authorProfileUrl;try{if(explicit){const u=new URL(explicit);if(u.protocol==='https:')return u.href;}}catch{}
 const id=String(c?.externalUserId||'');if(!id||id===String(c?.externalCommentId||''))return '';
 if(channel?.provider==='facebook'&&/^\d+$/.test(id))return 'https://www.facebook.com/profile.php?id='+encodeURIComponent(id);
 if(channel?.provider==='youtube'&&/^UC[\w-]+$/.test(id))return 'https://www.youtube.com/channel/'+id;
 return '';
}
export function commentPrivateChat(c,channel,conversations){
 if(!c?.privateConversationId||channel?.status!=='connected'||!['facebook','zalo','zalo_personal'].includes(channel.provider))return null;
 return conversations.find(peer=>peer.id===c.privateConversationId&&peer.connectionId===c.connectionId&&peer.kind!=='comment'&&!peer.deletedAt&&peer.threadType!==1)||null;
}
import {conversationConnected} from './chat-connection-state.js';
export const visibleComment=(S,c)=>c.kind==='comment'&&!c.deletedAt&&!c.remoteDeleted&&conversationConnected(S,c);
export const commentMatchesTags=(c,tags=[])=>!tags.length||tags.some(t=>(c.tags||[]).includes(t));
export const unreadCommentCount=S=>S.conversations.filter(c=>visibleComment(S,c)&&c.unread).length;
export function commentLikeState(message,liked){return {...message,liked,likeCount:Math.max(0,Number(message.likeCount||0)+(Number(liked)-Number(!!message.liked)))};}
