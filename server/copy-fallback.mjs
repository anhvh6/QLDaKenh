import {existsSync,statSync} from 'node:fs';
import {basename,join} from 'node:path';
import {all,get,put,transaction,dataDir} from './store.mjs';
import {copyStorageScope} from './copy-cache.mjs';
import {sourceVideoKey} from './copy-source-key.mjs';
import {publicationPreflight} from './publish-preflight.mjs';
const reserved=new Set(['scheduled','preparing','ready','publishing','unknown']);
const unsafe=new Set(['published','manually_confirmed','demo_published','scheduled','dispatching','processing','awaiting_manual','unknown']);
function usableAsset(id){const a=get('assets',id);if(!a||a.active===false||a.type!=='video'||!/^\/uploads\/asset_[\w-]+\.[a-z0-9]+$/.test(a.url||''))return false;const file=join(dataDir,'uploads',basename(a.url));try{return existsSync(file)&&statSync(file).size>0;}catch{return false;}}
export function preparedMediaAvailable(content){return content?.assets?.length>0&&content.assets.every(usableAsset);}
// Replace only an unsent future slot. No provider failure/timeout can enter here.
export function replacePreparedSlot(plan,failed,user,{time=Date.now(),ordered,remaining}={}){
 const current=get('copy_plan_items',failed.id),livePlan=get('copy_plans',plan.id),slot=Date.parse(current?.scheduleAt),campaign=get('campaigns',plan.campaignId);
 if(!current||current.planId!==plan.id||current.userId!==user.id||livePlan?.userId!==user.id||slot<Date.parse(livePlan?.startAt)||livePlan?.endAt&&slot>Date.parse(livePlan.endAt)||current.fallbackToItemId||livePlan?.status!=='active'||campaign?.status!=='active'||!Number.isFinite(slot)||slot<=time||!['failed','scheduled','preparing','ready'].includes(current.state))return null;
 const pubs=all('publications'),ownPubs=pubs.filter(p=>p.copyPlanItemId===current.id||current.contentId&&p.contentId===current.contentId);if(ownPubs.some(p=>p.status!=='cancelled'&&!(p.status==='blocked'&&p.preflightBlocked&&!p.dispatchedAt&&!p.attempts)))return null;
 const connections=new Map(all('connections').map(c=>[c.id,c])),platforms=new Set((current.channels||[]).map(id=>connections.get(id)?.provider));if(!platforms.size||platforms.has(undefined)||platforms.size!==(current.channels||[]).length)return null;
 const posts=new Map(all('copy_posts').map(p=>[p.id,p])),contentKeys=new Map(all('contents').map(c=>[c.id,c.sourceVideoKey||sourceVideoKey(posts.get(c.sourceCopyId))]));
 const forbidden=new Set(pubs.filter(p=>unsafe.has(p.status)&&platforms.has(connections.get(p.connectionId)?.provider)).map(p=>p.sourceVideoKey||contentKeys.get(p.contentId)).filter(Boolean));
 const items=all('copy_plan_items'),candidateAllowed=i=>i.planId===plan.id&&i.userId===user.id&&!i.copyJobId&&!i.contentId&&!i.fallbackToItemId&&(i.state==='pending'||i.state==='scheduled'&&Date.parse(i.scheduleAt)>slot),plans=new Map(all('copy_plans').map(p=>[p.id,p])),videos=new Map(all('copy_videos').map(v=>[v.id,v]));
 for(const i of items){if(i.id===current.id||candidateAllowed(i)||!reserved.has(i.state)||!['active','paused'].includes(plans.get(i.planId)?.status)||!i.channels?.some(id=>platforms.has(connections.get(id)?.provider)))continue;const v=videos.get(i.videoId);if(v)forbidden.add(sourceVideoKey(v));}
 const scope=copyStorageScope(user.id),cache=new Map();
 for(const job of all('copy_jobs')){if(!Number.isFinite(Date.parse(job.completedAt))||Date.parse(job.completedAt)>time||job.status!=='done'||job.hiddenAt||!job.driveSaved||!job.folderId||!job.assets?.length||!job.userId||(job.storageScope||copyStorageScope(job.userId))!==scope||!job.assets.every(usableAsset))continue;const post=posts.get(job.postId),key=sourceVideoKey(post);if(key&&post?.extracted&&!cache.has(key))cache.set(key,{job,post});}
 const candidates=items.filter(i=>candidateAllowed(i)&&i.videoId!==current.videoId).map(i=>({...videos.get(i.videoId),candidateItemId:i.id})).filter(v=>v.id&&v.userId===user.id&&!v.excluded&&v.sourceIds?.includes(plan.sourceId)&&!forbidden.has(sourceVideoKey(v)));
 for(const video of ordered(candidates,plan)){
  const candidate=get('copy_plan_items',video.candidateItemId),stored=cache.get(sourceVideoKey(video));if(!stored)continue;
  const channels=remaining(plan,video,candidate);if(!(current.channels||[]).every(id=>channels.includes(id)))continue;
  const {job,post}=stored,content={id:'fallback-review:'+candidate.id,title:(video.overrideTitle||post.title||video.title||'Video').slice(0,250),caption:video.overrideCaption??post.caption??'',type:'video',channels:[...current.channels],assets:job.assets,sourceCopyId:post.id,sourceVideoKey:sourceVideoKey(video),copyReady:true,copyJobId:job.id,driveFolderId:job.folderId,campaignId:plan.campaignId,copyPlanId:plan.id,copyPlanItemId:candidate.id,copyFallbackOf:current.id};
  const check=publicationPreflight(user,content,{scheduleAt:current.scheduleAt},{prepared:true});if(!check.ok||check.requiresAcknowledgement)continue;
  return transaction(()=>{
   if(get('copy_plan_items',current.id)?.fallbackToItemId||!candidateAllowed(get('copy_plan_items',candidate.id)||{})||get('copy_plans',plan.id)?.status!=='active')return null;
   for(const pub of ownPubs.filter(p=>p.status==='blocked'&&p.preflightBlocked))put('publications',{...get('publications',pub.id),status:'cancelled',error:pub.error,replacedBeforeDispatch:true});
   const {id:reviewId,...draft}=content,saved=put('contents',{...draft,status:'draft'});
   const replacement=put('copy_plan_items',{...candidate,state:'ready',channels:content.channels,scheduleAt:current.scheduleAt,contentId:saved.id,copyJobId:job.id,fallbackFromItemId:current.id,fallbackPreviousScheduleAt:candidate.scheduleAt||'',fallbackOriginalError:current.error||'',note:'Bài thay thế đã có trên Google Drive; giữ nguyên khung giờ.',error:'',retryAt:''});
   put('copy_plan_items',{...get('copy_plan_items',current.id),state:'failed',fallbackToItemId:replacement.id,note:'Đã chọn bài khác từ Google Drive để bù khung giờ; giữ lại lỗi gốc.'});
   put('copy_plan_events',{planId:plan.id,userId:user.id,type:'fallback',itemId:replacement.id,sourceItemId:current.id,message:'Thay bài lỗi bằng video đã có trên Google Drive, giữ khung giờ '+current.scheduleAt+'. Không tải lại media.'});
   return replacement;
  });
 }
 return null;
}
