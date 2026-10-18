import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'chat-window-'));const {put}=await import('../server/store.mjs');const {chatWindow}=await import('../server/chat-window.mjs');
test('message windows page tied timestamps without duplicates, include quote context and never expose another chat',()=>{
 for(let i=0;i<145;i++)put('messages',{id:'m'+String(i).padStart(3,'0'),conversationId:'chat',createdAt:'2026-10-18T03:00:00Z',text:'body '+i,...(i===144?{quoteId:'m000'}:{})});put('messages',{id:'foreign',conversationId:'other',text:'Private'});
 const first=chatWindow('chat',new URLSearchParams({limit:'60'}));assert.equal(first.messages.length,60);assert.equal(first.messages.at(-1).id,'m144');assert.equal(first.references[0].text,'body 0');assert.equal(first.hasMore,true);
 const second=chatWindow('chat',new URLSearchParams({limit:'60',before:first.before})),last=chatWindow('chat',new URLSearchParams({limit:'60',before:second.before}));assert.equal(last.messages.length,25);assert.equal(last.hasMore,false);assert.equal(new Set([...first.messages,...second.messages,...last.messages].map(m=>m.id)).size,145);
 assert.throws(()=>chatWindow('chat',new URLSearchParams({before:'bad'})),/không hợp lệ/);
 put('messages',{id:'newest',conversationId:'chat',createdAt:'2026-10-18T04:00:00Z',quoteId:'foreign'});assert.equal(chatWindow('chat',new URLSearchParams({limit:'1'})).references.length,0);
});
