import {all,get,db} from './store.mjs';
import {sourceVideoKey} from './copy-source-key.mjs';
export function contentSourceKey(c){return c?.sourceVideoKey||sourceVideoKey(c?.sourceCopyId?get('copy_posts',c.sourceCopyId):null)||(c?.sourceURL?sourceVideoKey({sourceURL:c.sourceURL}):'');}
export function copySourceBlock(content,connectionId,{publicationId='',dispatch=false}={}){
 const globalPlatform=!!content?.copyFallbackOf,provider=globalPlatform?get('connections',connectionId)?.provider:'';
 const sameTarget=p=>p.connectionId===connectionId||globalPlatform&&provider&&p.connectionId&&get('connections',p.connectionId)?.provider===provider;
 const key=contentSourceKey(content);if(!key)return '';
 const keys=new Map(all('contents').map(c=>[c.id,contentSourceKey(c)])),publications=all('publications'),current=publications.find(p=>p.id===publicationId);
 for(const p of publications){
  if(p.id===publicationId||!sameTarget(p)||(p.sourceVideoKey||keys.get(p.contentId))!==key)continue;
  if(['published','manually_confirmed','demo_published'].includes(p.status))return 'Bài nguồn này đã đăng trên kênh này; chặn đăng trùng.';
  if(['dispatching','processing','awaiting_manual','unknown'].includes(p.status))return 'Bài nguồn này đang xử lý hoặc chưa rõ kết quả trên kênh này; cần đối soát trước khi đăng lại.';
  if(p.status==='scheduled'&&p.contentId!==content.id){
   if(dispatch&&current&&(String(p.createdAt||'').localeCompare(String(current.createdAt||''))||p.id.localeCompare(current.id))>0)continue;
   return 'Bài nguồn này đã có lịch trên kênh này; chặn xếp lịch trùng.';
  }
 }
 return '';
}
export function backfillCopyHistory(){for(const p of all('publications'))if(!p.sourceVideoKey){const key=contentSourceKey(get('contents',p.contentId));if(key)db.prepare("UPDATE records SET data=json_set(data,'$.sourceVideoKey',?),version=version+1 WHERE kind='publications' AND id=?").run(key,p.id);}}
