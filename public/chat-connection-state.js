export function channelConnected(channel){
 return !!channel&&channel.status==='connected'&&(channel.provider!=='zalo_personal'||!channel.listenerState||channel.listenerState==='listening');
}
export function conversationConnected(state,conversation){
 if(!Array.isArray(state.connections))return true;
 return channelConnected(state.connections.find(channel=>channel.id===conversation?.connectionId));
}
export function filterDisconnectedChats(state){
 const channels=new Set((state.connections||[]).filter(channelConnected).map(channel=>channel.id));
 state.conversations=state.conversations.filter(c=>channels.has(c.connectionId));
 const ids=new Set(state.conversations.map(c=>c.id));
 state.messages=state.messages.filter(m=>ids.has(m.conversationId));
 for(const kind of ['staffHandoffs','chatMentions','chatbotRuns','chat_reminders'])if(Array.isArray(state[kind]))state[kind]=state[kind].filter(row=>ids.has(row.conversationId));
 if(Array.isArray(state.chatbotConversations))state.chatbotConversations=state.chatbotConversations.filter(c=>ids.has(c.id));
 return state;
}
