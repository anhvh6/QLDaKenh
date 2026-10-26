// Request-scoped indexes: never attach internal Maps to the API response or reuse them after writes.
const snapshots=new WeakMap();
// A shallow copy of an unchanged revision can share read-only indexes.
// Rebuild after writes by preparing the new source snapshot first.
export function cloneLearnerLookups(source){const copy={...source},lookup=snapshots.get(source);if(lookup)snapshots.set(copy,lookup);else prepareLearnerLookups(copy);return copy;}
export function prepareLearnerLookups(state){
 const lookup={ids:{},byCustomer:{},contacts:new Map(),rank:new Map()};
 for(const kind of ['customers','connections'])lookup.ids[kind]=new Map((state[kind]||[]).map(r=>[r.id,r]));
 for(const kind of ['orders','journeys','chatPlanSummaries','chat_reminders','plan_handoffs']){const map=new Map();for(const row of state[kind]||[]){const rows=map.get(row.customerId)||[];rows.push(row);map.set(row.customerId,rows);}lookup.byCustomer[kind]=map;}
 for(const [rank,c] of (state.conversations||[]).entries()){lookup.rank.set(c,rank);if(c.threadType===1||c.deletedAt)continue;const key=JSON.stringify([c.connectionId,String(c.externalUserId)]),rows=lookup.contacts.get(key)||[];rows.push(c);lookup.contacts.set(key,rows);}
 snapshots.set(state,lookup);return state;
}
export function learnerRecord(state,kind,id){const lookup=snapshots.get(state);return lookup?lookup.ids[kind]?.get(id):(state[kind]||[]).find(r=>r.id===id);}
export function learnerRows(state,kind,id){const lookup=snapshots.get(state);return lookup?lookup.byCustomer[kind]?.get(id)||[]:(state[kind]||[]).filter(r=>r.customerId===id);}
export function learnerGroupContacts(state,c,ids){const lookup=snapshots.get(state);if(!lookup)return (state.conversations||[]).filter(v=>v.connectionId===c.connectionId&&v.threadType!==1&&!v.deletedAt&&ids.has(String(v.externalUserId)));return [...ids].flatMap(id=>lookup.contacts.get(JSON.stringify([c.connectionId,id]))||[]).sort((a,b)=>lookup.rank.get(a)-lookup.rank.get(b));}
