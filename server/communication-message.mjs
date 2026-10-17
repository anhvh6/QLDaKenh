import {createHash} from 'node:crypto';
import {all,get,db} from './store.mjs';
import {fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {assertCareConversation} from './student-care.mjs';
import {channelConnected} from '../public/chat-connection-state.js';
import {communicationProviders} from '../public/communication-model.js';
import {dayKey} from '../public/communication-model.js';
import {messageTimeMatches} from '../public/communication-message-model.js';
db.exec("CREATE INDEX IF NOT EXISTS idx_communication_template_runs ON records(json_extract(data,'$.templateId'),json_extract(data,'$.status')) WHERE kind='template_runs'; CREATE INDEX IF NOT EXISTS idx_communication_jobs_campaign ON records(json_extract(data,'$.campaignId'),json_extract(data,'$.customerId')) WHERE kind='communication_jobs'; CREATE INDEX IF NOT EXISTS idx_communication_job_run ON records(json_extract(data,'$.runId')) WHERE kind='communication_jobs';");
export function messageSettings(input,old){
 const audienceType=input.audienceType||old?.audienceType||'status';if(!['status','message'].includes(audienceType))fail('Chọn loại chiến dịch hợp lệ.');
 const number=(key,min,max,fallback)=>{const n=Number(input[key]??fallback);if(!Number.isInteger(n)||n<min||n>max)fail('Giá trị '+key+' phải từ '+min+' đến '+max+'.');return n;};
 const shared={audienceType,channelSelection:input.channelSelection||old?.channelSelection||'selected',maxSendsPerCustomer:number('maxSendsPerCustomer',0,1000,0),maxRetries:number('maxRetries',0,5,0),retryDelayMinutes:number('retryDelayMinutes',1,1440,5)};
 if(!['selected','all_active'].includes(shared.channelSelection))fail('Chọn cách áp dụng nền tảng hợp lệ.');
 if(audienceType==='status')return shared;
 const templateIds=input.templateIds;if(!Array.isArray(templateIds)||!templateIds.length||templateIds.length>500||templateIds.some(id=>typeof id!=='string'||!get('templates',id)||get('templates',id).enabled===false))fail('Chọn ít nhất một tin nhắn mẫu đang sử dụng.');
 const messageTiming=input.messageTiming||'days',messageExecution=input.messageExecution||'schedule',messageRepeat=input.messageRepeat||'daily',minutesRepeat=input.minutesRepeat||'daily';
 if(!['days','minutes'].includes(messageTiming)||!['now','schedule'].includes(messageExecution)||!['once','daily','weekly'].includes(messageRepeat)||!['once','daily'].includes(minutesRepeat))fail('Cấu hình thời gian theo tin nhắn không hợp lệ.');
 const daysMode=input.daysMode||'exact';if(!['exact','range'].includes(daysMode))fail('Chọn khoảng ngày hợp lệ.');const daysFrom=number('daysFrom',0,3650,1),daysTo=daysMode==='exact'?daysFrom:number('daysTo',0,3650,daysFrom);if(daysTo<daysFrom)fail('Ngày kết thúc khoảng lọc phải từ ngày bắt đầu trở lên.');
 if(!Array.isArray(input.messageTimes||[])||!Array.isArray(input.messageWeekdays||[]))fail('Lịch gửi phải là danh sách.');const messageTimes=[...new Set(input.messageTimes||[])].sort();if(!Array.isArray(input.messageTimes||[])||messageTimes.length>24||messageTimes.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))fail('Các khung giờ gửi không hợp lệ.');
 if(messageTiming==='days'&&(messageExecution==='schedule'||messageRepeat!=='once')&&!messageTimes.length)fail('Thêm ít nhất một khung giờ gửi.');
 const messageWeekdays=[...new Set(input.messageWeekdays||[])];if(!Array.isArray(input.messageWeekdays||[])||messageWeekdays.some(n=>!Number.isInteger(n)||n<1||n>7)||messageTiming==='days'&&messageRepeat==='weekly'&&!messageWeekdays.length)fail('Chọn ngày trong tuần hợp lệ.');
 return {...shared,templateIds:[...new Set(templateIds)],messageTiming,messageExecution,messageRepeat,minutesRepeat,messageTimes,messageWeekdays,daysMode,daysFrom,daysTo,waitMinutes:number('waitMinutes',1,43200,30)};
}
export const triggerKey=(c,conversationId,messageId)=>'communication-trigger:'+createHash('sha256').update(JSON.stringify([c.id,conversationId,messageId])).digest('hex');
function sendingPossible(c,v,user,time){
 const ch=get('connections',v.connectionId);if(!channelConnected(ch)||!Object.hasOwn(communicationProviders,ch.provider)||c.channelSelection!=='all_active'&&(!c.providers.includes(ch.provider)||c.connectionIds.length&&!c.connectionIds.includes(ch.id))||v.threadType===1||v.kind==='comment'||v.deletedAt||v.purgePending||v.groupUnavailable||v.sending)return false;
 try{assertChannel(user,ch.id);assertCareConversation(user,v);}catch{return false;}
 if(ch.mode!=='demo'&&(!v.externalUserId||ch.provider==='facebook'&&(!v.lastInboundAt||time-Date.parse(v.lastInboundAt)>86400000)))return false;
 return !c.blocks.some(b=>b.assetIds.some(id=>{const a=get('assets',id);return !a||a.active===false||a.connectionId&&a.connectionId!==ch.id||ch.provider==='zalo';}));
}
const latestStatement=()=>db.prepare("SELECT id,data FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction') IN ('incoming','outgoing') AND json_extract(data,'$.deletedAt') IS NULL ORDER BY json_extract(data,'$.createdAt') DESC,rowid DESC LIMIT 1");
function eligibleSource(m,run){return m?.direction==='outgoing'&&m.senderType!=='ai'&&!m.botId&&!m.communicationCampaignId&&!m.history&&['accepted','sent','received','demo'].includes(m.status)&&m.actor===run.actor;}
export function messageAudience(user,c,time,includeWaiting=false){
 const lower=c.messageTiming==='minutes'?0:Date.parse(dayKey(time-c.daysTo*86400000)+'T00:00:00+07:00');
 const runs=db.prepare("SELECT r.id,json_extract(r.data,'$.templateId') AS templateId,json_extract(r.data,'$.conversationId') AS conversationId,json_extract(r.data,'$.actor') AS actor,m.id AS lastId FROM records r JOIN records m ON m.kind='messages' AND m.id=json_extract(r.data,'$.messageIds[#-1]') WHERE r.kind='template_runs' AND json_extract(r.data,'$.status')='done' AND json_extract(r.data,'$.templateId') IN (SELECT value FROM json_each(?)) AND julianday(COALESCE(json_extract(m.data,'$.templateSentAt'),json_extract(m.data,'$.sentAt'),json_extract(m.data,'$.createdAt')))>=julianday(?)").all(JSON.stringify(c.templateIds),new Date(lower).toISOString());
 const byMessage=new Map(runs.filter(r=>r.lastId&&get('templates',r.templateId)?.enabled!==false&&get('templates',r.templateId)).map(r=>[r.lastId,r])),seen=new Set(),rows=[],latest=latestStatement();
 for(const r of runs){if(seen.has(r.conversationId))continue;seen.add(r.conversationId);const conv=get('conversations',r.conversationId);if(!conv||!sendingPossible(c,conv,user,time))continue;
  const last=latest.get(conv.id),run=last&&byMessage.get(last.id),m=last&&JSON.parse(last.data);if(!run||!eligibleSource(m,run))continue;
  const p=get('customers',conv.customerId);if(!p||p.mergedInto)continue;const sent=m.templateSentAt||m.sentAt||m.createdAt;if(!messageTimeMatches(c,sent,time,includeWaiting))continue;
  rows.push({conversationId:conv.id,customerId:p.id,name:p.name,connectionId:conv.connectionId,channelName:get('connections',conv.connectionId).name,provider:get('connections',conv.connectionId).provider,triggerMessageId:last.id,triggerTemplateId:run.templateId,triggerTemplateName:get('templates',run.templateId)?.name||run.templateId,triggerSentAt:sent,templateRunId:run.id,dueAt:c.messageTiming==='minutes'?new Date(Date.parse(sent)+c.waitMinutes*60000).toISOString():new Date(time).toISOString()});
 }
 return rows;
}
export function messageJobCurrent(user,c,job,time){
 const conv=get('conversations',job.conversationId),source=get('messages',job.triggerMessageId),run=get('template_runs',job.templateRunId);if(!conv||!source||!messageTimeMatches(c,source.templateSentAt||source.sentAt||source.createdAt,time,true)||!run||run.status!=='done'||!eligibleSource(source,run)||!c.templateIds.includes(run.templateId)||!get('templates',run.templateId)||get('templates',run.templateId).enabled===false||!sendingPossible(c,conv,user,time))return false;
 // The campaign's own accepted blocks may follow its trigger; any other message cancels the rest.
 const allowed=new Set([job.triggerMessageId,...job.messageIds||[],...job.failedMessageIds||[]]),tail=db.prepare("SELECT id FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction') IN ('incoming','outgoing') AND json_extract(data,'$.deletedAt') IS NULL AND (json_extract(data,'$.createdAt')>? OR json_extract(data,'$.createdAt')=? AND rowid>(SELECT rowid FROM records WHERE kind='messages' AND id=?))").all(conv.id,source.createdAt,source.createdAt,source.id);
 return tail.every(m=>allowed.has(m.id));
}
export function customerLimitReached(c,customerId,excludeId=''){
 if(!c.id||!c.maxSendsPerCustomer)return false;
 const rows=db.prepare("SELECT id,json_extract(data,'$.status') AS status,json_array_length(data,'$.messageIds') AS sent FROM records WHERE kind='communication_jobs' AND json_extract(data,'$.campaignId')=? AND json_extract(data,'$.customerId')=?").all(c.id,customerId);
 return rows.filter(j=>j.id!==excludeId&&(['queued','sending','done','unknown'].includes(j.status)||j.sent>0)).length>=c.maxSendsPerCustomer;
}
