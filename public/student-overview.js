import {progressFor,learnerStages} from './learner-progress.js';
import {groupLearner} from './group-learner.js';

// Study data and chat history are independent; neither creates the other.
export function studentOverview(state,customer,time=Date.now()){
 const progress=progressFor(state,customer,time),journey=(state.journeys||[]).find(j=>j.customerId===customer.id);
 const conversations=new Map((state.conversations||[]).filter(c=>!c.deletedAt&&c.kind!=='comment'&&(c.customerId===customer.id||c.threadType===1&&(c.learnerCustomerId===customer.id||groupLearner(state,c)?.id===customer.id))).map(c=>[c.id,c]));
 const hasHistory=(state.messages||[]).some(m=>{const c=conversations.get(m.conversationId);return c&&!m.deletedAt&&['incoming','outgoing'].includes(m.direction)&&!['failed','unknown','sending','pending'].includes(m.status)&&(!c.clearedBefore||m.createdAt>c.clearedBefore);});
 const names=(state.enrollments||[]).filter(e=>e.customerId===customer.id).map(e=>e.name);
 for(const item of Array.isArray(customer.san_pham)?customer.san_pham:[])if(item.productType==='course'||/khóa học|khoá học|khoa hoc/i.test(item.ten_sp||item.name||''))names.push(item.ten_sp||item.name);
 const hasPlan=[...(state.savedPlanSummaries||[]),...(state.chatPlanSummaries||[])].some(p=>p.customerId===customer.id)||customer.origin==='taophacdo'&&!!(customer.hasEffectivePlan||customer.video_date||customer.is_customized||customer.link);
 const consultationPending=['NEW','APPOINTMENT','CONSULTED'].includes(progress.stage)&&!hasHistory;
 return {...progress,consultationPending,stage:consultationPending?null:progress.stage,stageName:consultationPending?'Chưa vào luồng tư vấn':learnerStages[progress.stage].name,startDate:progress.startDate||journey?.startDate||customer.start_date,endDate:progress.endDate||journey?.endDate||customer.end_date,courseNames:[...new Set(names.filter(Boolean))],hasPlan,hasHistory};
}
