import {createHash} from 'node:crypto';
import {all,get,put,db,transaction,audit,now,stateRevision} from './store.mjs';
import {fail,permission,required,reply} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {assertCareConversation,studentCareState} from './student-care.mjs';
import {prepareLearnerLookups} from '../public/learner-lookups.js';
import {learnerStages} from '../public/learner-progress.js';
import {communicationProviders,matchingCommunicationStage,scheduledOccurrence} from '../public/communication-model.js';
// Idle workers read only pending IDs, never reload old message blocks every five seconds.
db.exec("CREATE INDEX IF NOT EXISTS idx_communication_job_status ON records(json_extract(data,'$.status')) WHERE kind='communication_jobs'; CREATE INDEX IF NOT EXISTS idx_communication_run_status ON records(json_extract(data,'$.status')) WHERE kind='communication_runs';");
const jobsWithStatus=status=>db.prepare("SELECT id FROM records WHERE kind='communication_jobs' AND json_extract(data,'$.status')=?").all(status).map(r=>get('communication_jobs',r.id));
const pendingRuns=()=>db.prepare("SELECT id FROM records WHERE kind='communication_runs' AND json_extract(data,'$.status')='queued'").all().map(r=>get('communication_runs',r.id));
function access(user){permission(user,'campaigns');permission(user,'inbox');}
function own(user,id){access(user);const c=get('communication_campaigns',id);if(!c)fail('Không tìm thấy chiến dịch.',404);if(c.actor!==user.id&&!['owner','manager'].includes(user.role))fail('Không có quyền với chiến dịch.',403);return c;}
function list(user){access(user);return all('communication_campaigns').filter(c=>c.actor===user.id||['owner','manager'].includes(user.role));}
function validate(user,input,old){
 access(user);const name=required(input.name,'Tên chiến dịch',150),newSendImmediately=input.newSendImmediately===true,mode=newSendImmediately?'automatic':input.mode,repeat=newSendImmediately?'once':input.repeat,status=input.status;
 if(!['automatic','manual'].includes(mode)||!['once','cycle'].includes(repeat)||!['active','paused'].includes(status))fail('Chọn chế độ và lịch chạy hợp lệ.');
 const array=(value,label,valid)=>{if(!Array.isArray(value)||value.length>500||value.some(v=>typeof v!=='string'||!valid(v)))fail(label+' không hợp lệ.');return [...new Set(value)];};
 const providers=array(input.providers,'Nền tảng',id=>Object.hasOwn(communicationProviders,id));if(!providers.length)fail('Chọn ít nhất một nền tảng.');
 const stages=array(input.stages,'Trạng thái',id=>Object.hasOwn(learnerStages,id));if(!stages.length)fail('Chọn ít nhất một trạng thái.');
 const connectionIds=array(input.connectionIds||[],'Kênh',id=>{const ch=get('connections',id);if(!ch||!providers.includes(ch.provider)||ch.status!=='connected'&&!(old&&status==='paused'&&old.connectionIds.includes(id)))return false;assertChannel(user,id);return true;});
 if(newSendImmediately&&(stages.length!==1||stages[0]!=='NEW'))fail('Gửi ngay chỉ áp dụng cho trạng thái Người mới.');
 const start=Date.parse(input.startAt),end=input.endAt?Date.parse(input.endAt):null;if(!Number.isFinite(start)||input.endAt&&!Number.isFinite(end)||end!==null&&end<=start)fail('Khoảng thời gian áp dụng không hợp lệ.');
 if(!newSendImmediately&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendTime||''))fail('Chọn giờ gửi theo giờ Việt Nam.');
 const integer=(key,low=0,high=3650)=>{const n=Number(input[key]);if(!Number.isInteger(n)||n<low||n>high)fail(key+' phải từ '+low+' đến '+high+'.');return n;};
 if(!newSendImmediately&&mode==='automatic'&&repeat==='once'&&Date.parse(new Date(start+7*3600000).toISOString().slice(0,10)+'T'+input.sendTime+':00+07:00')<start)fail('Giờ gửi một lần phải từ thời điểm bắt đầu trở đi, trong cùng ngày.');
 if(!Array.isArray(input.blocks)||input.blocks.length<1||input.blocks.length>20)fail('Thêm từ 1 đến 20 tin nhắn.');
 const blocks=input.blocks.map(b=>{const text=String(b.text||'').trim();if(text.length>5000||providers.includes('facebook')&&Array.from(text.replaceAll('{{name}}','Khách hàng')).length>1800)fail('Nội dung vượt giới hạn nền tảng (Messenger: tối đa 1800 ký tự trong chiến dịch).');const assetIds=array(b.assetIds||[],'Tệp đính kèm',id=>{const a=get('assets',id);if(!a||a.active===false||!(a.scopes||['chat']).includes('chat')||!/^\/uploads\/asset_[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(a.url))return false;if(a.connectionId)assertChannel(user,a.connectionId);return true;});if(providers.includes('zalo')&&assetIds.length)fail('Zalo OA hiện chỉ hỗ trợ văn bản trong chiến dịch. Bỏ chọn OA để gửi tệp qua Zalo cá nhân hoặc Messenger.');if(assetIds.length>10||!text&&!assetIds.length)fail('Mỗi tin cần nội dung hoặc tối đa 10 tệp thư viện.');return {text,assetIds};});
 return {newSendImmediately,name,description:String(input.description||'').slice(0,2000),mode,repeat,status,providers,stages,connectionIds,blocks,startAt:new Date(start).toISOString(),endAt:end!==null?new Date(end).toISOString():'',sendTime:newSendImmediately?'':input.sendTime,intervalDays:newSendImmediately?1:integer('intervalDays',1),beforeExpiryDays:integer('beforeExpiryDays'),afterExpiryDays:integer('afterExpiryDays'),afterStudyDays:integer('afterStudyDays'),afterDepositDays:integer('afterDepositDays'),newNonFriendOnly:input.newNonFriendOnly===true,actor:old?.actor||user.id};
}
export function communicationAudience(user,c,time=Date.now()){
 access(user);const state=studentCareState();state.journeyEvents=all('journey_events');state.communicationState=prepareLearnerLookups({...state,chatNameSettings:{...state.chatNameSettings,expiringDays:Math.max(1,c.beforeExpiryDays)}});
 state.firstContactByCustomer=new Map();if(c.stages.includes('NEW')){
  const first=db.prepare("SELECT id,json_extract(data,'$.direction') AS direction,json_extract(data,'$.createdAt') AS createdAt,json_extract(data,'$.conversationId') AS conversationId FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction') IN ('incoming','outgoing') AND json_extract(data,'$.deletedAt') IS NULL ORDER BY json_extract(data,'$.createdAt'),id LIMIT 1");
  for(const v of state.conversations.filter(v=>v.threadType!==1&&v.kind!=='comment')){const m=first.get(v.id),old=state.firstContactByCustomer.get(v.customerId);if(m&&(!old||m.createdAt<old.createdAt||m.createdAt===old.createdAt&&m.id<old.id))state.firstContactByCustomer.set(v.customerId,m);}
 }
const customers=new Map(state.customers.map(p=>[p.id,p])),channels=new Map(state.connections.map(ch=>[ch.id,ch])),dedupe=new Set(),rows=[];
 for(const conv of [...state.conversations].sort((a,b)=>String(b.lastAt||'').localeCompare(String(a.lastAt||'')))){
  const ch=channels.get(conv.connectionId);if(!ch||ch.status!=='connected'||!c.providers.includes(ch.provider)||c.connectionIds.length&&!c.connectionIds.includes(ch.id)||conv.threadType===1||conv.kind==='comment'||conv.deletedAt||conv.purgePending||conv.groupUnavailable)continue;
  try{assertChannel(user,ch.id);assertCareConversation(user,conv);}catch{continue;}
  const p=customers.get(conv.customerId),stage=matchingCommunicationStage(c,p,{...conv,provider:ch.provider},state,time);if(!stage)continue;
  const key=ch.id+':'+(conv.externalUserId||conv.customerId);if(dedupe.has(key))continue;
  if(c.blocks.some(b=>b.assetIds.some(id=>{const a=get('assets',id);return !a||a.active===false||a.connectionId&&a.connectionId!==ch.id;})))continue;
  dedupe.add(key);rows.push({conversationId:conv.id,customerId:p.id,name:p.name,connectionId:ch.id,channelName:ch.name,provider:ch.provider,stage});
 }
 return rows;
}
function runs(c){return all('communication_runs').filter(r=>r.campaignId===c.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
function availableAudience(user,c,time){const previous=all('communication_jobs').filter(j=>j.campaignId===c.id&&j.status!=='cancelled');return communicationAudience(user,c,time).filter(r=>!previous.some(j=>j.conversationId===r.conversationId&&(r.stage==='NEW'||['queued','sending','unknown'].includes(j.status))));}
function enqueue(user,c,occurrence,time,onlyConversation=null){
 const runId='comm:'+createHash('sha256').update(c.id+':'+occurrence).digest('hex');if(get('communication_runs',runId))return get('communication_runs',runId);
 const audience=availableAudience(user,c,time).filter(r=>!onlyConversation||r.conversationId===onlyConversation);return transaction(()=>{const run=put('communication_runs',{id:runId,campaignId:c.id,actor:user.id,occurrence,status:audience.length?'queued':'done',count:audience.length,configRevision:c.configRevision});for(const person of audience)put('communication_jobs',{id:runId+':'+person.conversationId,runId,campaignId:c.id,actor:user.id,configRevision:c.configRevision,...person,blocks:c.blocks,status:'queued',nextBlock:0,messageIds:[]});audit(user.id,'communication_queued',c.id,{runId,count:audience.length});return run;});
}
export async function communicationRoute(path,method,input,user){
 if(!path.startsWith('/api/communication-campaigns'))return;
 access(user);const m=path.match(/^\/api\/communication-campaigns(?:\/([^/]+)(?:\/(preview|run|history))?)?$/);if(!m)fail('Không tìm thấy chức năng.',404);const id=m[1],action=m[2];
 if(id==='preview'&&method==='POST'){const data=validate(user,input),rows=communicationAudience(user,{...data,newSince:now()});return {count:rows.length,recipients:rows.slice(0,100)};}
 if(!id&&method==='GET')return list(user).map(c=>({...c,lastRun:runs(c)[0]||null}));
 if(!id&&method==='POST'){const data=validate(user,input),created=now();const c=put('communication_campaigns',{...data,newSince:created,immediateSince:created,configRevision:1});audit(user.id,'communication_created',c.id);return c;}
 const c=own(user,id);
 if(action==='history'&&method==='GET'){const history=runs(c).slice(0,30),ids=new Set(history.map(r=>r.id));return {runs:history,jobs:all('communication_jobs').filter(j=>ids.has(j.runId)).slice(0,300).map(({blocks,...j})=>({...j,blockCount:blocks?.length||0}))};}
 if(action==='preview'&&method==='POST'){const data=input.name?{...validate(user,input,c),id:c.id,newSince:c.newSince}:c,rows=availableAudience(user,data);return {count:rows.length,recipients:rows.slice(0,100)};}
 if(action==='run'&&method==='POST'){if(c.newSendImmediately)fail('Chiến dịch này tự trả lời khi nhận tin nhắn mới, không gửi hàng loạt thủ công.');if(input.version!==c.version)fail('Chiến dịch đã thay đổi. Xem lại người nhận và nội dung trước khi gửi.',409);if(c.status!=='active')fail('Bật chiến dịch trước khi gửi.');if(Date.now()<Date.parse(c.startAt)||c.endAt&&Date.now()>Date.parse(c.endAt))fail('Chưa trong thời gian áp dụng.');if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId||''))fail('Thiếu mã lượt gửi.');return enqueue(user,c,'manual:'+input.requestId,Date.now());}
 if(!action&&method==='PATCH'){
  if(input.version!==c.version)fail('Chiến dịch vừa thay đổi. Mở lại để chỉnh sửa.',409);
  const data=validate(user,input,c);return transaction(()=>{const saved=put('communication_campaigns',{...c,...data,immediateSince:data.newSendImmediately&&data.status==='active'&&(c.status!=='active'||!c.newSendImmediately)?now():c.immediateSince,configRevision:c.configRevision+1},c.version);for(const j of all('communication_jobs').filter(j=>j.campaignId===id&&j.status==='queued'))put('communication_jobs',{...j,status:'cancelled',error:'Cấu hình thay đổi; lượt cũ đã dừng.'});audit(user.id,'communication_updated',id);return saved;});
 }
 fail('Phương thức không hợp lệ.',405);
}
let running=false;const immediateRevisions=new Map();
export function recoverCommunication(){for(const j of jobsWithStatus('sending'))put('communication_jobs',{...j,status:'unknown',error:'Máy chủ khởi động lại lúc gửi. Kiểm tra hội thoại trước khi gửi lại.'});}
export async function communicationTick(time=Date.now(),send=reply){
 if(running)return;running=true;
 try{
  const campaigns=all('communication_campaigns').filter(c=>c.status==='active');const users=new Map();const actor=id=>{if(!users.has(id))users.set(id,db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id));return users.get(id);};
  for(const c of campaigns){const u=actor(c.actor);if(!u?.active)continue;try{access(u);
   if(c.newSendImmediately){
    if(time<Date.parse(c.startAt)||c.endAt&&time>Date.parse(c.endAt))continue;
    const revision=stateRevision()+':'+c.configRevision;if(immediateRevisions.get(c.id)===revision)continue;
    for(const recipient of availableAudience(u,c,time)){
     const first=db.prepare("SELECT id,data FROM records WHERE kind='messages' AND json_extract(data,'$.conversationId')=? AND json_extract(data,'$.direction')='incoming' AND json_extract(data,'$.deletedAt') IS NULL ORDER BY json_extract(data,'$.createdAt'),id LIMIT 1").get(recipient.conversationId),m=first&&JSON.parse(first.data);
     // Historical imports never trigger an instant reply, including a recent history sync.
     if(!m||m.history===true||!m.pushReceivedAt||Date.parse(m.pushReceivedAt)<Math.max(Date.parse(c.newSince),Date.parse(c.startAt),Date.parse(c.immediateSince||c.newSince)))continue;
     enqueue(u,c,'incoming:'+first.id,time,recipient.conversationId);
    }
    immediateRevisions.set(c.id,stateRevision()+':'+c.configRevision);
   }else{const at=scheduledOccurrence(c,time);if(at)enqueue(u,c,at,time);}
  }catch(error){console.error('Communication schedule:',error.message);}}
  const jobs=jobsWithStatus('queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  for(const job of jobs){const c=get('communication_campaigns',job.campaignId),u=actor(job.actor),conv=get('conversations',job.conversationId);
   if(!c||c.status!=='active'||c.configRevision!==job.configRevision||!u?.active||c.endAt&&time>Date.parse(c.endAt)){put('communication_jobs',{...job,status:'cancelled',error:'Chiến dịch hết hạn, đã dừng hoặc thay đổi.'});continue;}
   try{access(u);if(!conv||!communicationAudience(u,c,time).some(r=>r.conversationId===conv.id))throw Error('Khách hàng không còn thỏa điều kiện gửi.');
    const block=job.blocks[job.nextBlock],text=block.text.replaceAll('{{name}}',get('customers',job.customerId)?.name||'bạn');
    put('communication_jobs',{...job,status:'sending',startedAt:now()});const msg=await send(u,conv.id,{text,assetIds:block.assetIds,version:conv.version});
    if(get('connections',conv.connectionId)?.mode!=='demo'&&!msg.externalId&&!msg.externalMessages?.length)throw Object.assign(Error('Nền tảng chưa trả mã xác nhận. Kiểm tra hội thoại trước khi gửi lại.'),{unknown:true});
    if(['unknown','failed'].includes(msg.status))throw Object.assign(Error(msg.error||'Chưa xác nhận kết quả gửi.'),{unknown:msg.status==='unknown'});
    put('communication_jobs',{...get('communication_jobs',job.id),status:job.nextBlock+1===job.blocks.length?'done':'queued',nextBlock:job.nextBlock+1,messageIds:[...job.messageIds,msg.id],lastSentAt:now()});
   }catch(error){put('communication_jobs',{...get('communication_jobs',job.id),status:error.unknown?'unknown':'failed',error:String(error.message).slice(0,1000)});}
   break;
  }
  for(const r of pendingRuns()){const js=db.prepare("SELECT json_extract(data,'$.status') AS status FROM records WHERE kind='communication_jobs' AND json_extract(data,'$.runId')=?").all(r.id);if(js.every(j=>!['queued','sending'].includes(j.status)))put('communication_runs',{...r,status:js.some(j=>['failed','unknown'].includes(j.status))?'attention':'done',finishedAt:now()});}
 }finally{running=false;}
}
