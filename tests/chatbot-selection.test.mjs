import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {join,resolve} from 'node:path';
mkdirSync('test-data',{recursive:true});process.env.DATA_DIR=mkdtempSync(join(resolve('test-data'),'bot-selection-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put}=await import('../server/store.mjs');
const {requiresIntake,guardSelection,selectionPrompt,selectApprovedReply,storedBotContext}=await import('../server/chatbot-context.mjs');
const hello={id:'hello',text:'Xin chào bạn! Vì khóa học được thiết kế riêng, chị gửi giúp em 2 hình ảnh khuôn mặt nhé.'},price={id:'price',text:'Khóa học giá 2.099.000 VND trong 60 ngày'},habits={id:'habits',text:'Để thiết kế phác đồ, chị giúp em trả lời 5 câu hỏi về thói quen nhé.'},templates=[hello,price,habits],bot={generalInstructions:'Giữ mẫu đã cấu hình'};
test('intake requests mentioning course do not require intake; prices, explicit requirements and media still do',()=>{
 assert.equal(requiresIntake(hello),false);assert.equal(requiresIntake(habits),false);
 for(const t of [price,{...hello,requiresIntake:true},{...hello,assetIds:['image']},{...hello,text:hello.text+' Học phí 500k'},{...hello,text:hello.text+' Chuyển khoản trước nhé.'}])assert.equal(!!requiresIntake(t),true);
 assert.equal(guardSelection({templateIds:['hello'],needsStaff:false},templates,{intakeEvidence:[]}).needsStaff,false);
});
test('blocked commercial selection retries once with permitted samples rather than disabling a greeting',async()=>{
 let calls=0;const r=await selectApprovedReply(bot,templates,{currentTurn:{messages:[{text:'hi bạn'}]},intakeEvidence:[]},async prompt=>{
  calls++;if(calls===2){assert.ok(prompt.includes('collect_missing_information'));assert.ok(!prompt.includes('2.099.000'));}
  return {text:JSON.stringify({templateIds:[calls===1?'price':'hello'],needsStaff:false}),attempts:[{status:'success'}]};
 });assert.equal(calls,2);assert.deepEqual(r.selection.templateIds,['hello']);assert.equal(r.selection.needsStaff,false);assert.equal(r.attempts.length,2);
});
test('retry never permits foreign, duplicate or commercial samples and is bounded',async()=>{
 let calls=0;await assert.rejects(selectApprovedReply(bot,templates,{},async()=>({text:JSON.stringify({templateIds:[++calls===1?'price':'foreign'],needsStaff:false})})),/không hợp lệ/);assert.equal(calls,2);
 await assert.rejects(selectApprovedReply(bot,templates,{},async()=>({text:JSON.stringify({templateIds:['hello','hello'],needsStaff:false})})),/không hợp lệ/);
});
test('context focuses on unanswered messages in current chat while preserving older exchanges',async()=>{
 put('customers',{id:'p',name:'QA'});for(const id of ['current','other'])put('conversations',{id,customerId:'p',threadType:0});
 for(const [id,conversationId,direction,text,createdAt] of [['q','current','outgoing','Bạn gửi ảnh nhé','2026-10-11T01:00:00Z'],['a','current','incoming','Tôi đã gửi ảnh','2026-10-11T01:01:00Z'],['other','other','incoming','Giá bao nhiêu','2026-10-11T01:02:00Z']])put('messages',{id,conversationId,direction,text,createdAt,status:'received'});
 const ctx=await storedBotContext('p',{conversationId:'current'});assert.deepEqual(ctx.currentTurn.messages.map(m=>m.id),['a']);assert.equal(ctx.currentTurn.lastReply.id,'q');assert.equal(ctx.history.chronological.length,3);assert.ok(selectionPrompt(bot,templates,ctx).includes('Không chọn lại mẫu đã gửi nguyên văn'));
});
test('genuine unresolved questions still hand off; no arbitrary greeting fallback',async()=>{
 let calls=0;const r=await selectApprovedReply(bot,templates,{},async()=>{calls++;return {text:JSON.stringify({templateIds:[],needsStaff:true,reason:'Khách yêu cầu ngoại lệ chính sách'})};});assert.equal(calls,1);assert.equal(r.selection.needsStaff,true);
});
