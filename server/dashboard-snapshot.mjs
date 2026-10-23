import {dashboardScopeRevision} from './dashboard-aggregate.mjs';
import {db,get,all} from './store.mjs';
import {permittedChannels,extraKinds} from './taophacdo.mjs';
import {kinds} from './domain.mjs';
import {calendarDayKey} from '../public/calendar-model.js';
// Calendar range queries must not scan the entire publishing history.
db.exec(`CREATE INDEX IF NOT EXISTS idx_overview_publication_slot ON records(json_extract(data,'$.scheduleAt')) WHERE kind='publications';
 CREATE INDEX IF NOT EXISTS idx_overview_publication_content ON records(json_extract(data,'$.contentId')) WHERE kind='publications';
 CREATE INDEX IF NOT EXISTS idx_overview_copy_slot ON records(json_extract(data,'$.scheduleAt')) WHERE kind='copy_plan_items';
 CREATE INDEX IF NOT EXISTS idx_overview_reminder_slot ON records(json_extract(data,'$.dueAt')) WHERE kind='chat_reminders';`);
const pick=(row,fields)=>Object.fromEntries(['id','version',...fields].filter(k=>row?.[k]!==undefined).map(k=>[k,row[k]]));
function range(kind,field,start,end){return db.prepare(`SELECT id,version,data FROM records WHERE kind='${kind}' AND json_extract(data,'$.${field}')>=? AND json_extract(data,'$.${field}')<? ORDER BY json_extract(data,'$.${field}')`).all(start,end).map(r=>({...JSON.parse(r.data),id:r.id,version:r.version}));}
const pubFields=['contentId','connectionId','scheduleAt','status','title','updatedAt','createdAt','copyPlanId','copyPlanItemId'];
export function dashboardSnapshot(user,{aggregates,revision,providers,time=Date.now(),sourceRevision}={}){
 const allowed=permittedChannels(user),canChannel=id=>!allowed||allowed.has(id),day=calendarDayKey(new Date(time).toISOString()),midnight=Date.parse(day+'T00:00:00+07:00'),start=new Date(midnight-86400000).toISOString(),end=new Date(midnight+2*86400000).toISOString();
 const state={user,providers,snapshotRevision:revision,snapshotView:'dashboard',dashboardCompact:true};for(const key of [...kinds,...extraKinds,'staffHandoffs','chatMentions','chatbotRuns','chatbotConversations','aiConnections','chatbots','chatbotRoutes','mediaCategories','mediaFavorites','copyPlanCalendar','copyPlanSummaries','savedPlanSummaries','chatPlanSummaries','notificationConversationIds'])state[key]=[];
 state.connections=all('connections').filter(c=>canChannel(c.id)).map(c=>pick(c,['name','remoteName','provider','mode','status']));
 const rows=db.prepare("SELECT id,version,data FROM records WHERE kind='contents' ORDER BY updated_at DESC").iterate();
 for(const row of rows){const c={...JSON.parse(row.data),id:row.id,version:row.version};if(allowed&&(!(c.channels||[]).length||!c.channels.every(canChannel)))continue;state.contents.push(pick(c,['title','status','type','channels','updatedAt','createdAt']));if(state.contents.length===4)break;}
 state.dashboardRecentContentIds=state.contents.map(c=>c.id);
 state.publications=range('publications','scheduleAt',start,end).filter(p=>canChannel(p.connectionId)).map(p=>pick(p,pubFields));
 // Include statuses of the four recent posts, even outside the calendar window.
 const recent=new Set(state.dashboardRecentContentIds),pubIds=new Set(state.publications.map(p=>p.id));for(const id of recent){const rows=db.prepare("SELECT id,version,data FROM records WHERE kind='publications' AND json_extract(data,'$.contentId')=?").all(id);for(const row of rows){const p={...JSON.parse(row.data),id:row.id,version:row.version};if(canChannel(p.connectionId)&&!pubIds.has(p.id)){state.publications.push(pick(p,pubFields));pubIds.add(p.id);}}}
 const contentIds=new Set(state.contents.map(c=>c.id));for(const p of state.publications)if(p.contentId&&!contentIds.has(p.contentId)){const c=get('contents',p.contentId);if(c&&(!allowed||(c.channels||[]).length&&c.channels.every(canChannel))){state.contents.push(pick(c,['title','status','channels']));contentIds.add(c.id);}}
 const plans=new Map(all('copy_plans').filter(p=>p.userId===user.id).map(p=>[p.id,p]));for(const i of range('copy_plan_items','scheduleAt',start,end)){const plan=plans.get(i.planId),channels=i.channels||plan?.channels||[];if(!plan||i.userId!==user.id||!channels.every(canChannel))continue;const video=get('copy_videos',i.videoId);state.copyPlanCalendar.push({...pick(i,['contentId','planId','state','scheduleAt','updatedAt']),channels,title:video?.title||'Video',planName:plan.name||'',campaignId:plan.campaignId});}
 const convs=new Map(),customers=new Map();for(const r of range('chat_reminders','dueAt',start,end)){if(!['pending','done','completed','resolved'].includes(r.status))continue;const c=get('conversations',r.conversationId);if(!c||c.deletedAt||!canChannel(c.connectionId))continue;const ch=state.connections.find(ch=>ch.id===c.connectionId);if(!ch||['disconnected','revoked'].includes(ch.status))continue;state.chat_reminders.push(pick(r,['conversationId','customerId','connectionId','dueAt','status','title','assigneeIds','assignee','actor','updatedAt']));convs.set(c.id,pick(c,['connectionId','customerId','kind','unread','status']));const customer=get('customers',r.customerId||c.customerId);if(customer)customers.set(customer.id,pick(customer,['name']));}
 state.conversations=[...convs.values()];state.customers=[...customers.values()];state.users=[];state.settings=pick(get('settings','general')||{name:'MeGa Phương'},['name','timezone']);
 const totals=aggregates?.read('dashboard-counts:'+user.id+':'+user.role);
 // Administrator scope is all channels; ordinary data writes must not discard
 // the last successful aggregate. Restricted roles require the matching scope revision.
 if(totals&&(['owner','manager'].includes(user.role)||totals.scopeRevision===dashboardScopeRevision(user))){state.dashboardCounts=totals.counts;state.dashboardCountsUpdatedAt=totals.updatedAt;state.dashboardCountsStale=totals.stale||totals.sourceRevision!==sourceRevision;}else state.dashboardCountsPending=true;
 if(['owner','manager'].includes(user.role))state.dashboardLearnerOverview=aggregates?.read('learners:v1')||null;
 return state;
}
