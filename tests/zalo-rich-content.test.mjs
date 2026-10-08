import test from 'node:test';
import assert from 'node:assert/strict';
import {parseZaloContent,hydrateZaloStickers,repairZaloCards} from '../server/zalo-message-content.mjs';
import {createVerifiedZaloGroup} from '../server/zalo-group-create.mjs';
import {richMessage} from '../public/chat-message-rich.js';
test('received contact JSON becomes a usable safe card',()=>{
 const data={msgType:'chat.recommended',content:{title:'Người bạn',thumb:'https://example.test/avatar',description:JSON.stringify({phone:'0901234567',qrCodeUrl:'https://example.test/qr'})}},m=parseZaloContent(data);
 assert.equal(m.contactCard.phone,'0901234567');assert.ok(richMessage(m).includes('tel:0901234567'));assert.ok(!richMessage(m).includes('qrCodeUrl'));assert.equal(parseZaloContent({msgType:'chat.recommended',content:{contactUid:'123',title:'<script>',thumb:'javascript:alert(1)'}}).contactCard.avatar,'');
 const records=[{id:'m',conversationId:'c',quoteSource:data}];repairZaloCards('z',{all:k=>k==='conversations'?[{id:'c',connectionId:'z'}]:records,put:(k,m)=>records[0]=m});assert.equal(records[0].contactCard.name,'Người bạn');
});
test('sticker IDs are hydrated, including older stored messages',async()=>{
 const source={msgType:'chat.sticker',content:{id:1111,catId:50}},parsed=parseZaloContent(source);assert.equal(parsed.sticker.id,1111);
 const records=new Map([['old',{id:'old',conversationId:'c',messageType:'chat.sticker',quoteSource:source}],['new',{id:'new',conversationId:'c',messageType:'chat.sticker',...parsed}]]);
 const count=await hydrateZaloStickers('z',{getStickersDetail:async ids=>{assert.deepEqual(ids,[1111]);return [{id:1111,stickerWebpUrl:'https://example.test/sticker.webp'}];}},{all:k=>k==='conversations'?[{id:'c',connectionId:'z'}]:[...records.values()],get:(k,id)=>records.get(id),put:(k,m)=>records.set(m.id,m)});
 assert.equal(count,2);assert.ok(richMessage(records.get('old')).includes('sticker.webp'));assert.equal(await hydrateZaloStickers('z',{getStickersDetail:()=>assert.fail('already hydrated')},{all:k=>k==='conversations'?[{id:'c',connectionId:'z'}]:[...records.values()]}),0);
});
test('group verifies actual members and directly adds missing selected customer',async()=>{
 let present=['1'],added=[];const result=await createVerifiedZaloGroup({getUserInfo:async()=>({changed_profiles:{1:{isFr:'1'},2:{isFr:1}}}),createGroup:async()=>({groupId:'g'}),getGroupInfo:async()=>({gridInfoMap:{g:{memVerList:present.map(x=>x+'_0')}}}),addUserToGroup:async ids=>{added=ids;present.push(...ids);}},'Nhóm',['1','2']);
 assert.deepEqual(added,['2']);assert.deepEqual(result.missing,[]);assert.equal(result.warning,'');assert.equal(result.verified,true);
});
test('group never silently substitutes a link invitation for a nonfriend',async()=>{
 await assert.rejects(createVerifiedZaloGroup({getUserInfo:async()=>({changed_profiles:{2:{isFr:0}}}),createGroup:()=>assert.fail('must not create')},'Nhóm',['1','2']),/Cần kết bạn/);
 const result=await createVerifiedZaloGroup({createGroup:async()=>({groupId:'g'}),getGroupInfo:async()=>({gridInfoMap:{g:{memberIds:['1']}}}),addUserToGroup:async()=>({errorMembers:['2']})},'Nhóm',['1','2']);assert.deepEqual(result.missing,['2']);assert.ok(result.warning);
});
