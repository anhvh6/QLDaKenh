import {all,get,db,kindsRevision} from './store.mjs';
import {kinds} from './domain.mjs';
import {extraKinds,scopeState} from './taophacdo.mjs';
import {scopeCareChats} from './student-care.mjs';
import {filterDeletedChats} from './chat-delete.mjs';
import {filterDisconnectedChats} from '../public/chat-connection-state.js';
import {commentPresentation} from './comment-presentation.mjs';
export const commentsRevision=()=>kindsRevision(['conversations','connections','customers','templates','quick_reply_topics','tags','assets','media_categories','notifications','teams','team_members','channel_teams','settings','staff_handoffs','chat_reminders','orders','journeys','study_plans','learner_source_facts','plan_handoffs']);
export function commentsSnapshot(user,{revision,providers,users}={}){
 const state={user,providers,snapshotView:'comments',snapshotRevision:revision,commentsCompact:true,contentFeatures:{snapshot:true,thumbnails:true}};
 for(const k of [...kinds,...extraKinds,'staffHandoffs','chatMentions','chatbotRuns','chatbotConversations','savedPlanSummaries','chatPlanSummaries','mediaCategories'])state[k]=[];
 for(const k of ['connections','conversations','templates','quick_reply_topics','tags','assets','notifications','teams','team_members','channel_teams'])state[k]=all(k);
 filterDeletedChats(state);filterDisconnectedChats(state);state.conversations=commentPresentation(state.conversations);
 const peers=new Set(state.conversations.filter(c=>c.kind==='comment').map(c=>c.privateConversationId).filter(Boolean));
 state.conversations=state.conversations.filter(c=>c.kind==='comment'||peers.has(c.id));
 const customerIds=new Set(state.conversations.map(c=>c.customerId));state.customers=[...customerIds].map(id=>get('customers',id)).filter(Boolean);
 state.settings=get('settings','general')||{timezone:'Asia/Ho_Chi_Minh'};state.studentCareSettings=get('settings','student-care')||{stages:{}};state.careSettings=get('settings','care')||{slaMinutes:3};state.chatNameSettings=get('settings','chat-names')||{};state.users=users||db.prepare('SELECT id,name,email,role,active FROM users').all();
 state.mediaCategories=all('media_categories');state.mediaFavorites=get('settings','media-favorites-'+user.id)?.ids||[];
 if(user.role!=='owner')state.connections=state.connections.map(({accountId,apiVersion,...c})=>c);
 return scopeCareChats(scopeState(state,user),user,{includeExceptions:false});
}
