import {filterCareNotifications} from './student-care.mjs';
import {all,get,db} from './store.mjs';
import {kinds} from './domain.mjs';
import {extraKinds,scopeState} from './taophacdo.mjs';
import {meaningfulText} from '../public/content-presentation.js';
// A publishing page does not need chat, learner, shipping or POS hydration.
export function contentSnapshot(user,{revision,providers}={}){
 const state={user,providers,snapshotRevision:revision,snapshotView:'content',contentFeatures:{snapshot:true,thumbnails:true}};
 for(const key of [...kinds,...extraKinds,'mediaCategories','mediaFavorites','copyPlanCalendar','copyPlanSummaries','savedPlanSummaries','chatPlanSummaries','chatMentions','staffHandoffs'])state[key]=[];
 for(const key of ['contents','assets','connections','campaigns','products','publications','notifications'])state[key]=all(key);
 state.notifications=state.notifications.some(n=>n.conversationId)?filterCareNotifications(state.notifications,user):state.notifications.filter(n=>!n.recipientId||n.recipientId===user.id);
 state.connections=state.connections.map(({accountId,apiVersion,...c})=>user.role==='owner'?{...c,accountId,apiVersion}:c);
 const posts=new Map(all('copy_posts').filter(p=>p.userId===user.id).map(p=>[p.id,p]));
 const videos=all('copy_videos').filter(v=>v.userId===user.id),byPost=new Map(videos.filter(v=>v.postId).map(v=>[v.postId,v])),byKey=new Map(videos.map(v=>[v.provider+':'+v.externalId,v]));
 state.contents=state.contents.map(c=>{const post=posts.get(c.sourceCopyId),video=byPost.get(c.sourceCopyId)||byKey.get(c.sourceVideoKey),thumbnail=post?.thumbnail||video?.thumbnail||(post?.media||[]).find(m=>m.thumbnail)?.thumbnail||(post?.media||[]).find(m=>m.type==='image')?.url||'';return {...c,...(post&&!c.copyReady?{sourceMediaTypes:[...new Set((post.media||[]).map(m=>m.type))]}:{}),...(post||video?{sourcePreview:{title:meaningfulText(post?.title)||meaningfulText(video?.title),caption:meaningfulText(post?.caption)||meaningfulText(video?.caption),thumbnail}}:{})};});
 state.mediaCategories=all('media_categories');state.mediaFavorites=get('settings','media-favorites-'+user.id)?.ids||[];
 state.settings=get('settings','general')||{name:'Mộc Workspace',timezone:'Asia/Ho_Chi_Minh'};
 state.users=db.prepare('SELECT id,name,role,active FROM users').all();
 state.copyCatalog={plans:all('copy_plans').filter(p=>p.userId===user.id),sources:all('copy_sources').filter(p=>p.userId===user.id)};
 return scopeState(state,user);
}
