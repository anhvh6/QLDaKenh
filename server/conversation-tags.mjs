import {all,get,put,remove,transaction,audit} from './store.mjs';
import {fail,required,number} from './domain.mjs';
export function tagRoute(path,method,input,user){
 if(!path.startsWith('/api/care/tags'))return undefined;
 if(!['owner','manager'].includes(user.role))fail('Cần quyền quản lý thẻ.',403);
 if(path==='/api/care/tags'&&method==='POST'){
  const old=input.id?get('tags',input.id):null;if(input.id&&!old)fail('Không tìm thấy thẻ.',404);
  if(old&&input.version!==old.version)fail('Thẻ vừa thay đổi. Tải lại để sửa.',409);
  const name=required(input.name,'Tên thẻ',40);if(all('tags').some(t=>t.id!==old?.id&&t.name.toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi')))fail('Tên thẻ đã tồn tại.');
  if(!/^#[0-9a-f]{6}$/i.test(input.color))fail('Màu không hợp lệ.');
  const value={...old,name,color:input.color,row:number(input.row??old?.row??1,'Hàng',1,2),sortOrder:number(input.sortOrder??old?.sortOrder??all('tags').length+1,'Số thứ tự',1,9999),description:String(input.description??old?.description??'').slice(0,1000),active:input.active!==false};
  return transaction(()=>{if(old&&old.name!==name)for(const c of all('conversations').filter(c=>c.tags?.includes(old.name)))put('conversations',{...c,tags:[...new Set(c.tags.map(t=>t===old.name?name:t))]});const result=put('tags',value,old?.version);audit(user.id,'conversation_tag_saved',result.id);return result;});
 }
 if(path==='/api/care/tags/bulk'&&method==='POST'){
  if(!['stop','start','delete'].includes(input.action)||!Array.isArray(input.items)||!input.items.length||input.items.length>100)fail('Thao tác thẻ không hợp lệ.');
  return transaction(()=>{const rows=input.items.map(i=>{const t=get('tags',i.id);if(!t)fail('Không tìm thấy thẻ.',404);if(t.version!==i.version)fail('Thẻ vừa thay đổi.',409);return t;});for(const t of rows){if(input.action==='delete'){for(const c of all('conversations').filter(c=>c.tags?.includes(t.name)))put('conversations',{...c,tags:c.tags.filter(n=>n!==t.name)});remove('tags',t.id);}else put('tags',{...t,active:input.action==='start'},t.version);}audit(user.id,'conversation_tags_'+input.action,'tags',{ids:rows.map(t=>t.id)});return {changed:rows.length};});
 }
 fail('Không tìm thấy thao tác thẻ.',404);
}
