import {publicationPreflight} from './publish-preflight.mjs';
import {platformTextIssues} from '../public/platform-text-rules.js';
import {reupText} from '../public/reup-text.js';
import {get} from './store.mjs';

// Metadata-only admission: never create a draft, download or reserve a slot here.
export function reviewCopyCandidate(user,video,channels,edited=null){
 const post=video.postId&&get('copy_posts',video.postId),known=post?.extracted?post:null;
 const content={id:'copy-review:'+video.id,sourceVideoKey:video.provider+':'+video.externalId,title:(video.overrideTitle||known?.title||video.title||'Video').slice(0,250),caption:video.overrideCaption??known?.caption??video.caption??'',type:'video',assets:[],...edited,channels};
 const assets=(edited?.assets||[]).map(id=>get('assets',id)).filter(a=>a&&a.active!==false);
 const media=assets.length?assets:known?.media?.length?known.media:[{type:video.mediaType||'video',size:video.size}];
 const check=publicationPreflight(user,content,{immediate:true},{prepared:true,sourceMedia:media,checkHistory:false});
 const issues=[...check.issues,...check.warnings];
 for(const id of channels){const ch=get('connections',id);if(!ch)continue;for(const issue of platformTextIssues(ch.provider,reupText(content,ch.provider,content.variants?.[id]||{})))if(!issues.some(i=>i.channelId===id&&i.message===issue.message))issues.push({...issue,channelId:id,channel:ch.remoteName||ch.name});}
 return {eligible:channels.length>0&&issues.length===0,issues};
}
