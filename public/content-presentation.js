// Presentation fallbacks never change the stored caption or publication receipt.
export const meaningfulText=value=>typeof value==='string'&&!/^[\s.\u2026]*$/.test(value)?value.trim():'';
export function contentLabel(content,publications=[]){
 const related=publications.filter(p=>p.contentId===content.id);
 return [content.caption,content.title,...related.flatMap(p=>[p.copySourceCaption,p.caption,p.title]),content.sourcePreview?.caption,content.sourcePreview?.title].map(meaningfulText).find(Boolean)||'Bài viết chưa có nội dung văn bản';
}
export function contentHasWarning(record){return !!(record.textRuleBlocked||record.contentReview?.warnings?.length);}
export function sourcePreviewImage(record){
 const value=record?.sourcePreview?.thumbnail;
 try{const url=new URL(value);return url.protocol==='https:'&&!/\.(?:mp4|webm|mov|m3u8)(?:$|\/)/i.test(url.pathname)?url.href:'';}catch{return '';}
}
