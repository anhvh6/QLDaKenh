import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTimeParts,messageTimeline,nearMessage} from '../public/chat-timeline.js';
test('chat timestamps use Vietnam day boundaries and show only first message of each minute',()=>{
 const rows=[{id:'a',createdAt:'2026-10-12T16:59:01Z'},{id:'b',createdAt:'2026-10-12T16:59:40Z'},{id:'c',createdAt:'2026-10-12T17:00:00Z'},{id:'d',createdAt:'2026-10-14T00:03:01Z'},{id:'e',createdAt:'2026-10-14T00:03:40Z'},{id:'f',createdAt:'2026-10-14T00:04:00Z'}];
 const t=messageTimeline(rows,'2026-10-14T01:00:00Z');assert.equal(t.get('a').separator,'23:59 12/10');assert.equal(t.get('b').firstMinute,false);assert.equal(t.get('c').separator,'00:00 hôm qua');assert.equal(t.get('d').separator,'');assert.equal(t.get('d').time,'07:03');assert.equal(t.get('e').firstMinute,false);assert.equal(t.get('f').firstMinute,true);
});
test('separator handles year rollover and invalid dates without crashing',()=>{
 const t=messageTimeline([{id:'old',createdAt:'2025-12-31T10:00:00Z'},{id:'bad',createdAt:'invalid'}],'2026-01-01T01:00:00Z');assert.equal(t.get('old').separator,'17:00 hôm qua');assert.equal(t.get('bad').time,'');assert.equal(chatTimeParts('invalid'),null);
});
test('action hover remains active near the bubble or footer but clears when moved well away',()=>{
 const rects=[{left:100,right:200,top:100,bottom:150},{left:100,right:250,top:154,bottom:182}];assert.equal(nearMessage(230,175,rects),true);assert.equal(nearMessage(270,185,rects),true);assert.equal(nearMessage(300,220,rects),false);
});

test('message menu stays inside the conversation pane without covering the conversation list',async()=>{
 const {menuPosition}=await import('../public/chat-menu-layout.js');const area={left:540,right:1260,top:100,bottom:540};const p=menuPosition({top:320,bottom:344,right:685},{width:260,height:215},{width:1280,height:720},area);assert.ok(p.left>=548);assert.ok(p.top>=108);assert.ok(p.top+215<=532);assert.ok(p.left+p.width<=1252);
});
