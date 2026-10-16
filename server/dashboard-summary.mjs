import {readDashboardLearners} from './supabase.mjs';import {learnerCycleSummary} from '../public/learner-cycle-model.js';
let cached=null,pending=null;
export function assertDashboardAdmin(user){if(!['owner','manager'].includes(user?.role))throw Object.assign(Error('Chỉ quản trị được xem số liệu tổng hợp hệ thống.'),{status:403});}
export async function dashboardLearnerSummary(user,read=readDashboardLearners){
 assertDashboardAdmin(user);if(cached&&Date.now()-cached.updatedAt<60000)return cached;
 if(!pending)pending=(async()=>{const data=await read();cached={...learnerCycleSummary(data.customers,data.products),updatedAt:Date.now()};return cached;})().finally(()=>pending=null);
 return pending;
}
