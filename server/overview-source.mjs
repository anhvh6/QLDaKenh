import {learnerCycleSummary} from '../public/learner-cycle-model.js';
export async function computeLearnerOverview(readPage,products,time=Date.now()){
 const rows=[];for(let offset=0;offset<100000;offset+=500){
  const batch=await readPage(offset,500);if(!Array.isArray(batch))throw Error('Nguồn số liệu chưa trả danh sách hợp lệ.');
  rows.push(...batch);if(batch.length<500)return {...learnerCycleSummary(rows.map(c=>({...c,raw_backup:{video_open_dates:c.video_open_dates,last_video_open_time:c.last_video_open_time}})),products,time),sourceRows:rows.length};
 }
 throw Error('Chưa tổng hợp hết dữ liệu; giữ kết quả lần cập nhật trước.');
}
export const learnerOverviewColumns='customer_id,status,created_at,start_date,end_date,duration_days,video_date,is_consultation,is_deposit,deposit_amount,san_pham,gia_tien,raw_backup->video_open_dates,raw_backup->last_video_open_time';
