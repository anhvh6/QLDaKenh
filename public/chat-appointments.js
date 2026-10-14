export function upcomingAppointments(reminders,conversationId,time=Date.now()){
 return (reminders||[]).filter(r=>r.status==='pending'&&(!conversationId||r.conversationId===conversationId)&&Date.parse(r.dueAt)>time).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
}
export function expiredAppointmentPreview(reminders,conversation,time=Date.now()){
 return String(conversation.lastMessage||'').startsWith('⏰')&&(reminders||[]).some(r=>r.conversationId===conversation.id&&Date.parse(r.dueAt)<=time&&String(conversation.lastMessage).includes(r.title));
}
