import {createHash} from 'node:crypto';
import {db,get,put,remove} from './store.mjs';

export const communicationLock = Symbol('communication platform lock');
export const communicationAutomatic = Symbol('communication automatic sender');
const locks=new Map();
const platform=provider=>['zalo','zalo_personal'].includes(provider)?'zalo':provider;
export const messageFingerprint=(text,assetIds=[])=>createHash('sha256').update(JSON.stringify([String(text||'').normalize('NFC').trim().replace(/\s+/gu,' '),[...assetIds].sort()])).digest('hex');
export async function withPlatformSend(provider,send){
 provider=platform(provider);
 const previous=locks.get(provider)||Promise.resolve();let release;const current=new Promise(resolve=>release=resolve);locks.set(provider,current);
 await previous;try{return await send();}finally{release();if(locks.get(provider)===current)locks.delete(provider);}
}
function state(provider){
 const saved=get('communication_send_state',provider);if(saved)return saved;
 const row=db.prepare(`SELECT m.data FROM records m JOIN records c ON c.kind='conversations' AND c.id=json_extract(m.data,'$.conversationId') JOIN records ch ON ch.kind='connections' AND ch.id=json_extract(c.data,'$.connectionId') WHERE m.kind='messages' AND (CASE WHEN json_extract(ch.data,'$.provider')='zalo_personal' THEN 'zalo' ELSE json_extract(ch.data,'$.provider') END)=? AND coalesce(json_extract(c.data,'$.kind'),'message')!='comment' AND json_extract(m.data,'$.direction')='outgoing' AND json_extract(m.data,'$.status') IN ('accepted','sent','delivered','read','demo','unknown','sending') AND coalesce(json_extract(m.data,'$.history'),0)=0 ORDER BY coalesce(json_extract(m.data,'$.sentAt'),json_extract(m.data,'$.createdAt')) DESC,m.id DESC LIMIT 1`).get(provider);
 const m=row&&JSON.parse(row.data),at=m?Date.parse(m.sentAt||m.createdAt):0;
 if(m?.communicationCampaignId)put('communication_send_content',{id:provider+':'+messageFingerprint(m.text,(m.attachments||[]).map(a=>a.assetId||a.url)),manualSeq:0,sentAt:at});
 return put('communication_send_state',{id:provider,lastSentAt:at||0,lastFingerprint:m?messageFingerprint(m.text,(m.attachments||[]).map(a=>a.assetId||a.url)):'',manualSeq:0,manualRecent:[]});
}
export function recordStaffSend(provider,text,assetIds,time=Date.now(),messageId=''){
 provider=platform(provider);
 const s=state(provider),hash=messageFingerprint(text,assetIds),seq=s.manualSeq+1;
 if(messageId&&s.manualRecent.some(m=>m.messageId===messageId))return;
 const recent=[{hash,seq,messageId,at:time},...s.manualRecent.filter(m=>m.hash!==hash)].slice(0,2);
 put('communication_send_state',{...s,lastSentAt:Math.max(s.lastSentAt,time),lastFingerprint:time>=s.lastSentAt?hash:s.lastFingerprint,observedStaffAt:Math.max(s.observedStaffAt||0,time),manualSeq:seq,manualRecent:recent});
}
// Only confirmed outgoing staff messages count. Incoming messages, notes, AI,
// imported history and failed/uncertain sends never release a campaign.
function observeStaffSends(provider){
 const s=state(provider),since=s.observedStaffAt||0;
 const rows=db.prepare(`SELECT m.id,m.data FROM records m JOIN records c ON c.kind='conversations' AND c.id=json_extract(m.data,'$.conversationId') JOIN records ch ON ch.kind='connections' AND ch.id=json_extract(c.data,'$.connectionId') WHERE m.kind='messages' AND (CASE WHEN json_extract(ch.data,'$.provider')='zalo_personal' THEN 'zalo' ELSE json_extract(ch.data,'$.provider') END)=? AND coalesce(json_extract(c.data,'$.kind'),'message')!='comment' AND json_extract(m.data,'$.direction')='outgoing' AND json_extract(m.data,'$.status') IN ('accepted','sent','delivered','read','demo') AND coalesce(json_extract(m.data,'$.history'),0)=0 AND json_extract(m.data,'$.communicationCampaignId') IS NULL AND json_extract(m.data,'$.botId') IS NULL AND coalesce(json_extract(m.data,'$.senderType'),'staff')!='ai' AND json_extract(m.data,'$.deletedAt') IS NULL AND coalesce(json_extract(m.data,'$.sentAt'),json_extract(m.data,'$.createdAt'))>? ORDER BY coalesce(json_extract(m.data,'$.sentAt'),json_extract(m.data,'$.createdAt')),m.id`).all(provider,new Date(since).toISOString());
 let observed=since;for(const row of rows){const m=JSON.parse(row.data),at=Date.parse(m.sentAt||m.createdAt);observed=Math.max(observed,at);recordStaffSend(provider,m.text,(m.attachments||[]).map(a=>a.assetId||a.url),at,row.id);}
 if(observed>since)put('communication_send_state',{...state(provider),observedStaffAt:observed});
}
export function communicationSendWait(provider,text,assetIds,time=Date.now()){
 provider=platform(provider);
 observeStaffSends(provider);const s=state(provider),hash=messageFingerprint(text,assetIds),prior=get('communication_send_content',provider+':'+hash);
 if(s.lastFingerprint===hash||prior&&!s.manualRecent.some(m=>m.seq>prior.manualSeq&&m.at>prior.sentAt&&m.hash!==hash))return {code:'duplicate',message:'Chờ nhân viên gửi nội dung khác trên cùng nền tảng trước khi gửi lại tin trùng.'};
 if(time<s.lastSentAt+3000)return {code:'spacing',message:'Chờ tối thiểu 3 giây sau tin gửi trước trên cùng nền tảng.',until:new Date(s.lastSentAt+3000).toISOString()};
 return null;
}
export function reserveCommunicationSend(provider,text,assetIds,time){
 provider=platform(provider);
 const s=state(provider),id=provider+':'+messageFingerprint(text,assetIds),old=get('communication_send_content',id);
 put('communication_send_content',{id,manualSeq:s.manualSeq,sentAt:time});put('communication_send_state',{...s,lastSentAt:Math.max(s.lastSentAt,time),lastFingerprint:messageFingerprint(text,assetIds)});
 return ()=>{if(old)put('communication_send_content',old);else remove('communication_send_content',id);put('communication_send_state',{...state(provider),lastFingerprint:s.lastFingerprint});};
}
export function finishCommunicationSend(provider,time,text,assetIds=[]){provider=platform(provider);const s=state(provider);put('communication_send_state',{...s,lastSentAt:Math.max(s.lastSentAt,time),...(text!==undefined?{lastFingerprint:messageFingerprint(text,assetIds)}:{})});}
