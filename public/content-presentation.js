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
export function contentState(content,publications=[]){
 const latest=new Map();for(const p of [...publications].filter(p=>p.contentId===content.id).sort((a,b)=>(Date.parse(b.updatedAt||b.scheduleAt||0)||0)-(Date.parse(a.updatedAt||a.scheduleAt||0)||0)))if(!latest.has(p.connectionId))latest.set(p.connectionId,p);
 const jobs=[...latest.values()];
 if(jobs.some(p=>['failed','unknown','blocked'].includes(p.status)))return 'failed';
 if(jobs.some(p=>['scheduled','dispatching','processing','awaiting_manual'].includes(p.status)))return 'scheduled';
 if(jobs.length&&jobs.every(p=>p.status==='demo_published'))return 'demo_published';
 if(jobs.length&&jobs.every(p=>['published','manually_confirmed','cancelled'].includes(p.status)))return jobs.every(p=>p.status==='cancelled')?'draft':'published';
 return content.status||'draft';
}
// Only current draft text can create a prepublication Warning status.
// Old reviews, missing thumbnails, media preparation and network failures cannot.
export function contentWarnings(content,connections=[],publications=[]){
 if(contentState(content,publications)!=='draft')return [];
 return connections.filter(ch=>(content.channels||[]).includes(ch.id)).flatMap(ch=>{
  const text=reupText(content,ch.provider,content.variants?.[ch.id]||{});
  const warnings=[...platformTextIssues(ch.provider,text),...reviewPublishText({provider:ch.provider,...text})];
  return warnings.map(w=>({...w,channelId:ch.id,channel:ch.remoteName||ch.name||ch.provider}));
 });
}
export function sourcePreviewImage(record){
 const value=record?.sourcePreview?.thumbnail;
 try{const url=new URL(value);return url.protocol==='https:'&&!/\.(?:mp4|webm|mov|m3u8)(?:$|\/)/i.test(url.pathname)?url.href:'';}catch{return '';}
}
