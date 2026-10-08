import {fail} from './domain.mjs';
export function validateGroupMentions(c,text,mentions){
 if(mentions===undefined)return [];
 if(!Array.isArray(mentions))fail('Tag thành viên không hợp lệ.');if(!mentions.length)return [];
 if(mentions.length>30||c.threadType!==1)fail('Tag thành viên chỉ dùng trong nhóm.');
 if(mentions.some(m=>!m||typeof m!=='object'))fail('Tag thành viên không hợp lệ.');
 const members=new Map((c.group?.members||[]).map(m=>[String(m.id),m]));let end=0;
 return [...mentions].sort((a,b)=>a.pos-b.pos).map(m=>{const member=members.get(String(m.uid));if(!member||!Number.isInteger(m.pos)||!Number.isInteger(m.len)||m.pos<end||m.len<2||m.pos+m.len>text.length||text.slice(m.pos,m.pos+m.len)!=='@'+member.name)fail('Tag thành viên không hợp lệ. Chọn lại từ danh sách nhóm.');end=m.pos+m.len;return {uid:String(m.uid),pos:m.pos,len:m.len};});
}
