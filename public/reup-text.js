// Map the original post once, at the destination boundary; keep the source caption intact.
const titledProviders=new Set(['youtube','blogger','devto']);
export function splitReupText(value){
 const text=String(value??'');const lines=text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)||[];let offset=0;
 for(const line of lines){const heading=line.replace(/[\r\n]+$/,'').trim();offset+=line.length;if(heading)return {title:heading,body:text.slice(offset),full:text};}
 return {title:'',body:'',full:text};
}
export function reupText(content={},provider,variant={}){
 const caption=String(variant.caption||content.caption||''),title=String(variant.title||content.title||'Video');
 if(!content.sourceCopyId&&!content.sourceVideoKey&&!content.sourceURL&&!content.copyPlanId)return {title,caption};
 const parts=splitReupText(caption);return {title:parts.title||title,caption:titledProviders.has(provider)?parts.body:parts.full};
}

// A retry must start with the complete caption, rather than treating a mapped body as a new post.
export function originalReupCaption(publication={},provider){
 if(typeof publication.copySourceCaption==='string')return publication.copySourceCaption;
 if(publication.copyTextMapped&&titledProviders.has(provider))return String(publication.title||'')+(publication.caption?'\n'+publication.caption:'');
 return publication.caption;
}
