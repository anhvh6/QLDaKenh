import {sourceVideoKey} from './copy-source-key.mjs';
import {assertChannel} from './taophacdo.mjs';
import {get,all,db} from './store.mjs';
export function copyPlanBlock(publication,time=Date.now()){
 const content=publication.contentId?get('contents',publication.contentId):null,id=publication.copyPlanId||content?.copyPlanId;if(!id)return '';
 const itemId=publication.copyPlanItemId||content?.copyPlanItemId;if(itemId&&get('copy_plan_items',itemId)?.state==='removed')return 'Video đã loại khỏi kế hoạch.';
 const p=get('copy_plans',id),campaign=p&&get('campaigns',p.campaignId),user=p&&db.prepare('SELECT id,role,active FROM users WHERE id=?').get(p.userId);
 if(!p||p.status!=='active'||campaign?.status!=='active'||!user?.active||!['owner','manager','editor'].includes(user.role))return 'Kế hoạch/chiến dịch hoặc nhân viên đang tạm dừng.';
 try{if(publication.connectionId)assertChannel(user,publication.connectionId);}catch(e){return e.message;}
 if(time<Date.parse(p.startAt)||p.endAt&&time>Date.parse(p.endAt))return 'Ngoài thời gian hoạt động kế hoạch.';
 const key=content?.sourceVideoKey||(content?.sourceCopyId?sourceVideoKey(get('copy_posts',content.sourceCopyId)):'');if(key){const ids=new Set(all('contents').filter(c=>(c.sourceVideoKey||(c.sourceCopyId?sourceVideoKey(get('copy_posts',c.sourceCopyId)):''))===key).map(c=>c.id));if(all('publications').some(p=>p.id!==publication.id&&p.connectionId===publication.connectionId&&ids.has(p.contentId)&&['published','manually_confirmed'].includes(p.status)))return 'Đã đăng video này trên kênh; chặn đăng trùng.';}
 if(time-Date.parse(publication.scheduleAt)>60000)return 'Đã lỡ giờ đăng; cần xếp lịch mới.';
 return '';
}
