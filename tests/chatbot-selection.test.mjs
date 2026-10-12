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

test('entire chat history remains available beyond 200 messages, including original intake questions',async()=>{
 put('customers',{id:'full-p',name:'Full QA'});put('conversations',{id:'full-c',customerId:'full-p',threadType:0});
 for(let i=0;i<240;i++)put('messages',{id:'full-'+i,conversationId:'full-c',direction:i===0?'outgoing':'incoming',text:i===0?'Câu hỏi ban đầu?':'Tin '+i,createdAt:new Date(1700000000000+i*1000).toISOString(),status:'received'});
 const ctx=await storedBotContext('full-p',{conversationId:'full-c'});assert.equal(ctx.history.chronological.length,240);assert.equal(ctx.history.chronological[0].text,'Câu hỏi ban đầu?');assert.ok(selectionPrompt(bot,templates,ctx).includes('Câu hỏi ban đầu?'));
});

test('repeated full questionnaire is reselected into a verified partial follow-up',async()=>{
 const t={id:'questions',text:'Chị giúp em trả lời câu hỏi nhé:\n1. Chị nhai bên nào?\n2. Chị ngủ nghiêng bên nào?\n3. Công việc thường ngày?'},q={id:'q',conversationId:'c',direction:'outgoing',text:t.text,createdAt:'2026-01-01'},a={id:'a',conversationId:'c',direction:'incoming',text:'Nhai phải và ngủ trái',createdAt:'2026-01-02'},ctx={intakeEvidence:[q,a],currentTurn:{conversationId:'c',messages:[a],lastReply:q}};let calls=0;
 const r=await selectApprovedReply(bot,[t],ctx,async()=>({text:JSON.stringify(++calls===1?{templateIds:[t.id],needsStaff:false}:{templateIds:[t.id],needsStaff:false,followUp:{templateId:t.id,questionMessageId:q.id,answered:[1,2].map(number=>({number,complete:true,evidenceIds:[a.id]}))}})}));
 assert.equal(calls,2);assert.ok(r.replyText.includes('3. Công việc'));assert.ok(!r.replyText.includes('1. Chị nhai'));
});
