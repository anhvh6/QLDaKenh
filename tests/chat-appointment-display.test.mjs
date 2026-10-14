import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingAppointments,expiredAppointmentPreview} from '../public/chat-appointments.js';
import {reactionEmoji} from '../public/chat-reaction-display.js';
test('heart text presentation becomes a colored emoji without changing other reactions',()=>{
 for(const value of ['❤','♥','❤︎','❤️','love'])assert.equal(reactionEmoji(value),'❤️');
 assert.equal(reactionEmoji('👍'),'👍');
});
test('appointment badges include only future pending appointments for this conversation',()=>{
 const time=Date.parse('2026-10-14T09:00:00Z'),rows=[{conversationId:'a',dueAt:'2026-10-14T09:00:00Z',status:'pending'},{conversationId:'a',dueAt:'2026-10-14T09:15:00Z',status:'cancelled'},{conversationId:'b',dueAt:'2026-10-14T09:15:00Z',status:'pending'},{conversationId:'a',dueAt:'2026-10-14T09:30:00Z',status:'pending'}];
 assert.deepEqual(upcomingAppointments(rows,'a',time),[rows[3]]);
 assert.equal(upcomingAppointments(rows,'a',time+1800000).length,0);
});
test('expired native appointment summary is hidden while ordinary customer text remains',()=>{
 const rows=[{conversationId:'a',title:'Call tư vấn',dueAt:'2026-10-14T09:00:00Z'}],time=Date.parse('2026-10-14T09:01:00Z');
 assert.equal(expiredAppointmentPreview(rows,{id:'a',lastMessage:'⏰ Call tư vấn Thứ Tư'},time),true);
 assert.equal(expiredAppointmentPreview(rows,{id:'a',lastMessage:'Call tư vấn cho em nhé'},time),false);
});
