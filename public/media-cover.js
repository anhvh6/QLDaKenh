const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let thumbnailsSupported=false;
export function setMediaThumbnailSupport(value){thumbnailsSupported=!!value;}
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#e9f0ed"/><path d="M218 105v60l52-30z" fill="#28664f"/></svg>');
// List/picker covers must never instantiate a video decoder or request an MP4.
export function mediaCover(asset){
 if(!asset)return '';
 if(asset.type==='audio'||asset.type==='file')return '<span class="media-audio" aria-label="Tệp đính kèm">♪</span>';
 const url=asset.type==='video'?(thumbnailsSupported?'/api/media/thumbnail/'+encodeURIComponent(asset.id):placeholder):asset.url;
 return `<img src="${escape(url)}" alt="${escape(asset.name||'Ảnh bài viết')}" loading="lazy" decoding="async">`;
}
export function mediaPreview(asset){return asset?.type==='video'?`<button type="button" class="media-video-cover" data-content-video="${escape(asset.url)}" aria-label="Phát video">${mediaCover(asset)}<span>▶ Phát video</span></button>`:mediaCover(asset);}
if(typeof document!=='undefined')document.addEventListener('click',event=>{
 const button=event.target.closest('[data-content-video]');if(!button)return;
 event.preventDefault();event.stopPropagation();const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='none';video.src=button.dataset.contentVideo;video.style.cssText='width:100%;max-height:70vh';button.replaceWith(video);void video.play().catch(()=>{});
});
