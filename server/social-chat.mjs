import {all,get,put,now} from './store.mjs';
import {extraToken} from './social-extra.mjs';
import {remote} from './connectors.mjs';
import {ingestFacebookMessage} from './facebook-chat.mjs';
const running=new Set();
const html=s=>String(s||'').replace(/<br\s*\/?\s*>|<\/p>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
export async function socialChatRequest(c,method,path,body,request=remote){
 const token=await extraToken(c,request),headers={Authorization:'Bearer '+token};
 const base=c.provider==='bluesky'?'https://bsky.social/xrpc/':'https://mastodon.social/api/v1/';
 if(c.provider==='bluesky')headers['atproto-proxy']='did:web:api.bsky.chat#bsky_chat';
 if(body)headers['Content-Type']='application/json';
 return request(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
}
export async function syncSocialChat(c,request=remote){
 if(running.has(c.id))return;
 running.add(c.id);
 try{
  const state=get('social_chat_sync',c.id)||{},startedAt=state.startedAt||now();let imported=0,skippedGroups=0;
  const page=await socialChatRequest(c,'GET',c.provider==='bluesky'?'chat.bsky.convo.listConvos?limit=50':'conversations?limit=40',null,request);
  const threads=c.provider==='bluesky'?page.convos:page;
  if(!Array.isArray(threads))throw Error('Nền tảng chưa trả danh sách hội thoại hợp lệ.');
  for(const thread of threads){
   const peers=(c.provider==='bluesky'?thread.members:thread.accounts||[]).filter(p=>String(p.did||p.id)!==String(c.accountId));
   // Never collapse group conversations into a single recipient or risk replying publicly.
   if(peers.length!==1){skippedGroups++;continue;}
   const peer=peers[0],peerId=String(peer.did||peer.id);
   let items;
   if(c.provider==='bluesky'){
    const data=await socialChatRequest(c,'GET','chat.bsky.convo.getMessages?'+new URLSearchParams({convoId:thread.id,limit:'100'}),null,request);
    if(!Array.isArray(data.messages))throw Error('Bluesky chưa trả lịch sử tin nhắn.');
    items=data.messages.filter(m=>m.$type!=='chat.bsky.convo.defs#deletedMessageView').map(m=>({id:m.id,created_time:m.sentAt,message:m.text,from:{id:m.sender?.did},to:{data:[{id:peerId}]}}));
   }else{
    const last=thread.last_status;if(!last)continue;
    const context=await socialChatRequest(c,'GET','statuses/'+encodeURIComponent(last.id)+'/context',null,request);
    items=[...(context.ancestors||[]),last,...(context.descendants||[])].filter(m=>m.visibility==='direct').map(m=>({id:m.id,created_time:m.created_at,message:html(m.content),from:{id:m.account?.id},to:{data:[{id:peerId}]},attachments:(m.media_attachments||[]).map(a=>({type:a.type,url:a.url,name:a.description||'Tệp'}))}));
   }
   for(const item of items.sort((a,b)=>Date.parse(a.created_time)-Date.parse(b.created_time))){
    const m=ingestFacebookMessage(c,item,{history:Date.parse(item.created_time)<Date.parse(startedAt),unread:!!(thread.unread||thread.unreadCount),participant:{id:peerId,name:peer.displayName||peer.display_name||peer.handle||peer.acct}});
    if(m){const conv=get('conversations',m.conversationId);put('conversations',{...conv,socialThreadId:String(thread.id),socialPeerHandle:peer.acct||peer.handle||''});imported++;}
   }
  }
  put('social_chat_sync',{id:c.id,status:'ready',startedAt,syncedAt:now(),imported,skippedGroups,error:''});
 }catch(e){put('social_chat_sync',{...get('social_chat_sync',c.id),id:c.id,status:'error',syncedAt:now(),error:e.message});throw e;}finally{running.delete(c.id);}
}
export async function sendSocialChat(c,conv,text,options={},request=remote){
 if(options.assetRefs?.length)throw Error('Chat kênh này hiện hỗ trợ văn bản.');
 if(!text?.trim()||!conv.socialThreadId||!conv.externalUserId)throw Error('Cần đồng bộ hội thoại thật trước khi trả lời.');
 let r;
 if(c.provider==='bluesky')r=await socialChatRequest(c,'POST','chat.bsky.convo.sendMessage',{convoId:conv.socialThreadId,message:{text}},request);
 else{
  if(!conv.socialPeerHandle)throw Error('Thiếu địa chỉ người nhận Mastodon.');
  r=await socialChatRequest(c,'POST','statuses',{status:'@'+conv.socialPeerHandle+' '+text,visibility:'direct'},request);
  if(r.visibility!=='direct')throw Object.assign(Error('Mastodon chưa xác nhận chế độ tin nhắn riêng.'),{unknown:true});
 }
 if(!r?.id)throw Object.assign(Error('Nền tảng chưa xác nhận gửi tin. Không tự gửi lại.'),{unknown:true});
 return {id:String(r.id)};
}
export async function socialChatTick(){
 for(const c of all('connections').filter(c=>['mastodon','bluesky'].includes(c.provider)&&c.mode==='api'&&c.status==='connected')){
  const state=get('social_chat_sync',c.id);if(state?.syncedAt&&Date.now()-Date.parse(state.syncedAt)<(state.status==='error'?300000:30000))continue;
  try{await syncSocialChat(c);}catch{}
 }
}
