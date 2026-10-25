import {kindsRevision,stateRevision} from './store.mjs';
import {inboxKinds} from './inbox-kinds.mjs';
// Publishing screens do not need an event for typing/presence/learner writes.
export function realtimeRevision(view){
 if(view==='inbox')return kindsRevision([...inboxKinds,'messages']);
 return view==='content'?kindsRevision(['contents','publications','assets','connections','campaigns','products','copy_posts','copy_videos','copy_plans','copy_sources','settings','teams','team_members','channel_teams']):stateRevision();
}
