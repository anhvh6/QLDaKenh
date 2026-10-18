export const formatLabels={text:'Văn bản / bài viết',image:'Ảnh',video:'Video',audio:'Âm thanh'};
export function composerType(content={},assets=[]){
 const selected=assets.filter(a=>(content.assets||[]).includes(a.id)&&a.active!==false),sourceTypes=content.sourceCopyId&&!content.copyReady?content.sourceMediaTypes||[]:[];
 if(content.sourceCopyId&&!content.copyReady){if(sourceTypes.includes('video'))return 'video';if(sourceTypes.includes('image'))return 'image';if(['image','video','audio'].includes(content.type))return content.type;}
 if(content.type==='text'||content.mediaUrl||selected.some(a=>a.type===content.type))return content.type||'text';
 return selected.find(a=>a.type==='video')?.type||selected[0]?.type||'text';
}
export function formatHint(provider,type){
 if(provider==='youtube'&&type!=='video')return 'YouTube cần video; không thể đăng bài chỉ có chữ hoặc ảnh. Chọn Video và thêm tệp video.';
 if(provider==='instagram'&&!['image','video'].includes(type))return 'Instagram cần ảnh hoặc video; không thể đăng bài chỉ có chữ. Chọn Ảnh/Video và thêm media.';
 return '';
}
