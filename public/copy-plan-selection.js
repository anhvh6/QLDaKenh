import {latestCopyPlans} from './copy-layout-model.js';

// null follows all current and future plans; [] is an explicit empty selection.
export function visibleCopyPlans(plans,mode,campaignId=''){
 return latestCopyPlans(plans,mode,campaignId);
}
export function normalizePlanSelection(ids,plans){
 if(ids===null)return null;
 const available=new Set(plans.map(p=>p.id));
 const selected=[...new Set(ids)].filter(id=>available.has(id));
 return ids.length&&!selected.length?null:selected;
}
export function copyPlanItemScope(items,plans,ids=null){
 const allowed=new Set((ids===null?plans:plans.filter(p=>ids.includes(p.id))).map(p=>p.id));
 return items.filter(item=>allowed.has(item.planId));
}
