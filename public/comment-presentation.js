export const commentAwaitingReply=c=>c.lastCommentDirection==='incoming';
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
