import {all,get,audit} from './store.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel,permittedChannels} from './taophacdo.mjs';
import {messagePhones} from '../public/chat-contact-data.js';
import {lookupZaloPhone,openPhoneConversation} from './zalo.mjs';
const cache=new Map(),jobs=new Map();
async function verified(channel,phone,lookup,time){
 const key=channel.id+':'+phone,prior=cache.get(key);if(prior&&prior.until>time)return prior.profile;
 if(jobs.has(key))return jobs.get(key);
 const job=(async()=>{const profile=await lookup(channel.id,phone);cache.set(key,{profile,until:time+(profile?3600000:600000)});if(cache.size>1000)cache.delete(cache.keys().next().value);return profile;})().finally(()=>jobs.delete(key));jobs.set(key,job);return job;
}
function source(user,id){const m=get('messages',id),c=m&&get('conversations',m.conversationId);if(!m||m.deletedAt||m.recalledAt||m.direction!=='incoming'||!c||c.deletedAt)fail('Không tìm thấy tin nhắn của khách.',404);assertChannel(user,c.connectionId);const ch=get('connections',c.connectionId);if(!ch||['zalo','zalo_personal'].includes(ch.provider))fail('Chỉ áp dụng tin nhắn từ nền tảng khác Zalo.',422);return {m,c,phones:messagePhones(m)};}
export async function zaloPhoneChatRoute(path,method,input,user,{lookup=lookupZaloPhone,open=openPhoneConversation,time=Date.now()}={}){
 if(!['/api/chat/zalo-phone/lookup','/api/chat/zalo-phone/open'].includes(path)||method!=='POST')return undefined;
 permission(user,'inbox');const allowed=permittedChannels(user),channels=all('connections').filter(c=>c.provider==='zalo_personal'&&c.mode==='api'&&c.status==='connected'&&(!allowed||allowed.has(c.id)));
 if(path.endsWith('/lookup')){
  if(!Array.isArray(input.messageIds)||input.messageIds.length>20)fail('Chọn tối đa 20 tin nhắn.',422);
  const sources=[...new Set(input.messageIds)].map(id=>source(user,id)),results=[];
  for(const {m,phones} of sources){const matches=[];let retry=false;
   for(const phone of phones.slice(0,5))for(const ch of channels){try{const profile=await verified(ch,phone,lookup,time);if(profile){matches.push({phone,connectionId:ch.id,channelName:ch.name});break;}}catch{retry=true;}}
   results.push({messageId:m.id,matches,retry});
  }return {results};
 }
 const {phones}=source(user,input.messageId);if(!phones.includes(input.phone))fail('Số điện thoại không thuộc tin nhắn này.',422);
 const channel=channels.find(c=>c.id===input.connectionId);if(!channel)fail('Kênh Zalo không còn khả dụng.',409);assertChannel(user,channel.id);
 const c=await open(channel.id,input.phone);audit(user.id,'chat_open_zalo_from_message',c.id,{sourceMessageId:input.messageId});return {conversation:get('conversations',c.id)||c,customer:get('customers',c.customerId)};
}
