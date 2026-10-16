import {createHash} from 'node:crypto';
import {all,get,put,transaction,audit,now,db} from './store.mjs';
import {contactPhones,contactAddress,messagePhones} from '../public/chat-contact-data.js';
import {orderRoutingState} from './order-routing.mjs';
export function chatOrderSource(conversationId,messageId){
 if(!conversationId)return {};
 const conv=get('conversations',conversationId);if(!conv)return {};
 const messages=all('messages').filter(m=>m.conversationId===conv.id&&m.direction==='incoming'&&!m.deletedAt&&!m.recalledAt);
 let exact=messageId&&messages.find(m=>m.id===messageId);
 if(!exact&&messageId){const m=get('messages',messageId),group=m&&get('conversations',m.conversationId);if(group?.threadType===1&&group.connectionId===conv.connectionId&&String(m.senderId)===String(conv.externalUserId)&&m.direction==='incoming')exact=m;}
 const latest=exact||messages.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).find(m=>messagePhones(m).length===1||contactAddress(m.text));
 return {conversationId:conv.id,connectionId:conv.connectionId,...(latest?{sourceConversationId:latest.conversationId,sourceMessageId:latest.id,sourceMessageIds:[latest.id]}:{})};
}
export function observeChatOrder(conv,msg){
 if(!conv||conv.threadType===1||conv.kind==='comment'||msg.direction!=='incoming'||msg.deletedAt||msg.recalledAt)return null;
 const currentPhones=messagePhones(msg),currentAddress=contactAddress(msg.text);if(currentPhones.length>1||(!currentPhones.length&&!currentAddress))return null;
 const customer=get('customers',conv.customerId);if(!customer||customer.deletedAt)return null;
 const at=Date.parse(msg.createdAt||now()),rows=db.prepare("SELECT data FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction')='incoming' AND json_extract(data,'$.createdAt')>=? AND json_extract(data,'$.createdAt')<=? ORDER BY json_extract(data,'$.createdAt') DESC LIMIT 30").all(conv.id,new Date(at-86400000).toISOString(),new Date(at).toISOString()).map(r=>JSON.parse(r.data)).filter(m=>!m.deletedAt&&!m.recalledAt&&(!msg.senderId||!m.senderId||m.senderId===msg.senderId));
 if(!rows.some(m=>m.id===msg.id))rows.unshift(msg);
 let phone='',address='',phoneMessage='',addressMessage='';for(const m of rows){const phones=messagePhones(m);if(!phone&&phones.length===1){phone=phones[0];phoneMessage=m.id;}if(!address){const found=contactAddress(m.text);if(found){address=found;addressMessage=m.id;}}if(phone&&address)break;}
 if(!phone||!address)return null;
 return transaction(()=>{
  const existing=all('orders').find(o=>o.conversationId===conv.id&&!['cancelled','delivered','returned','completed'].includes(o.status)&&(o.phone===phone||o.autoDraft&&o.status==='draft'&&!o.items?.length));
  if(existing){if(existing.autoDraft&&existing.status==='draft'&&!existing.items?.length&&(existing.address!==address||existing.phone!==phone))return put('orders',{...existing,phone,address,sourceMessageId:msg.id,sourceMessageIds:[...new Set([...(existing.sourceMessageIds||[]),phoneMessage,addressMessage])]});return existing;}
  const digest=createHash('sha256').update(conv.id+':'+msg.id).digest('hex').slice(0,24),id='chat-order:'+digest;if(get('orders',id))return get('orders',id);
  const target=orderRoutingState().defaultTarget;
  const order=put('orders',{id,code:'CHAT-'+digest.slice(0,12).toUpperCase(),customerId:customer.id,receiverName:customer.name,phone,address,email:customer.email||'',items:[],subtotal:0,discount:0,shippingFee:0,total:0,paid:0,status:'draft',paymentStatus:'unpaid',requiresShipping:true,source:'Hội thoại',conversationId:conv.id,connectionId:conv.connectionId,sourceMessageId:msg.id,sourceMessageIds:[...new Set([phoneMessage,addressMessage])],autoDraft:true,awaitingProducts:true,createdBy:'system',...(target?{fulfillmentTarget:target}:{}),createdAt:msg.createdAt||now()});
  audit('system','chat_order_draft_created',order.id,{conversationId:conv.id,messageId:msg.id});return order;
 });
}
