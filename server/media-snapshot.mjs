import {all,get,db,kindsRevision} from './store.mjs';
import {kinds} from './domain.mjs';
import {extraKinds,permittedChannels} from './taophacdo.mjs';
import {storedMediaUsage} from './media-usage-store.mjs';
const fields=['id','version','name','description','url','type','mime','size','width','height','duration','categoryIds','tags','scopes','active','connectionId','uploadedBy','createdAt','updatedAt'];
export const mediaRevision=()=>kindsRevision(['assets','media_categories','settings','connections','team_members','channel_teams','messages','publications']);
export function mediaSnapshot(user,{revision,providers,users}={}){
 const state={user,providers,snapshotView:'media',snapshotRevision:revision,mediaCompact:true,mediaFeatures:{snapshot:true,imageThumbnails:true},contentFeatures:{thumbnails:true}};
 for(const key of [...kinds,...extraKinds,'mediaCategories','mediaFavorites','copyPlanCalendar','copyPlanSummaries','savedPlanSummaries','chatPlanSummaries','chatMentions','staffHandoffs','chatbotRuns','notificationConversationIds'])state[key]=[];
 const allowed=permittedChannels(user),usage=storedMediaUsage();
 state.assets=all('assets').filter(a=>!a.connectionId||!allowed||allowed.has(a.connectionId)).map(a=>({...Object.fromEntries(fields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]])),usage:usage.get(a.id)}));
 state.connections=all('connections').filter(c=>!allowed||allowed.has(c.id)).map(c=>Object.fromEntries(['id','name','remoteName','handle','provider','status','mode'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]])));
 state.mediaCategories=all('media_categories');state.mediaFavorites=get('settings','media-favorites-'+user.id)?.ids||[];
 state.users=(users||db.prepare('SELECT id,name,role,active FROM users').all()).map(({id,name,role,active})=>({id,name,role,active}));
 state.settings=get('settings','general')||{name:'Mộc Workspace',timezone:'Asia/Ho_Chi_Minh'};
 return state;
}
