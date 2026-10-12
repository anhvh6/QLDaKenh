import test from 'node:test';import assert from 'node:assert/strict';
import {numberedQuestions,followUpReply} from '../server/chatbot-followup.mjs';
const t={id:'habits',text:'Chị giúp em trả lời 5 câu hỏi nhé:\n\n1. Chị nhai bên nào?\n\n2. Chị ngủ nghiêng bên nào?\n\n3. Chị có vắt chéo chân không?\n\n4. Công việc và tư thế thường ngày?\n\n5. Chị muốn cải thiện điểm nào?'},q={id:'q',conversationId:'c',direction:'outgoing',text:t.text,createdAt:'2026-10-12T01:00:00Z'},a={id:'a',conversationId:'c',direction:'incoming',text:'1. Nhai phải. 2. Ngủ trái. 3. Không vắt chân.',createdAt:'2026-10-12T01:01:00Z'},ctx={intakeEvidence:[q,a],currentTurn:{conversationId:'c'}},out={templateIds:[t.id],followUp:{templateId:t.id,questionMessageId:q.id,answered:[1,2,3].map(number=>({number,complete:true,evidenceIds:[a.id]}))}};
test('3/5 answers produces a polite follow-up asking only questions 4 and 5',()=>{
 assert.equal(numberedQuestions(t).length,5);const text=followUpReply(out,[t],ctx);assert.ok(text.includes('bổ sung thêm 2 ý'));assert.ok(text.includes('4. Công việc'));assert.ok(text.includes('5. Chị muốn'));for(const n of [1,2,3])assert.ok(!text.includes(n+'. '));
});
test('evidence may span messages but cannot come from other customers, old text or staff',()=>{
 for(const patch of [{conversationId:'other'},{direction:'outgoing'},{createdAt:'2026-10-11'},{text:'👍'}])assert.throws(()=>followUpReply(out,[t],{...ctx,intakeEvidence:[q,{...a,...patch}]}));
 const a2={...a,id:'a2',text:'3. Không',createdAt:'2026-10-12T01:02:00Z'};const split=structuredClone(out);split.followUp.answered[2].evidenceIds=['a2'];assert.ok(followUpReply(split,[t],{...ctx,intakeEvidence:[q,a,a2]}).includes('4.'));
});
test('fabricated question numbers, missing origin, incomplete evidence and full completion cannot silently omit questions',()=>{
 for(const change of [f=>f.questionMessageId='fake',f=>f.answered[0].number=9,f=>f.answered[0].complete=false,f=>f.answered=[],f=>f.answered.push(...[4,5].map(number=>({number,complete:true,evidenceIds:['a']})))]){const bad=structuredClone(out);change(bad.followUp);assert.throws(()=>followUpReply(bad,[t],ctx));}
 assert.throws(()=>followUpReply(out,[{...t,assetIds:['media']}],ctx));assert.deepEqual(numberedQuestions({text:'1. A\n3. C'}),[]);
});
