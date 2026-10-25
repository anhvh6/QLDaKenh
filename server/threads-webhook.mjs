import {createHmac,timingSafeEqual} from 'node:crypto';

// Threads notifications use topic/values, not Facebook's object/entry envelope.
// https://developers.facebook.com/documentation/threads/webhooks
export function threadsNotification(payload,appId=''){
 if(payload?.topic!=='moderate'||!['replies','delete'].includes(payload.values?.field))return null;
 if(appId&&String(payload.app_id)!==String(appId))return null;
 const item=payload.values.value;
 if(!item?.id)return null;
 const owner=payload.values.field==='delete'?item.owner?.owner_id:item.root_post?.owner_id;
 if(!owner)return null;
 return {ownerId:String(owner),field:payload.values.field,item,time:payload.time,appId:String(payload.app_id||'')};
}
export function validThreadsSignature(raw,signature,secrets){
 if(!/^sha256=[a-f0-9]{64}$/.test(String(signature)))return false;
 return secrets.filter(Boolean).some(key=>{
  const expected='sha256='+createHmac('sha256',key).update(raw).digest('hex');
  return timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
 });
}
