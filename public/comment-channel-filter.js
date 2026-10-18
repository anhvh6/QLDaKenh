const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const commentChannels=connections=>connections.filter(c=>c.status==='connected'&&['facebook','instagram','threads','youtube','blogger','devto','x'].includes(c.provider));
export function toggleCommentChannel(selection,channels,id,checked){
 if(id==='all')return checked?null:[];
 const selected=new Set(selection===null?channels.map(c=>c.id):selection);
 checked?selected.add(id):selected.delete(id);
 const ids=channels.filter(c=>selected.has(c.id)).map(c=>c.id);
 return ids.length===channels.length?null:ids;
}
export function commentChannelPicker(channels,selection,open=false){
 const selected=new Set(selection===null?channels.map(c=>c.id):selection),all=selection===null;
 const label=all?'Tất cả kênh':selected.size===1?(channels.find(c=>selected.has(c.id))?.remoteName||channels.find(c=>selected.has(c.id))?.name||'1 kênh'):selected.size?selected.size+' kênh':'Chọn kênh';
 return `<details id="comment-channel-picker" class="comment-channel-picker" ${open?'open':''}><summary aria-label="Lọc kênh bình luận">${escape(label)}</summary><div class="comment-channel-options"><label><input type="checkbox" data-comment-channel="all" ${all?'checked':''}>Tất cả kênh</label>${channels.map(c=>`<label><input type="checkbox" data-comment-channel="${escape(c.id)}" ${selected.has(c.id)?'checked':''}>${escape(c.remoteName||c.name)}</label>`).join('')}</div></details>`;
}
