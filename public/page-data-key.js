// Only data used by the visible page may trigger a background repaint.
const pick=(rows,fields)=>(rows||[]).map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])));
export function pageDataKey(route,state){
 if(!state)return '';
 if(!['dashboard','content'].includes(route))return state.snapshotRevision;
 const key={contents:state.contents,publications:state.publications,providers:state.providers,assets:pick(state.assets,['id','url','type','name','active']),connections:pick(state.connections,['id','name','remoteName','provider','status','mode'])};
 if(route==='dashboard')Object.assign(key,{messages:state.messages,messageSummaries:state.messageSummaries,orders:state.orders,staffHandoffs:state.staffHandoffs,tasks:state.tasks,chat_reminders:state.chat_reminders,copyPlanCalendar:state.copyPlanCalendar,conversations:pick(state.conversations,['id','customerId','connectionId','status','unread','lastMessage','lastAt']),customers:pick(state.customers,['id','name']),notificationConversationIds:state.notificationConversationIds});
 return JSON.stringify(key);
}
