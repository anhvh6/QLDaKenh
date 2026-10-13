import test from 'node:test';
import assert from 'node:assert/strict';
import {channelConnected,filterDisconnectedChats} from '../public/chat-connection-state.js';

test('only connected channels expose chats, including demo channels',()=>{
 for(const status of ['demo','disconnected','configured','pending','error','reconnecting'])assert.equal(channelConnected({mode:'demo',status}),false);
 assert.equal(channelConnected({mode:'demo',status:'connected'}),true);
 assert.equal(channelConnected({provider:'zalo_personal',status:'connected',listenerState:'stopped'}),false);
});
test('state excludes disconnected histories and restores them on reconnect without changing stored records',()=>{
 const stored={connections:[{id:'live',status:'connected'},{id:'old',status:'disconnected'},{id:'sample',status:'demo',mode:'demo'}],conversations:['live','old','sample','missing'].map(id=>({id,connectionId:id})),messages:['live','old','sample','missing'].map(id=>({conversationId:id,text:id}))};
 const visible=filterDisconnectedChats(structuredClone(stored));
 assert.deepEqual(visible.conversations.map(c=>c.id),['live']);
 assert.deepEqual(visible.messages.map(m=>m.text),['live']);
 assert.equal(stored.messages.length,4);
 const queues=filterDisconnectedChats({...structuredClone(stored),staffHandoffs:[{conversationId:'old'}],chat_reminders:[{conversationId:'live'}],chatbotConversations:[{id:'old'}]});
 assert.equal(queues.staffHandoffs.length,0);
 assert.equal(queues.chat_reminders.length,1);
 assert.equal(queues.chatbotConversations.length,0);
 stored.connections[1].status='connected';
 assert.deepEqual(filterDisconnectedChats(structuredClone(stored)).messages.map(m=>m.text),['live','old']);
});
