import {sourceVideoKey} from './copy-source-key.mjs';
import {assertChannel} from './taophacdo.mjs';
import {get,all,db} from './store.mjs';
import {publicationAdmissionTime} from './publication-admission.mjs';
// The five-second automation poll can observe a completed download just after its slot.
// Keep the original slot and existing dispatch deadline, but require proof it was ready on time.
export function copyPlanHandoffReady(content,scheduleAt,time=Date.now()){
 if(!content?.copyReady||!content.copyPlanId||!content.copyPlanItemId)return false;
 const slot=Date.parse(scheduleAt),item=get('copy_plan_items',content.copyPlanItemId);
 if(!Number.isFinite(slot)||time<slot||time>slot+60000||!item||!['preparing','ready'].includes(item.state)||item.planId!==content.copyPlanId||item.contentId!==content.id||item.scheduleAt!==scheduleAt)return false;
 const job=item.copyJobId&&get('copy_jobs',item.copyJobId);
 if(job?.status!=='done'||!Number.isFinite(Date.parse(job.completedAt))||Date.parse(job.completedAt)>slot||content.copyJobId!==job.id||!content.assets?.length||content.assets.some(id=>!job.assets?.includes(id)))return false;
 return (content.channels||[]).length>0&&content.channels.every(connectionId=>!copyPlanBlock({contentId:content.id,connectionId,scheduleAt},time));
}
export function copyPlanBlock(publication,time=Date.now()){
 const content=publication.contentId?get('contents',publication.contentId):null,id=publication.copyPlanId||content?.copyPlanId;if(!id)return '';
 const itemId=publication.copyPlanItemId||content?.copyPlanItemId;if(itemId&&get('copy_plan_items',itemId)?.state==='removed')return 'Video đã loại khỏi kế hoạch.';
 const p=get('copy_plans',id),campaign=p&&get('campaigns',p.campaignId),user=p&&db.prepare('SELECT id,role,active FROM users WHERE id=?').get(p.userId);
 if(!p||p.status!=='active'||campaign?.status!=='active'||!user?.active||!['owner','manager','editor'].includes(user.role))return 'Kế hoạch/chiến dịch hoặc nhân viên đang tạm dừng.';
 if(publication.connectionId&&!p.channels?.includes(publication.connectionId))return 'Kênh đã loại khỏi kế hoạch.';
 try{if(publication.connectionId)assertChannel(user,publication.connectionId);}catch(e){return e.message;}
 if(time<Date.parse(p.startAt)||p.endAt&&time>Date.parse(p.endAt))return 'Ngoài thời gian hoạt động kế hoạch.';
 const key=content?.sourceVideoKey||(content?.sourceCopyId?sourceVideoKey(get('copy_posts',content.sourceCopyId)):'');if(key){const ids=new Set(all('contents').filter(c=>(c.sourceVideoKey||(c.sourceCopyId?sourceVideoKey(get('copy_posts',c.sourceCopyId)):''))===key).map(c=>c.id));if(all('publications').some(p=>p.id!==publication.id&&p.connectionId===publication.connectionId&&ids.has(p.contentId)&&['published','manually_confirmed'].includes(p.status)))return 'Đã đăng video này trên kênh; chặn đăng trùng.';}
 const admission=publicationAdmissionTime(publication);
 if(time-Date.parse(publication.scheduleAt)>60000&&!(Number.isFinite(admission)&&admission<=time))return 'Đã lỡ giờ đăng; cần xếp lịch mới.';
 return '';
}
