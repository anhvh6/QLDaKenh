import {messagePhones} from './chat-contact-data.js';
const cache=new Map(),pending=new Set();let H,observer,timer,running=false,scope='';
const key=id=>scope+':'+id;
function paint(){for(const box of document.querySelectorAll('[data-zalo-phone-slot]')){
 const data=cache.get(key(box.dataset.zaloPhoneSlot));box.replaceChildren();if(!data||data.until<Date.now())continue;
 const message=H.state.messages.find(m=>m.id===box.dataset.zaloPhoneSlot),phones=message?messagePhones(message):[];for(const item of data.matches.filter(item=>phones.includes(item.phone))){const b=document.createElement('button');b.type='button';b.className='message-zalo-phone';b.dataset.zaloPhoneChat=box.dataset.zaloPhoneSlot;b.dataset.phone=item.phone;b.dataset.connection=item.connectionId;b.title='Chat Zalo '+item.phone+' · '+item.channelName;b.setAttribute('aria-label',b.title);b.innerHTML='<span aria-hidden="true">Z</span>';box.append(b);}
}}
async function flush(){if(running||!pending.size)return;running=true;const messageIds=[...pending].slice(0,4),currentScope=scope,phoneKeys=new Map(messageIds.map(id=>[id,messagePhones(H.state.messages.find(m=>m.id===id)||{}).join(',')]));for(const id of messageIds)pending.delete(id);
 try{const result=await H.api('/chat/zalo-phone/lookup',{method:'POST',body:{messageIds}});if(currentScope!==scope)return;for(const row of result.results)cache.set(key(row.messageId),{...row,phones:phoneKeys.get(row.messageId),until:Date.now()+(row.retry?60000:row.matches.length?3600000:600000)});paint();}
 catch{if(currentScope===scope)for(const id of messageIds)cache.set(key(id),{matches:[],phones:phoneKeys.get(id),until:Date.now()+60000});}
 finally{running=false;if(pending.size)timer=setTimeout(flush,100);}
}
export function enhanceZaloPhoneChats(host,conversation){H=host;
 const nextScope=H.state.user.id+':'+H.state.connections.filter(c=>c.provider==='zalo_personal'&&c.status==='connected').map(c=>c.id).sort().join(',');if(scope!==nextScope){scope=nextScope;pending.clear();cache.clear();}
 const channel=H.state.connections.find(c=>c.id===conversation?.connectionId);observer?.disconnect();
 if(!channel||['zalo','zalo_personal'].includes(channel.provider)||!H.state.connections.some(c=>c.provider==='zalo_personal'&&c.mode==='api'&&c.status==='connected')){pending.clear();document.querySelectorAll('[data-zalo-phone-slot]').forEach(b=>b.remove());return;}
 observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const id=entry.target.dataset.message,old=cache.get(key(id));observer.unobserve(entry.target);if(!old||old.until<Date.now()){pending.add(id);clearTimeout(timer);timer=setTimeout(flush,100);}}},{root:document.querySelector('.chat-messages'),rootMargin:'100px'});
 const messages=new Map(H.state.messages.map(m=>[m.id,m]));for(const row of document.querySelectorAll('[data-message]')){const m=messages.get(row.dataset.message);if(!m||m.direction!=='incoming'||m.deletedAt||m.recalledAt||!messagePhones(m).length)continue;const old=cache.get(key(m.id));if(old&&old.phones!==messagePhones(m).join(','))cache.delete(key(m.id));const footer=row.querySelector('.message-under-actions');if(!footer)continue;let box=row.querySelector('[data-zalo-phone-slot]');if(!box){box=document.createElement('span');box.dataset.zaloPhoneSlot=m.id;box.className='message-zalo-phone-slot';footer.append(box);}observer.observe(row);}paint();
}
document.addEventListener('click',async event=>{const b=event.target.closest('[data-zalo-phone-chat]');if(!b||!H)return;event.preventDefault();event.stopImmediatePropagation();if(b.disabled)return;b.disabled=true;try{
 const result=await H.api('/chat/zalo-phone/open',{method:'POST',body:{messageId:b.dataset.zaloPhoneChat,phone:b.dataset.phone,connectionId:b.dataset.connection}}),c=result.conversation;
 const previous=H.state.conversations.find(v=>v.id===c.id);if(previous)Object.assign(previous,c);else H.state.conversations.push(c);
 if(result.customer){const p=H.state.customers.find(p=>p.id===result.customer.id);if(p)Object.assign(p,result.customer);else H.state.customers.push(result.customer);}
 H.openConversation(c.id);
 }catch(error){H.toast(error.message,true);cache.delete(key(b.dataset.zaloPhoneChat));b.remove();}finally{b.disabled=false;}
},true);
