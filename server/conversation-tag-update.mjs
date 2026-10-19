import {get,put,transaction,all} from './store.mjs';
import {permission,fail} from './domain.mjs';import {assertChannel} from './taophacdo.mjs';
// Apply explicit per-tag selections to the latest record; unrelated live updates survive.
export function updateConversationTags(user,id,changes){
 permission(user,'inbox');if(!Array.isArray(changes)||!changes.length||changes.length>100)fail('Danh sách thẻ không hợp lệ.');
 const allowed=new Set(all('tags').filter(t=>t.active!==false).map(t=>t.name));
 for(const change of changes)if(typeof change?.name!=='string'||typeof change.selected!=='boolean'||!allowed.has(change.name))fail('Thẻ không tồn tại hoặc đã ngừng sử dụng.');
 return transaction(()=>{const c=get('conversations',id);if(!c||c.deletedAt)fail('Không tìm thấy hội thoại.',404);assertChannel(user,c.connectionId);const tags=new Set(c.tags||[]);for(const change of changes)change.selected?tags.add(change.name):tags.delete(change.name);const next=[...tags];return JSON.stringify(next)===JSON.stringify(c.tags||[])?c:put('conversations',{...c,tags:next});});
}
