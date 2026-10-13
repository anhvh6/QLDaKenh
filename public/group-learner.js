export function groupLearner(S,c){
 if(!c||c.threadType!==1)return S.customers?.find(p=>p.id===c?.customerId)||null;
 const ids=new Set([...(c.group?.memberIds||[]),...(c.group?.members||[]).map(m=>m.id)].map(String).filter(id=>id!==String(c.group?.ownId)));
 const contacts=(S.conversations||[]).filter(v=>v.connectionId===c.connectionId&&v.threadType!==1&&!v.deletedAt&&ids.has(String(v.externalUserId)));
 const chosen=contacts.find(v=>v.customerId===c.learnerCustomerId||String(v.externalUserId)===String(c.learnerMemberId));
 const candidate=chosen||contacts.filter(v=>v.isFriend!==true).sort((a,b)=>String(b.lastAt||'').localeCompare(String(a.lastAt||'')))[0]||contacts.sort((a,b)=>String(b.friendSyncedAt||b.createdAt||'').localeCompare(String(a.friendSyncedAt||a.createdAt||'')))[0];
 return S.customers?.find(p=>p.id===candidate?.customerId)||null;
}
