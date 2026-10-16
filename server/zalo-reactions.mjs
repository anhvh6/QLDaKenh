import {createHash} from 'node:crypto';
import {db,get,put,transaction} from './store.mjs';

const icons={'/-heart':['heart','❤️'],'/-strong':['like','👍'],':>':['haha','😆'],':o':['wow','😮'],':-((':['cry','😢'],':-h':['angry','😡'],':-*':['kiss','😘'],":')":['joy','😂'],'/-shit':['shit','💩'],'/-rose':['rose','🌹'],'/-break':['broken-heart','💔'],'/-weak':['dislike','👎'],';xx':['love','😍'],';-/':['confused','😕'],';-)':['wink','😉'],'/-fade':['fade','🥀'],'/-li':['sun','☀️'],'/-bd':['birthday','🎂'],'/-bome':['bomb','💣'],'/-ok':['ok','👌'],'/-v':['peace','✌️'],'/-thanks':['thanks','🙏'],'/-punch':['punch','👊'],'/-share':['share','🤝'],'_()_':['pray','🙏'],'/-no':['no','🙅'],'/-bad':['bad','😒'],'/-loveu':['love-you','🤟'],'--b':['sad','😓'],':((':['very-sad','😭'],'x-)':['cool','😎'],'8-)':['nerd','🤓'],';-d':['smile','😁'],'b-)':['sunglasses','😎'],':--|':['neutral','😐'],'p-(':['sad-face','😞'],':-bye':['bye','👋'],'|-)':['sleepy','😴'],':wipe':['wipe','😅'],':-dig':['dig','🤔'],'&-(':['anguish','😣'],':handclap':['clap','👏'],'>-|':['angry-face','😠'],':-f':['chair','🪑'],':-l':['chair','🪑'],':-r':['chair','🪑'],';-x':['silent','🤐'],':-o':['surprise','😯'],';-s':['embarrassed','😳'],';-a':['afraid','😨'],':-<':['sad','😔'],':))':['laugh','😄'],'$-)':['rich','🤑'],'/-beer':['beer','🍺']};
db.exec(`CREATE INDEX IF NOT EXISTS idx_zalo_reaction_target ON records(json_extract(data,'$.connectionId'),json_extract(data,'$.thread'),json_extract(data,'$.type'),json_extract(data,'$.targetId')) WHERE kind='zalo_reaction_events';
CREATE INDEX IF NOT EXISTS idx_zalo_reaction_client ON records(json_extract(data,'$.connectionId'),json_extract(data,'$.thread'),json_extract(data,'$.type'),json_extract(data,'$.clientId')) WHERE kind='zalo_reaction_events';`);
const validId=id=>id!==undefined&&id!==null&&String(id)!=='0'&&String(id)!=='';
function apply(event){
 const c=db.prepare("SELECT id FROM records WHERE kind='conversations' AND json_extract(data,'$.connectionId')=? AND json_extract(data,'$.externalUserId')=? AND coalesce(json_extract(data,'$.threadType'),0)=? AND json_extract(data,'$.deletedAt') IS NULL").get(event.connectionId,event.thread,event.type);
 if(!c)return false;
 const rows=db.prepare("SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND (json_extract(data,'$.externalId')=? OR EXISTS(SELECT 1 FROM json_each(json_extract(records.data,'$.externalMessages')) WHERE json_extract(value,'$.id')=?))").all(c.id,event.targetId,event.targetId);
 if(!rows.length&&event.clientId)rows.push(...db.prepare("SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND (json_extract(data,'$.externalClientId')=? OR EXISTS(SELECT 1 FROM json_each(json_extract(records.data,'$.externalMessages')) WHERE json_extract(value,'$.clientId')=?))").all(c.id,event.clientId,event.clientId));
 if(rows.length!==1)return false;const m=get('messages',rows[0].id);if(m.deletedAt||m.recalledAt||m.direction==='note')return false;
 const reactor=event.self?'platform:'+event.connectionId:'zalo:'+event.actor,clock=m.zaloReactionClock?.[reactor];
 if(clock&&(clock.time>event.time||clock.time===event.time&&clock.action.localeCompare(event.action,undefined,{numeric:true})>=0))return true;
 const reactions=(m.reactions||[]).filter(r=>r.reactor!==reactor);
 if(event.icon){const [reaction,emoji]=icons[event.icon]||['custom',/\p{Extended_Pictographic}/u.test(event.icon)?event.icon:'🙂'];reactions.push({reactor,senderId:event.actor,senderName:event.name,reaction,emoji,sourceIcon:event.icon,source:'zalo'});}
 put('messages',{...m,reactions,zaloReactionClock:{...m.zaloReactionClock,[reactor]:{time:event.time,action:event.action}}});return true;
}
export function ingestZaloReaction(connectionId,reaction){
 if(get('connections',connectionId)?.provider!=='zalo_personal')return 0;
 const d=reaction?.data;let content=d?.content;if(typeof content==='string'){try{content=JSON.parse(content);}catch{return 0;}}
 const thread=String(reaction?.threadId||''),actor=String(d?.uidFrom||'');if(!thread||!actor||!Array.isArray(content?.rMsg)||typeof content.rIcon!=='string')return 0;
 const type=reaction.isGroup?1:0,time=Number(d.ts)||0,action=String(d.actionId||d.msgId||d.cliMsgId||'');let count=0;
 transaction(()=>{for(const target of content.rMsg.slice(0,100)){
  if(!validId(target.gMsgID)&&!validId(target.cMsgID))continue;
  const event={connectionId,thread,type,actor,self:reaction.isSelf===true,name:String(d.dName||''),icon:content.rIcon,targetId:validId(target.gMsgID)?String(target.gMsgID):'',clientId:validId(target.cMsgID)?String(target.cMsgID):'',time,action};
  const id=createHash('sha256').update(JSON.stringify(event)).digest('hex');if(get('zalo_reaction_events',id)?.applied)continue;
  const applied=apply(event);put('zalo_reaction_events',{...event,id,applied});if(applied)count++;
 }});return count;
}
export function flushZaloReactions(connectionId,conversation,message){
 const ids=[message.externalId,...(message.externalMessages||[]).map(m=>m.id)].filter(validId).map(String),clients=[message.externalClientId,...(message.externalMessages||[]).map(m=>m.clientId)].filter(validId).map(String);if(!ids.length&&!clients.length)return;
 const query=(field,values)=>values.length?db.prepare(`SELECT id FROM records WHERE kind='zalo_reaction_events' AND json_extract(data,'$.connectionId')=? AND json_extract(data,'$.thread')=? AND json_extract(data,'$.type')=? AND json_extract(data,'$.${field}') IN (${values.map(()=>'?').join(',')}) AND json_extract(data,'$.applied')=0`).all(connectionId,String(conversation.externalUserId),conversation.threadType===1?1:0,...values):[];
 for(const row of [...query('targetId',ids),...query('clientId',clients)]){const event=get('zalo_reaction_events',row.id);if(!event?.applied&&apply(event))put('zalo_reaction_events',{...event,applied:true});}
}
