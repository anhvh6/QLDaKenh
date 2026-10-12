const normalized=v=>String(v||'').normalize('NFC').replace(/\s+/g,' ').trim();
export function numberedQuestions(template){
 const text=String(template.text||''),matches=[...text.matchAll(/^\s*(\d{1,2})[.)]\s+(.+)/gm)];
 if(matches.length<2||matches.length>10)return [];
 const questions=matches.map((m,i)=>({number:Number(m[1]),text:text.slice(m.index+(m[0].length-m[2].length),matches[i+1]?.index??text.length).trim()}));
 return questions.every((q,i)=>q.number===i+1)?questions:[];
}
export function followUpReply(out,templates,context){
 if(!out.followUp)return null;
 const f=out.followUp,t=templates.find(t=>t.id===f.templateId),questions=t&&numberedQuestions(t),rows=context.intakeEvidence||[];
 const asked=rows.find(m=>m.id===f.questionMessageId&&m.direction==='outgoing'&&m.conversationId===context.currentTurn?.conversationId);
 if(!questions?.length||!out.templateIds.includes(t.id)||out.templateIds.length!==1||t.assetIds?.length||!asked||!questions.every(q=>normalized(asked.text).includes(normalized(q.text)))||!Array.isArray(f.answered))throw Error('Không xác minh được câu hỏi cần bổ sung');
 const answered=new Set();
 for(const a of f.answered){
  if(!questions.some(q=>q.number===a.number)||answered.has(a.number)||a.complete!==true||!Array.isArray(a.evidenceIds)||!a.evidenceIds.length||!a.evidenceIds.every(id=>rows.some(m=>m.id===id&&m.direction==='incoming'&&m.conversationId===asked.conversationId&&m.createdAt>asked.createdAt&&/[\p{L}\p{N}]/u.test(String(m.text||'')))))throw Error('Không xác minh được câu trả lời đã có');
  answered.add(a.number);
 }
 const missing=questions.filter(q=>!answered.has(q.number));
 if(!answered.size||!missing.length)throw Error('Không có phần trả lời thiếu phù hợp');
 return 'Em đã ghi nhận những thông tin chị chia sẻ. Chị giúp em bổ sung thêm '+missing.length+' ý còn lại nhé:\n\n'+missing.map(q=>q.number+'. '+q.text).join('\n\n');
}
