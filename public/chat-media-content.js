const object=v=>{if(v&&typeof v==='object')return v;try{return JSON.parse(v)||{};}catch{return {};}};
const url=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
export const isTypeCode=v=>/^\[?chat\.[\w.]+\]?$/i.test(String(v||'').trim());
export function mediaContent(data={}){
 const c=object(data.content),info={...object(c.params),...object(c.description),...object(c.msgInfo),...c},type=/video/i.test(data.msgType)?'video':/voice|audio/i.test(data.msgType)?'audio':/photo|image/i.test(data.msgType)?'image':'file';
 const link=[info.hdUrl,info.videoUrl,info.audioUrl,info.normalUrl,info.href,info.url,info.fileUrl,...(type==='image'?[info.thumb]:[])].map(url).find(Boolean)||'';
 const caption=[c.title,typeof c.description==='string'?c.description:''].filter(v=>v&&!isTypeCode(v)&&!url(v)).join('\n');
 const text=typeof data.content==='string'&&!Object.keys(c).length&&!isTypeCode(data.content)?data.content:caption;
 return {text:text||(link?'':type==='video'?'Video không còn liên kết phát.':type==='image'?'Ảnh không còn liên kết xem.':'Tệp đính kèm'),attachments:link?[{url:link,name:caption||(type==='video'?'Video':type==='image'?'Ảnh':'Tệp đính kèm'),type,poster:url(info.thumb)}]:[]};
}
