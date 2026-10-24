import {platformTextIssues} from './platform-text-rules.js';
export function newComposerChannels(connections,providers){return connections.filter(c=>c.status==='connected'&&!c.provider?.startsWith('zalo')&&providers[c.provider]?.publish);}
export function inferredPostType(ids,assets){const selected=assets.filter(a=>ids.includes(a.id)&&a.active!==false);return selected.some(a=>a.type==='video')?'video':selected.some(a=>a.type==='image')?'image':'text';}
export function newComposerWarnings({title='',caption='',type='text',assets=[]},channels,providers){return channels.flatMap(ch=>{
 const rows=platformTextIssues(ch.provider,{title,caption});
 if(!providers[ch.provider]?.formats?.includes(type))rows.push({field:'type',message:`Kênh chưa hỗ trợ định dạng ${type==='text'?'văn bản':type==='video'?'video':'ảnh'}.`});
 if(assets.some(a=>a.type==='image')&&assets.some(a=>a.type==='video'))rows.push({field:'type',message:'Có cả ảnh và video; định dạng tự nhận diện là Video. Kênh có thể chỉ nhận video.'});
 return rows.map(issue=>({...issue,channelId:ch.id,channel:ch.remoteName||ch.name}));
});}
