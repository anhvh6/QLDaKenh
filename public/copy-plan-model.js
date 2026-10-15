export const planStates={draft:'Nháp',active:'Đang chạy',paused:'Tạm dừng',completed:'Hoàn tất',cancelled:'Đã hủy'};
export const itemStates={pending:'Chờ xếp lịch',scheduled:'Lên lịch',preparing:'Đang tải',ready:'Đã tải',publishing:'Đang đăng',published:'Đã Reup',failed:'Lỗi',unknown:'Cần kiểm tra',removed:'Đã loại'};
export function sourceIdentity(value){
 const u=new URL(String(value).trim());if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Nguồn phải là link HTTPS hợp lệ.');
 const host=u.hostname.toLowerCase(),path=decodeURIComponent(u.pathname).replace(/\/+$/,'');
 if(['www.tiktok.com','tiktok.com'].includes(host)&&/^\/@[\w.-]+$/.test(path))return {provider:'tiktok',url:'https://www.tiktok.com'+path};
 if(['www.facebook.com','facebook.com','m.facebook.com'].includes(host)&&/^\/[\w.-]+(?:\/(reels|videos))?$/.test(path)&&!['reel','watch','groups','pages','login','profile.php','share','share.php','home.php','settings','marketplace'].includes(path.split('/')[1].toLowerCase()))return {provider:'facebook',url:'https://www.facebook.com'+path+'/'};
 throw Error('Dán link trang Facebook, mục Reels/Video hoặc hồ sơ TikTok. Link bài riêng dùng tab Thủ công.');
}
export function dateBoundary(value,end=false){if(!value)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(value))return Date.parse(value+(end?'T23:59:59.999':'T00:00:00')+'+07:00');const n=Date.parse(value);return Number.isFinite(n)?n:NaN;}
export function videoInRange(video,from,to){const t=Date.parse(video.publishedAt);return Number.isFinite(t)&&(!from||t>=dateBoundary(from))&&(!to||t<=dateBoundary(to,true));}
export function dailySlots(plan,from,to){
 const start=Math.max(from,Date.parse(plan.startAt)),end=Math.min(to,plan.endAt?Date.parse(plan.endAt):to);if(!Number.isFinite(start)||end<start)return [];
 const out=[],day=new Date(start+7*3600000);day.setUTCHours(0,0,0,0);
 for(let n=day.getTime();n<=end+7*3600000;n+=86400000){const d=new Date(n);if(!(plan.weekdays||[0,1,2,3,4,5,6]).includes(d.getUTCDay()))continue;for(const clock of [...new Set(plan.times||[])].sort()){const [h,m]=clock.split(':').map(Number),t=n-7*3600000+(h*60+m)*60000;if(t>=start&&t<=end)out.push(new Date(t).toISOString());}}
 return out.sort();
}
export function filterPlanRows(rows,{search='',status='all',platforms=[],scope='all',sortKey='scheduleAt',direction='asc'}={},time=Date.now()){
 const q=search.trim().toLocaleLowerCase('vi'),bad=t=>['failed','blocked','unknown'].includes(t.status),live=t=>t.success||['published','demo_published','manually_confirmed'].includes(t.status);
 return rows.filter(r=>{
  const targets=r.targets||[],selected=platforms.length?targets.filter(t=>platforms.includes(t.provider)):targets;
  if(platforms.length&&!selected.length)return false;
  if(q&&![r.caption,r.title,r.url].join(' ').toLocaleLowerCase('vi').includes(q))return false;
  const at=Date.parse(r.scheduleAt),within=Number.isFinite(at)&&at>=time&&at<=time+86400000;
  if(scope!=='all'&&['pending','removed'].includes(r.state))return false;
  if(scope!=='all'&&!['published','failed','unknown','publishing'].includes(r.state)&&!selected.some(t=>live(t)||bad(t)||['dispatching','processing'].includes(t.status))&&(!Number.isFinite(at)||at>time+86400000||['pending','removed'].includes(r.state)))return false;
  if(status==='all')return true;
  if(status==='failed')return selected.some(bad)||!platforms.length&&['failed','unknown'].includes(r.state);
  if(status==='unknown')return selected.some(t=>t.status==='unknown')||!platforms.length&&r.state==='unknown';
  if(status==='published')return selected.some(live)||!targets.length&&r.state==='published';
  if(status==='publishing')return selected.some(t=>['dispatching','processing'].includes(t.status))||!targets.some(t=>t.publicationId)&&r.state==='publishing';
  if(status==='scheduled24')return within&&(['scheduled','preparing','ready'].includes(r.state)||selected.some(t=>t.status==='scheduled'));
  return r.state===status;
 }).sort((a,b)=>{
  const key=sortKey==='createdAt'?'downloadedAt':sortKey,value=r=>key==='state'?(itemStates[r.state]||r.state):r[key],x=value(a),y=value(b);
  if(!x||!y)return x?-1:y?1:String(a.id||'').localeCompare(String(b.id||''));
  return (direction==='asc'?1:-1)*(String(x).localeCompare(String(y),'vi')||String(a.id||'').localeCompare(String(b.id||'')));
 });
}
