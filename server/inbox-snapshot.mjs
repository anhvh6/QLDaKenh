import {all,get,db,kindsRevision} from './store.mjs';
import {kinds} from './domain.mjs';
import {extraKinds,scopeState} from './taophacdo.mjs';
import {scopeCareChats} from './student-care.mjs';
import {filterDeletedChats} from './chat-delete.mjs';
import {filterDisconnectedChats} from '../public/chat-connection-state.js';
import {commentPresentation} from './comment-presentation.mjs';
import {botState} from './chatbot.mjs';
import {studyPlanStatus} from './plan-access.mjs';
import {defaultNameSettings} from '../public/chat-names.js';
import {orderWorkspaceState} from './order-workspace.mjs';
import {orderRoutingState} from './order-routing.mjs';
import {chatWindow} from './chat-window.mjs';
import {inboxKinds} from './inbox-kinds.mjs';
export {inboxKinds} from './inbox-kinds.mjs';
export const inboxRevision=()=>kindsRevision(inboxKinds);
// Avoid hydrating publishing history, shipping/POS integrations and every message
// just to paint a conversation list. Existing permission/care scoping is retained.
export function inboxSnapshot(user,{revision,providers,users}={}){
 const state={user,providers,snapshotRevision:revision,snapshotView:'inbox',inboxCompact:true,contentFeatures:{snapshot:true,thumbnails:true}};
 for(const key of [...kinds,...extraKinds,'staffHandoffs','chatMentions','chatbotRuns','chatbotConversations','aiConnections','chatbots','chatbotRoutes','mediaCategories','mediaFavorites','copyPlanCalendar','copyPlanSummaries','savedPlanSummaries','chatPlanSummaries'])state[key]=[];
 const excluded=new Set(['settings','learner_source_facts','study_plans','chatbot_jobs','chatbot_runs','chatbots','chatbot_routes','ai_connections','staff_handoffs']);
 for(const key of inboxKinds)if(!excluded.has(key))state[key]=all(key);
 const facts=new Map(all('learner_source_facts').map(f=>[f.id,f]));state.customers=state.customers.map(c=>{const f=facts.get(c.id);if(!f)return c;const {id,version,createdAt,updatedAt,sourceUpdatedAt,...fields}=f;return {...c,...fields};});
 filterDeletedChats(state);filterDisconnectedChats(state);state.conversations=commentPresentation(state.conversations);
 // Bot eligibility still reads its definitions; empty presentation arrays must
 // not masquerade as cached database rows in botState's request-local cache.
 delete state.chatbots;
 Object.assign(state,botState(user,state,{compact:true}));
 const orders=new Map(state.orders.map(o=>[o.id,o])),customers=new Map(state.customers.map(c=>[c.id,c]));
 const plans=all('study_plans').filter(p=>!p.registrationOnly||p.customer?.video_date||p.customer?.is_customized);
 state.chatPlanSummaries=plans.map(p=>({customerId:p.customerId,startDate:p.customer?.start_date,endDate:p.customer?.end_date,link:p.customer?.link,status:studyPlanStatus(p,orders.get(p.lastOrderId))}));
 state.savedPlanSummaries=plans.map(p=>({id:p.id,customerId:p.customerId,handoffId:p.handoffId||'draft:'+p.customerId,name:p.customer?.customer_name||customers.get(p.customerId)?.name||'Học viên',phone:p.customer?.sdt||'',startDate:p.customer?.start_date,endDate:p.customer?.end_date,durationDays:p.customer?.duration_days||0,group:p.customer?.ma_vd||'',amount:Number(p.customer?.gia_tien||0),updatedAt:p.updatedAt,version:p.version,status:studyPlanStatus(p,orders.get(p.lastOrderId))}));
 state.settings=get('settings','general')||{name:'MeGa Phương',timezone:'Asia/Ho_Chi_Minh'};state.users=users||db.prepare('SELECT id,name,email,role,active FROM users').all();
 state.reminderDefaults=get('settings','chat-reminder-defaults-'+user.id)||null;state.chatFilters=get('settings','chat-filter-'+user.id)?.filters||null;state.chatNameSettings=get('settings','chat-names')||defaultNameSettings;state.studentCareSettings=get('settings','student-care')||{version:0,stages:{}};state.careSettings=get('settings','care')||{slaMinutes:3};
 state.mediaCategories=all('media_categories');state.mediaFavorites=get('settings','media-favorites-'+user.id)?.ids||[];
 state.orderWorkspace=orderWorkspaceState(user);state.orderRouting=orderRoutingState();state.integrations={};
 if(user.role!=='owner')state.connections=state.connections.map(({accountId,apiVersion,...c})=>c);
 const scoped=scopeCareChats(scopeState(state,user),user,{includeExceptions:false});
 const first=[...scoped.conversations].filter(c=>c.kind!=='comment'&&!c.careHidden).sort((a,b)=>String(b.lastAt||b.updatedAt).localeCompare(String(a.lastAt||a.updatedAt)))[0];
 if(first){scoped.initialChatWindow={conversationId:first.id,...chatWindow(first.id,new URLSearchParams({limit:'60'}),first.platformPins||[])};}
 return scoped;
}
