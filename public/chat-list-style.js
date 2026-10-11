import {safeLink} from './inbox-model.js';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function chatTagStyle(value){
 const background=/^#[0-9a-f]{6}$/i.test(value)?value:'#73806e';
 const rgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4),luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 return `background:${background};color:${luminance>.179?'#000000':'#ffffff'}`;
}
export function groupAvatarHTML(c){
 const members=c.group?.members||[],faces=members.slice(0,2),groupUrl=safeLink(c.group?.avatar);
 while(faces.length<2)faces.push({name:c.group?.name||c.title||'?',avatar:faces.length===1?groupUrl:''});
 const count=Math.max(members.length,Number(c.group?.memberCount)||0),remaining=Math.max(0,count-2);
 return faces.map((m,i)=>{const name=m.name||'?',url=safeLink(m.avatar),initials=name.trim().split(/\s+/).map(v=>v[0]).slice(-2).join('');return `<span class="chat-group-face face-${i}" data-initials="${e(initials)}">${url?`<img src="${e(url)}" alt="" loading="lazy" draggable="false">`:e(initials)}${i===1&&remaining?`<span class="chat-group-count">+${remaining}</span>`:''}</span>`;}).join('');
}
