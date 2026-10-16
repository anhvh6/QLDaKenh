import {learnerRecord,learnerGroupContacts} from './learner-lookups.js';
export function groupLearner(S,c){
 if(!c||c.threadType!==1)return learnerRecord(S,'customers',c?.customerId)||null;
 const ids=new Set([...(c.group?.memberIds||[]),...(c.group?.members||[]).map(m=>m.id)].map(String).filter(id=>id!==String(c.group?.ownId)));
 const contacts=learnerGroupContacts(S,c,ids);
 const chosen=contacts.find(v=>v.customerId===c.learnerCustomerId||String(v.externalUserId)===String(c.learnerMemberId));
 const candidate=chosen||contacts.filter(v=>v.isFriend!==true).sort((a,b)=>String(b.lastAt||'').localeCompare(String(a.lastAt||'')))[0]||contacts.sort((a,b)=>String(b.friendSyncedAt||b.createdAt||'').localeCompare(String(a.friendSyncedAt||a.createdAt||'')))[0];
 return learnerRecord(S,'customers',candidate?.customerId)||null;
}
