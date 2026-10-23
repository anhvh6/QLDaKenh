// Read each collection once, rather than parsing a plan/video for every calendar row.
export function copyStateSummary(userId, all) {
 const plans=all('copy_plans').filter(p=>p.userId===userId),byId=new Map(plans.map(p=>[p.id,p]));
 const items=all('copy_plan_items').filter(i=>i.userId===userId&&i.scheduleAt&&byId.has(i.planId)&&['scheduled','preparing','ready','publishing','published','failed','unknown'].includes(i.state));
 const videoIds=new Set(items.map(i=>i.videoId)),videos=new Map(all('copy_videos').filter(v=>videoIds.has(v.id)&&v.userId===userId).map(v=>[v.id,v]));
 return {copyPlanCalendar:items.map(i=>{const plan=byId.get(i.planId);return {id:i.id,contentId:i.contentId,updatedAt:i.updatedAt,planId:i.planId,channels:i.channels||plan.channels||[],scheduleAt:i.scheduleAt,state:i.state,title:videos.get(i.videoId)?.title||'Video',planName:plan.name||'',campaignId:plan.campaignId};}),copyPlanSummaries:plans.map(p=>({id:p.id,name:p.name,campaignId:p.campaignId,status:p.status,mode:p.mode}))};
}
