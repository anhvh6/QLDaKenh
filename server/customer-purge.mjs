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
 const keyFor=c=>[c.customer_id,c.planCustomerId,...all('study_plans').filter(p=>p.customerId===c.id&&p.publishedAt).map(p=>p.id)].filter(Boolean);
 for(let pass=0;pass<10;pass++){const before=customers.size,keys=new Set(state.customers.filter(c=>customers.has(c.id)).flatMap(keyFor));for(const c of state.customers)if(keyFor(c).some(k=>keys.has(k)))customers.add(c.id);for(const c of state.conversations)if(c.threadType===1&&customers.has(groupLearner(state,c)?.id)&&c.customerId)customers.add(c.customerId);if(before===customers.size)break;}
 const conversations=state.conversations.filter(c=>selected.has(c.id)||customers.has(c.customerId)||c.threadType===1&&customers.has(groupLearner(state,c)?.id));
 for(const c of conversations){assertChannel(user,c.connectionId);if(c.purgePending)fail('Yêu cầu xóa đang được xử lý.',409);if(c.sending||all('messages').some(m=>m.conversationId===c.id&&m.status==='sending')||all('chatbot_jobs').some(j=>j.conversationId===c.id&&j.status==='dispatching'))fail('Hội thoại đang gửi tin. Chờ hoàn tất trước khi xóa.',409);}
 const ids=new Set([...customers,...conversations.map(c=>c.id)]),records=db.prepare('SELECT kind,id,data,version FROM records ORDER BY kind,id').all().map(r=>({...r,data:JSON.parse(r.data)}));
 let rows=[];for(let pass=0;pass<50;pass++){rows=records.filter(r=>!excluded.has(r.kind)&&(ids.has(r.id)||links.some(k=>typeof r.data[k]==='string'&&ids.has(r.data[k]))));const before=ids.size;for(const r of rows)ids.add(r.id);if(ids.size===before)break;if(pass===49)fail('Quá nhiều liên kết; cần kiểm tra trước khi xóa.');}
 const ownedAssets=records.filter(r=>r.kind==='assets'&&ids.has(r.data.conversationId));for(const asset of ownedAssets){const shared=records.some(r=>r.kind!=='assets'&&r.kind!=='customer_purge_jobs'&&r.kind!=='chat_purge_tombstones'&&!ids.has(r.id)&&(JSON.stringify(r.data).includes(asset.id)||asset.data.url&&JSON.stringify(r.data).includes(asset.data.url)));if(!shared){rows.push({kind:'assets',id:asset.id,version:asset.version});ids.add(asset.id);}}
 const profiles=state.customers.filter(c=>customers.has(c.id)).map(c=>{const stage=progressFor(state,c).stage;return {id:c.id,name:c.name,stage,stageName:learnerStages[stage]?.name||stage};});
 const learnerKeys=[...new Set([...state.customers.filter(c=>customers.has(c.id)).flatMap(c=>[c.customer_id,c.planCustomerId]),...all('study_plans').filter(p=>customers.has(p.customerId)&&p.publishedAt).map(p=>p.id)].filter(Boolean))];
 const scope={customerIds:[...customers],learnerKeys,conversationIds:conversations.map(c=>c.id),rows:rows.map(r=>({kind:r.kind,id:r.id,version:r.version})),profiles};
 const token=createHash('sha256').update(JSON.stringify(scope)).digest('hex');return {...scope,token};
}
export function purgePreview(user,input){const s=purgeScope(user,input);return {token:s.token,profiles:s.profiles,conversationCount:s.conversationIds.length,recordCount:s.rows.length,requiresStageConfirm:s.profiles.some(p=>p.stage!=='NEW')};}
async function remotePurge(s){if(process.env.PLAN_REMOTE_CATALOG==='0')return;const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/purge_customer_data',{method:'POST',headers:await getSupabaseHeaders(),body:JSON.stringify({p_customer_ids:s.customerIds,p_learner_keys:s.learnerKeys,p_conversation_ids:s.conversationIds,p_confirm:true}),signal:AbortSignal.timeout(60000)});const result=await r.json().catch(()=>null);if(!r.ok||result?.ok!==true)throw Error('Chưa xóa được dữ liệu Supabase; hội thoại được khóa và hệ thống sẽ thử lại.');}
function finish(job){
 const assetIds=new Set(job.scope.rows.filter(r=>r.kind==='assets').map(r=>r.id)),ids=new Set(job.scope.rows.map(r=>r.id));
 for(const asset of all('assets').filter(a=>job.scope.conversationIds.includes(a.conversationId)&&!assetIds.has(a.id)))put('assets',{...asset,conversationId:null});
 for(const asset of all('assets').filter(a=>assetIds.has(a.id))){const shared=db.prepare('SELECT kind,id,data FROM records').all().some(r=>r.kind!=='assets'&&r.kind!=='customer_purge_jobs'&&r.kind!=='chat_purge_tombstones'&&!ids.has(r.id)&&(r.data.includes(asset.id)||asset.url&&r.data.includes(asset.url)));if(shared){assetIds.delete(asset.id);ids.delete(asset.id);put('assets',{...asset,conversationId:null});continue;}if(/^\/uploads\/[^/\\]+$/.test(asset.url||'')){try{unlinkSync(join(dataDir,'uploads',basename(asset.url)));}catch(e){if(e.code!=='ENOENT')throw e;}}}
 transaction(()=>{for(const r of db.prepare('SELECT kind,id,data FROM records').all()){const data=JSON.parse(r.data);if(assetIds.has(r.id)||!excluded.has(r.kind)&&(ids.has(r.id)||links.some(k=>ids.has(data[k]))))remove(r.kind,r.id);}for(const e of db.prepare('SELECT id,payload FROM events').all()){try{if(ids.has(JSON.parse(e.payload).messageId))db.prepare('DELETE FROM events WHERE id=?').run(e.id);}catch{}}put('customer_purge_jobs',{id:job.id,status:'done',deletedIds:job.scope.conversationIds,completedAt:now()});audit(job.actor,'customer_data_purged',job.id,{conversations:job.scope.conversationIds.length});});
}
let running=false;
export async function resumePurges(remote=remotePurge){if(running)return;running=true;try{for(const job of all('customer_purge_jobs').filter(j=>j.status==='pending')){try{await remote(job.scope);finish(job);}catch(e){put('customer_purge_jobs',{...job,error:e.message});}}}finally{running=false;}}
export async function purgeChats(user,input,remote=remotePurge){
 if(input.confirm!==true)fail('Cần xác nhận xóa dữ liệu.');const scope=purgeScope(user,input);if(input.previewToken!==scope.token)fail('Dữ liệu thay đổi. Mở lại bảng xác nhận.',409);if(scope.profiles.some(p=>p.stage!=='NEW')&&input.confirmStage!==true)fail('Cần xác nhận trạng thái hiện tại của học viên.');
 const job=transaction(()=>{const j=put('customer_purge_jobs',{id:uid('purge'),actor:user.id,status:'pending',scope});for(const id of scope.conversationIds){const c=get('conversations',id);put('chat_purge_tombstones',{id:c.connectionId+':'+(c.threadType||0)+':'+c.externalUserId,connectionId:c.connectionId,threadType:c.threadType||0,externalUserId:c.externalUserId,cutoff:now()});put('conversations',{...c,deletedAt:now(),purgePending:true,botManualOff:true});}return j;});
 try{await remote(scope);finish(job);}catch(e){put('customer_purge_jobs',{...job,error:e.message});fail(e.message,503);}return {deletedIds:scope.conversationIds};
}
