import {kindsRevision,stateRevision} from './store.mjs';
// Publishing screens do not need an event for typing/presence/learner writes.
export function realtimeRevision(view){
 return view==='content'?kindsRevision(['contents','publications','assets','connections','campaigns','products','copy_posts','copy_videos','copy_plans','copy_sources','settings','teams','team_members','channel_teams']):stateRevision();
}
