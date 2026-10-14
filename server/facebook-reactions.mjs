import {remote} from './connectors.mjs';
import {secret} from './store.mjs';
export async function reactFacebookMessage(channel,conversation,message,reaction,request=remote){
 const reactions={heart:'❤️',like:'👍',haha:'😆',wow:'😮',cry:'😢',angry:'😡'};
 if(!reactions[reaction]||!message.externalId||!conversation.externalUserId)throw Error('Tin nhắn chưa có đủ mã Facebook để thả cảm xúc.');
 const result=await request(`https://graph.facebook.com/${channel.apiVersion||process.env.META_GRAPH_VERSION||'v25.0'}/${encodeURIComponent(channel.accountId)}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret(channel.id).token},body:JSON.stringify({recipient:{id:conversation.externalUserId},sender_action:'react',payload:{message_id:message.externalId,reaction:reactions[reaction]}})});
 if(result.success!==true&&!result.recipient_id&&!result.message_id)throw Error('Facebook chưa xác nhận cảm xúc. Kiểm tra trên Messenger trước khi thử lại.');
 return result;
}
