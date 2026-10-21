import {socialCan} from './social-capabilities.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const commentChannels=connections=>connections.filter(c=>!c.deletedAt&&c.status==='connected'&&socialCan(c.provider,'comments'));
export function toggleCommentChannel(selection,channels,id,checked){
 if(id==='all')return checked?null:[];
 const selected=new Set(selection===null?channels.map(c=>c.id):selection);
 checked?selected.add(id):selected.delete(id);
 const ids=channels.filter(c=>selected.has(c.id)).map(c=>c.id);
 return ids.length===channels.length?null:ids;
}
export function commentChannelHealth(row){
 if(!row)return {text:'',error:false};
 const error=row.status==='error'||Boolean(row.missingAuthorCount);
 const text=row.status==='error'?'Lỗi: '+(row.error||'Không đồng bộ được'):row.supported===false?'Chưa hỗ trợ API bình luận':row.backfilling?'Đang tải lịch sử':row.status==='ready'?'Đã đồng bộ':'Chờ đồng bộ';
 return {error,text:text+(row.missingAuthorCount?' · '+row.missingAuthorCount+' bình luận chưa được API cung cấp tên':'')};
}
export function commentChannelPicker(channels,selection,open=false,statusRows=[]){
 const selected=new Set(selection===null?channels.map(c=>c.id):selection),all=selection===null;
 const label=all?'Tất cả kênh':selected.size===1?(channels.find(c=>selected.has(c.id))?.remoteName||channels.find(c=>selected.has(c.id))?.name||'1 kênh'):selected.size?selected.size+' kênh':'Chọn kênh';
 const glyphs={facebook:'f',instagram:'◎',threads:'@',youtube:'▶',blogger:'B',devto:'DEV',x:'𝕏',mastodon:'m',bluesky:'🦋'};
 return `<details id="comment-channel-picker" class="comment-channel-picker" ${open?'open':''}><summary aria-label="Lọc kênh bình luận: ${escape(label)}" title="${escape(label)}"><span class="comment-filter-check ${all?'checked':selected.size?'partial':''}" aria-hidden="true"></span></summary><div class="comment-channel-options"><label class="comment-channel-all"><input type="checkbox" data-comment-channel="all" ${all?'checked':''}>Tất cả kênh</label>${channels.map(c=>{const health=commentChannelHealth(statusRows.find(row=>row.id===c.id));return `<label class="comment-channel-option"><input type="checkbox" data-comment-channel="${escape(c.id)}" ${selected.has(c.id)?'checked':''}><span class="social ${escape(c.provider)}" aria-hidden="true">${glyphs[c.provider]||'•'}</span><span class="comment-channel-copy"><span>${escape(c.remoteName||c.name)}</span><small data-channel-status="${escape(c.id)}" class="${health.error?'error':''}">${escape(health.text)}</small></span></label>`;}).join('')}</div></details>`;
}
