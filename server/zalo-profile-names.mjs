import {db,get,put,now,transaction} from './store.mjs';
import {contactPhone} from './zalo-contact-card.mjs';
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_incoming_sender ON records(CAST(json_extract(data,'$.senderId') AS TEXT))
 WHERE kind='messages' AND json_extract(data,'$.direction')='incoming';`);
const decode=r=>({...JSON.parse(r.data),id:r.id,version:r.version});
export async function applyProfileNames(connectionId,profiles,{yieldWork=()=>new Promise(resolve=>setImmediate(resolve))}={}){
 const entries=Object.entries(profiles).map(([key,p])=>({p,uid:String(p.userId||p.uid||key),name:p.displayName||p.zaloName||p.display_name||p.zalo_name})).filter(p=>p.name);
 if(!entries.length)return;
 const ids=[...new Set(entries.map(p=>p.uid))],placeholders=ids.map(()=>'?').join(','),conversations=new Map(),messages=new Map();
 // Query each collection once per provider batch, never once per profile.
 for(const row of db.prepare(`SELECT id,data,version FROM records WHERE kind='conversations' AND json_extract(data,'$.connectionId')=? AND CAST(json_extract(data,'$.externalUserId') AS TEXT) IN (${placeholders})`).all(connectionId,...ids)){
  const c=decode(row);if(c.threadType===1)continue;const uid=String(c.externalUserId),rows=conversations.get(uid)||[];rows.push(c);conversations.set(uid,rows);
 }
 const rows=db.prepare(`SELECT m.id,m.data,m.version FROM records m JOIN records c ON c.kind='conversations' AND c.id=json_extract(m.data,'$.conversationId')
 WHERE m.kind='messages' AND json_extract(m.data,'$.direction')='incoming' AND CAST(json_extract(m.data,'$.senderId') AS TEXT) IN (${placeholders}) AND json_extract(c.data,'$.connectionId')=?`).all(...ids,connectionId);
 for(const row of rows){const m=decode(row),uid=String(m.senderId),list=messages.get(uid)||[];list.push(m);messages.set(uid,list);}
 for(const [index,{p,uid,name}] of entries.entries()){
  transaction(()=>{
   put('zalo_profiles',{id:connectionId+':'+uid,connectionId,userId:uid,name,avatar:p.avatar||'',syncedAt:now()});
   for(const original of conversations.get(uid)||[]){const c=get('conversations',original.id),customer=c&&get('customers',c.customerId);if(!c)continue;
    if(customer)put('customers',{...customer,name:customer.nameEditedLocally?customer.name:name,zaloAvatar:p.avatar||customer.zaloAvatar,phone:customer.phone||contactPhone(p.phoneNumber)});
    if([0,1].includes(Number(p.isFr)))put('conversations',{...c,isFriend:Number(p.isFr)===1,friendSyncedAt:now(),...(Number(p.isFr)===1?{friendRequestPending:false}:{})});
   }
   for(const original of messages.get(uid)||[]){const m=get('messages',original.id);if(m&&m.direction==='incoming'&&String(m.senderId)===uid&&get('conversations',m.conversationId)?.connectionId===connectionId&&m.senderName!==name)put('messages',{...m,senderName:name});}
  });
  if(index%10===9)await yieldWork();
 }
}
