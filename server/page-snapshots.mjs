import {all,get,kindsRevision} from './store.mjs';
import {kinds} from './domain.mjs';
import {extraKinds,scopeState} from './taophacdo.mjs';
import {scopeCareChats} from './student-care.mjs';
import {filterDeletedChats} from './chat-delete.mjs';
import {filterDisconnectedChats} from '../public/chat-connection-state.js';
import {operationalReportTotals} from '../public/report-model.js';
import {orderPOSFields} from './order-workspace.mjs';
import {contentSnapshot} from './content-snapshot.mjs';
import {copyStateSummary} from './copy-state-summary.mjs';
const permissions=['teams','team_members','channel_teams','settings','learner_source_facts','journeys','staff_handoffs','chat_reminders','study_plans','plan_handoffs'];
export const contentRevision=()=>kindsRevision(['contents','publications','assets','connections','campaigns','products','notifications','customers','conversations','orders','copy_posts','copy_videos','copy_plans','copy_sources',...permissions]);
export const pageRevision=view=>view==='products'?kindsRevision(['products','settings']):view==='reports'?kindsRevision(['publications','connections','customers','conversations','orders','payments','returns',...permissions]):kindsRevision(['contents','publications','assets','connections','campaigns','products','notifications','copy_posts','copy_videos','copy_plans','copy_sources','copy_plan_items','customers','conversations','orders','payments','returns',...permissions]);
function base(user,{revision,providers,users},view){const state={user,providers,snapshotView:view,snapshotRevision:revision,pageCompact:true,settings:get('settings','general')||{name:'Mộc Workspace',timezone:'Asia/Ho_Chi_Minh'},users,mediaFavorites:[],mediaCategories:[],copyPlanCalendar:[],copyPlanSummaries:[],savedPlanSummaries:[],chatPlanSummaries:[],staffHandoffs:[],chatMentions:[],chatbotRuns:[],chatbotConversations:[],aiConnections:[],chatbots:[],chatbotRoutes:[],notificationConversationIds:[],conversationCare:[]};for(const key of [...kinds,...extraKinds])if(key!=='settings')state[key]=[];return state;}
export function pageSnapshot(view,user,options){
 if(view==='products'){const state=base(user,options,view);state.products=all('products');return state;}
 let state=view==='calendar'?{...contentSnapshot(user,options),snapshotView:view,pageCompact:true}:base(user,options,view);
 for(const key of ['conversations','customers','orders','payments','returns','connections','journeys','chat_reminders'])state[key]=all(key);
 if(view==='reports')state.publications=all('publications');
 filterDeletedChats(state);filterDisconnectedChats(state);state=scopeCareChats(scopeState(state,user),user,{includeExceptions:false});
 if(view==='calendar'){Object.assign(state,copyStateSummary(user.id,all));state.orders=[];state.payments=[];state.returns=[];return state;}
 state.orders=orderPOSFields(state.orders);state.operationalReportTotals=operationalReportTotals(state);
 state.orders=state.orders.map(({id,source,status,total,paid})=>({id,source,status,total,paid}));
 for(const key of ['customers','conversations','connections','publications','payments','returns','journeys','chat_reminders','conversationCare','notificationConversationIds'])state[key]=[];
 return state;
}
