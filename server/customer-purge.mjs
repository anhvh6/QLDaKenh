import {unlinkSync} from 'node:fs';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {all,get,put,remove,db,transaction,now,uid,audit,getSupabaseHeaders,SUPABASE_URL,dataDir} from './store.mjs';
import {permission,fail} from './domain.mjs';
import {assertChannel} from './taophacdo.mjs';
import {studentCareState} from './student-care.mjs';
import {groupLearner} from '../public/group-learner.js';
import {progressFor,learnerStages} from '../public/learner-progress.js';
const links=['customerId','conversationId','orderId','handoffId','planId','messageId','jobId','runId','shipmentId','taskId','botRunId','assetId'];
const excluded=new Set(['settings','connections','templates','assets','products','chatbots','chatbot_routes','ai_connections','customer_purge_jobs','chat_purge_tombstones']);
export function purgeScope(user,input){
 permission(user,'inbox');if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)fail('Chọn 1–100 hội thoại.');
 const state=studentCareState(),customers=new Set(),selected=new Set();
 for(const item of input.items){const c=get('conversations',item.id);if(!c||c.deletedAt||c.kind==='comment'||selected.has(c.id))fail('Hội thoại không hợp lệ.',404);assertChannel(user,c.connectionId);if(c.version!==item.version)fail('Hội thoại đã thay đổi. Mở lại xác nhận.',409);selected.add(c.id);const learner=groupLearner(state,c);if(c.threadType===1&&!learner)fail('Cần chọn học viên đại diện của nhóm trước khi xóa.');if(learner)customers.add(learner.id);if(c.customerId)customers.add(c.customerId);}
 const plans=all('study_plans'),planKeys=new Map(),aliases=new Map(),keysByCustomer=new Map(),groupLearners=new Map(),groupsByLearner=new Map();
 for(const p of plans)if(p.publishedAt){if(!planKeys.has(p.customerId))planKeys.set(p.customerId,[]);planKeys.get(p.customerId).push(p.id);}
 const keyFor=c=>[c.customer_id,c.planCustomerId,...(planKeys.get(c.id)||[])].filter(Boolean);
 for(const c of state.customers){const keys=keyFor(c);keysByCustomer.set(c.id,keys);for(const key of keys){if(!aliases.has(key))aliases.set(key,[]);aliases.get(key).push(c.id);}}
 for(const c of state.conversations)if(c.threadType===1){const id=groupLearner(state,c)?.id;groupLearners.set(c.id,id);if(id&&c.customerId){if(!groupsByLearner.has(id))groupsByLearner.set(id,[]);groupsByLearner.get(id).push(c.customerId);}}
 const queue=[...customers];for(let i=0;i<queue.length;i++){const id=queue[i],related=[...(groupsByLearner.get(id)||[]),...(keysByCustomer.get(id)||[]).flatMap(k=>aliases.get(k)||[])];for(const next of related)if(!customers.has(next)){customers.add(next);queue.push(next);}}
 const conversations=state.conversations.filter(c=>selected.has(c.id)||customers.has(c.customerId)||c.threadType===1&&customers.has(groupLearners.get(c.id)));
 const sending=new Set(db.prepare("SELECT json_extract(data,'$.conversationId') AS id FROM records WHERE (kind='messages' AND json_extract(data,'$.status')='sending') OR (kind='chatbot_jobs' AND json_extract(data,'$.status')='dispatching')").all().map(r=>r.id));
 for(const c of conversations){assertChannel(user,c.connectionId);if(c.purgePending)fail('Yêu cầu xóa đang được xử lý.',409);if(c.sending||sending.has(c.id))fail('Hội thoại đang gửi tin. Chờ hoàn tất trước khi xóa.',409);}
 const ids=new Set([...customers,...conversations.map(c=>c.id)]),records=db.prepare('SELECT kind,id,data,version FROM records ORDER BY kind,id').all().map(r=>({...r,data:JSON.parse(r.data)}));
 const references=new Map();for(const r of records){if(excluded.has(r.kind))continue;for(const id of new Set([r.id,...links.map(k=>r.data[k]).filter(v=>typeof v==='string')])){if(!references.has(id))references.set(id,[]);references.get(id).push(r);}}
 const rows=[],included=new Set(),work=[...ids];for(let i=0;i<work.length;i++)for(const r of references.get(work[i])||[]){const key=r.kind+':'+r.id;if(included.has(key))continue;included.add(key);rows.push(r);if(!ids.has(r.id)){ids.add(r.id);work.push(r.id);}}
 rows.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
 const ownedAssets=records.filter(r=>r.kind==='assets'&&ids.has(r.data.conversationId)),sharedRecords=ownedAssets.length?records.filter(r=>r.kind!=='assets'&&r.kind!=='customer_purge_jobs'&&r.kind!=='chat_purge_tombstones'&&!ids.has(r.id)).map(r=>JSON.stringify(r.data)):[];for(const asset of ownedAssets){const shared=sharedRecords.some(s=>s.includes(asset.id)||asset.data.url&&s.includes(asset.data.url));if(!shared){rows.push({kind:'assets',id:asset.id,version:asset.version});ids.add(asset.id);}}
 const profiles=state.customers.filter(c=>customers.has(c.id)).map(c=>{const stage=progressFor(state,c).stage;return {id:c.id,name:c.name,stage,stageName:learnerStages[stage]?.name||stage};});
 const learnerKeys=[...new Set([...state.customers.filter(c=>customers.has(c.id)).flatMap(c=>[c.customer_id,c.planCustomerId]),...plans.filter(p=>customers.has(p.customerId)&&p.publishedAt).map(p=>p.id)].filter(Boolean))];
 const scope={customerIds:[...customers],learnerKeys,conversationIds:conversations.map(c=>c.id),rows:rows.map(r=>({kind:r.kind,id:r.id,version:r.version})),profiles};
 const token=createHash('sha256').update(JSON.stringify(scope)).digest('hex');return {...scope,token};
}
export function purgePreview(user,input){const s=purgeScope(user,input);return {token:s.token,profiles:s.profiles,conversationCount:s.conversationIds.length,recordCount:s.rows.length,requiresStageConfirm:s.profiles.some(p=>p.stage!=='NEW')};}
async function remotePurge(s){if(process.env.PLAN_REMOTE_CATALOG==='0')return;const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/purge_customer_data',{method:'POST',headers:await getSupabaseHeaders(),body:JSON.stringify({p_customer_ids:s.customerIds,p_learner_keys:s.learnerKeys,p_conversation_ids:s.conversationIds,p_confirm:true}),signal:AbortSignal.timeout(60000)});const result=await r.json().catch(()=>null);if(!r.ok||result?.ok!==true)throw Error('Chưa xóa được dữ liệu Supabase; hội thoại được khóa và hệ thống sẽ thử lại.');}
function finish(job){
 const assetIds=new Set(job.scope.rows.filter(r=>r.kind==='assets').map(r=>r.id)),ids=new Set(job.scope.rows.map(r=>r.id));
 for(const asset of all('assets').filter(a=>job.scope.conversationIds.includes(a.conversationId)&&!assetIds.has(a.id)))put('assets',{...asset,conversationId:null});
 for(const asset of all('assets').filter(a=>assetIds.has(a.id))){const shared=db.prepare('SELECT kind,id,data FROM records').all().some(r=>r.kind!=='assets'&&r.kind!=='customer_purge_jobs'&&r.kind!=='chat_purge_tombstones'&&!ids.has(r.id)&&(r.data.includes(asset.id)||asset.url&&r.data.includes(asset.url)));if(shared){assetIds.delete(asset.id);ids.delete(asset.id);put('assets',{...asset,conversationId:null});continue;}if(/^\/uploads\/[^/\\]+$/.test(asset.url||'')){try{unlinkSync(join(dataDir,'uploads',basename(asset.url)));}catch(e){if(e.code!=='ENOENT')throw e;}}}
 transaction(()=>{for(const r of db.prepare('SELECT kind,id,data FROM records').all()){const data=JSON.parse(r.data);if(assetIds.has(r.id)||!excluded.has(r.kind)&&(ids.has(r.id)||links.some(k=>ids.has(data[k]))))remove(r.kind,r.id);}for(const e of db.prepare('SELECT id,payload FROM events').all()){try{if(ids.has(JSON.parse(e.payload).messageId))db.prepare('DELETE FROM events WHERE id=?').run(e.id);}catch{}}put('customer_purge_jobs',{id:job.id,status:'done',deletedIds:job.scope.conversationIds,completedAt:now()});put('notifications',{id:'customer-purge:'+job.id,recipientId:job.actor,title:'Đã xóa dữ liệu khách hàng',body:'Đã hoàn tất xóa '+job.scope.conversationIds.length+' hội thoại và dữ liệu liên quan trên hệ thống và Supabase.',route:'inbox',read:false});audit(job.actor,'customer_data_purged',job.id,{conversations:job.scope.conversationIds.length});});
}
let running=false;const processing=new Set();
async function processPurge(job,remote){if(processing.has(job.id))return;processing.add(job.id);try{await remote(job.scope);finish(job);}catch(e){put('customer_purge_jobs',{...job,error:e.message});throw e;}finally{processing.delete(job.id);}}
export async function resumePurges(remote=remotePurge){if(running)return;running=true;try{for(const job of all('customer_purge_jobs').filter(j=>j.status==='pending')){try{await processPurge(job,remote);}catch{}}}finally{running=false;}}
export async function purgeChats(user,input,remote=remotePurge){
 if(input.confirm!==true)fail('Cần xác nhận xóa dữ liệu.');const scope=purgeScope(user,input);if(input.previewToken!==scope.token)fail('Dữ liệu thay đổi. Mở lại bảng xác nhận.',409);if(scope.profiles.some(p=>p.stage!=='NEW')&&input.confirmStage!==true)fail('Cần xác nhận trạng thái hiện tại của học viên.');
 const job=transaction(()=>{const j=put('customer_purge_jobs',{id:uid('purge'),actor:user.id,status:'pending',scope});for(const id of scope.conversationIds){const c=get('conversations',id);put('chat_purge_tombstones',{id:c.connectionId+':'+(c.threadType||0)+':'+c.externalUserId,connectionId:c.connectionId,threadType:c.threadType||0,externalUserId:c.externalUserId,cutoff:now()});put('conversations',{...c,deletedAt:now(),purgePending:true,botManualOff:true});}return j;});
 if(input.async===true){void processPurge(job,remote).catch(()=>{});return {deletedIds:scope.conversationIds,pending:true,jobId:job.id};}
 try{await processPurge(job,remote);}catch(e){fail(e.message,503);}return {deletedIds:scope.conversationIds};
}
