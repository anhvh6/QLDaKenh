import {platformTextIssues} from './platform-text-rules.js';
import {reupText} from './reup-text.js';
import {reviewPublishText} from './publish-content-review.js';
// Presentation fallbacks never change the stored caption or publication receipt.
export const meaningfulText=value=>typeof value==='string'&&!/^[\s.\u2026]*$/.test(value)?value.trim():'';
export function contentLabel(content,publications=[]){
 const related=publications.filter(p=>p.contentId===content.id);
 return [content.caption,content.title,...related.flatMap(p=>[p.copySourceCaption,p.caption,p.title]),content.sourcePreview?.caption,content.sourcePreview?.title].map(meaningfulText).find(Boolean)||'Bài viết chưa có nội dung văn bản';
}
export function contentHasWarning(record){return !!(record.textRuleBlocked||record.contentReview?.warnings?.length);}
// Recompute drafts immediately; no publication receipt or editor visit is required.
// Queued destinations use their saved text, which may differ from the source draft.
export function contentWarnings(content,connections=[],publications=[]){
 const related=publications.filter(p=>p.contentId===content.id),latest=new Map();
 for(const p of [...related].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))))latest.set(p.connectionId,p);
 return connections.filter(ch=>(content.channels||[]).includes(ch.id)||latest.has(ch.id)).flatMap(ch=>{
  const p=latest.get(ch.id),persisted=p?.contentReview?.warnings||[];
  if(p&&['published','manually_confirmed','demo_published','cancelled'].includes(p.status))return persisted.map(w=>({...w,channelId:ch.id}));
  const variant=content.variants?.[ch.id]||{},text=p&&typeof p.caption==='string'?{title:p.title??content.title,caption:p.caption}:reupText(content,ch.provider,variant);
  const warnings=[...platformTextIssues(ch.provider,text),...reviewPublishText({provider:ch.provider,...text}),...persisted];
  if(p?.textRuleBlocked&&!warnings.length)warnings.push({message:p.error||'Cần kiểm tra nội dung trước khi đăng.'});
  return warnings.map(w=>({...w,channelId:ch.id,channel:ch.remoteName||ch.name||ch.provider}));
 });
}
export function sourcePreviewImage(record){
 const value=record?.sourcePreview?.thumbnail;
 try{const url=new URL(value);return url.protocol==='https:'&&!/\.(?:mp4|webm|mov|m3u8)(?:$|\/)/i.test(url.pathname)?url.href:'';}catch{return '';}
}
