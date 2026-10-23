export function operationalReportTotals(state){
 const outcomes=Object.fromEntries(['scheduled','published','demo_published','awaiting_manual','failed','unknown'].map(k=>[k,0]));
 for(const p of state.publications||[])if(Object.hasOwn(outcomes,p.status))outcomes[p.status]++;
 const care={open:0,pending:0,resolved:0};for(const c of state.conversations||[])if(Object.hasOwn(care,c.status))care[c.status]++;
 return {total:(state.orders||[]).filter(o=>o.status!=='cancelled').reduce((n,o)=>n+Number(o.total||0),0),paid:(state.payments||[]).reduce((n,p)=>n+Number(p.amount||0),0),customers:(state.customers||[]).filter(c=>!c.mergedInto).length,published:outcomes.published,outcomes,care,conversationCount:(state.conversations||[]).length};
}
