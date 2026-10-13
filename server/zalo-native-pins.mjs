import {normalizeZaloPins} from './zalo-pins.mjs';
const {apiFactory,getClientMessageType}=await import(new URL('./utils.js',import.meta.resolve('zca-js')));
// Wire contracts verified against Zalo Web and zca-js board factories.
export function pinTopic(message){
 if(!message?.externalId||!(message.externalClientId||message.quoteSource?.cliMsgId))throw Error('Tin nhắn chưa có đủ mã Zalo. Đồng bộ lịch sử trước khi ghim.');
 return {type:2,color:-16777216,emoji:'',startTime:-1,duration:-1,repeat:0,src:-1,pinAct:1,params:JSON.stringify({global_msg_id:String(message.externalId),client_msg_id:String(message.externalClientId||message.quoteSource?.cliMsgId),senderUid:String(message.senderId||message.quoteSource?.uidFrom||'0'),senderName:message.senderName||'',msg_type:getClientMessageType(message.messageType||'webchat'),title:message.text||'Ảnh / video / tệp'})};
}
const mutate=apiFactory()((api,ctx,utils)=>async(c,message,pinned,topicId)=>{
 const group=c.threadType===1,response=group?await api.getListBoard({page:1,count:100},c.externalUserId):await api.getFriendBoardList(c.externalUserId),pins=normalizeZaloPins(response);
 const existing=pins.find(p=>topicId?p.id===topicId:p.externalId===String(message?.externalId));
 if(pinned&&existing||!pinned&&!existing)return;
 const domain=(group?api.zpwServiceMap.group_board:api.zpwServiceMap.friend_board)?.[0];if(!domain)throw Error('Zalo chưa cung cấp dịch vụ ghim.');
 let params,path,options;
 if(group){
  const topic=pinned?pinTopic(message):(response.items||[]).find(r=>String(r.data?.id)===existing.id)?.data;if(!topic)throw Error('Không tìm thấy tin ghim Zalo.');
  params={...topic,grid:c.externalUserId,imei:ctx.imei,pinAct:pinned?1:2,...(!pinned?{topicId:existing.id}:{}),params:typeof topic.params==='string'?topic.params:JSON.stringify(topic.params)};
  path=pinned?'/api/board/topic/createv2':'/api/board/topic/updatev2';options={method:'POST',body:new URLSearchParams({params:utils.encodeAES(JSON.stringify(params))})};
 }else{
  params={conversationId:c.externalUserId,version:response.version||0,lang:'vi',imei:ctx.imei,...(pinned?{topic:pinTopic({...message,senderId:message.senderId||message.quoteSource?.uidFrom||ctx.uid})}:{topics:[{topicId:existing.id,topicType:2}]})};
  path=pinned?'/api/friendboard/create':'/api/friendboard/multi_unpin';options={method:'GET'};
 }
 const url=utils.makeURL(domain+path,group?{}:{params:utils.encodeAES(JSON.stringify(params))});
 return utils.resolve(await utils.request(url,options));
});
export async function changeNativePin(api,c,message,pinned,topicId){return mutate(api.getContext(),api)(c,message,pinned,topicId);}
