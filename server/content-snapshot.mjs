import {filterCareNotifications} from './student-care.mjs';
import {all,get,db} from './store.mjs';
import {kinds} from './domain.mjs';
import {extraKinds,scopeState} from './taophacdo.mjs';
// A publishing page does not need chat, learner, shipping or POS hydration.
export function contentSnapshot(user,{revision,providers}={}){
 const state={user,providers,snapshotRevision:revision,snapshotView:'content',contentFeatures:{snapshot:true,thumbnails:true}};
 for(const key of [...kinds,...extraKinds,'mediaCategories','mediaFavorites','copyPlanCalendar','copyPlanSummaries','savedPlanSummaries','chatPlanSummaries','chatMentions','staffHandoffs'])state[key]=[];
 for(const key of ['contents','assets','connections','campaigns','products','publications','notifications'])state[key]=all(key);
 state.notifications=state.notifications.some(n=>n.conversationId)?filterCareNotifications(state.notifications,user):state.notifications.filter(n=>!n.recipientId||n.recipientId===user.id);
 state.connections=state.connections.map(({accountId,apiVersion,...c})=>user.role==='owner'?{...c,accountId,apiVersion}:c);
 const posts=new Map(all('copy_posts').filter(p=>p.userId===user.id).map(p=>[p.id,p]));
 state.contents=state.contents.map(c=>c.sourceCopyId&&!c.copyReady?{...c,sourceMediaTypes:[...new Set((posts.get(c.sourceCopyId)?.media||[]).map(m=>m.type))]}:c);
 state.mediaCategories=all('media_categories');state.mediaFavorites=get('settings','media-favorites-'+user.id)?.ids||[];
 state.settings=get('settings','general')||{name:'Mộc Workspace',timezone:'Asia/Ho_Chi_Minh'};
 state.users=db.prepare('SELECT id,name,role,active FROM users').all();
 state.copyCatalog={plans:all('copy_plans').filter(p=>p.userId===user.id),sources:all('copy_sources').filter(p=>p.userId===user.id)};
 return scopeState(state,user);
}
