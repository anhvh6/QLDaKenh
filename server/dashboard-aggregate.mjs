import {createHash} from 'node:crypto';
import {unreadThreadCount} from '../public/inbox-model.js';
import {operationalReportTotals} from '../public/report-model.js';
import {all,db,stateRevision} from './store.mjs';
import {scopeState} from './taophacdo.mjs';
import {scopeCareChats} from './student-care.mjs';
import {filterDeletedChats} from './chat-delete.mjs';
import {filterDisconnectedChats} from '../public/chat-connection-state.js';
import {dashboardData} from '../public/dashboard-model.js';
import {dashboardMessages} from './dashboard-state.mjs';
import {copyStateSummary} from './copy-state-summary.mjs';
import {orderPOSFields} from './order-workspace.mjs';
export const dashboardRevision=()=>stateRevision()+':'+JSON.stringify(db.prepare('SELECT id,role,active FROM users ORDER BY id').all());
export function dashboardScopeRevision(user){
 const rows=db.prepare("SELECT kind,id,version FROM records WHERE kind IN ('team_members','channel_teams','settings','learner_source_facts','journeys','study_plans','staff_handoffs') ORDER BY kind,id").all();
 return createHash('sha256').update(JSON.stringify([user.id,user.role,db.prepare('SELECT id,role,active FROM users ORDER BY id').all(),rows])).digest('hex');
}
export function dashboardCountsFor(user){
 const state={user};for(const key of ['assets','connections','contents','publications','conversations','customers','orders','tasks','journeys','chat_reminders','payments'])state[key]=all(key);
 state.staffHandoffs=all('staff_handoffs').filter(h=>['owner','manager'].includes(user.role)||h.assignedStaffId===user.id);
 state.messages=dashboardMessages();state.notifications=[];Object.assign(state,copyStateSummary(user.id,all));
 filterDeletedChats(state);filterDisconnectedChats(state);state.orders=orderPOSFields(state.orders);
 const scoped=scopeCareChats(scopeState(state,user),user),data=dashboardData(scoped);
 // Persist numeric counts only; never names, messages, phone numbers or tokens.
 return {scopeRevision:dashboardScopeRevision(user),counts:{...Object.fromEntries(Object.entries(data).map(([key,rows])=>[key,rows.length])),unreadInbox:unreadThreadCount(scoped)},reports:operationalReportTotals(scoped)};
}
export async function refreshDashboardCounts(store){
 const revision=dashboardRevision();
 for(const user of db.prepare('SELECT id,role,active FROM users WHERE active=1').all()){
  const key='dashboard-counts:'+user.id+':'+user.role,prior=store.read(key);
  if(prior&&prior.scopeRevision===dashboardScopeRevision(user)&&Date.now()-prior.updatedAt<60000)continue;
  await store.refresh(key,()=>dashboardCountsFor(user),{revision,minInterval:60000});
  await new Promise(resolve=>setImmediate(resolve));
 }
}
