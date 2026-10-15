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
 const q=search.toLocaleLowerCase('vi');return rows.filter(r=>(!q||[r.caption,r.title,r.url].join(' ').toLocaleLowerCase('vi').includes(q))&&(scope==='all'||['published','failed','unknown'].includes(r.state)||Date.parse(r.scheduleAt)>=time&&Date.parse(r.scheduleAt)<=time+86400000)&&(status==='all'||(status==='scheduled24'?['scheduled','preparing','ready'].includes(r.state)&&Date.parse(r.scheduleAt)>=time&&Date.parse(r.scheduleAt)<=time+86400000:r.state===status))&&(!platforms.length||(r.targets||[]).some(t=>platforms.includes(t.provider)))).sort((a,b)=>(direction==='asc'?1:-1)*String(a[sortKey==='createdAt'?'downloadedAt':sortKey]||'').localeCompare(String(b[sortKey==='createdAt'?'downloadedAt':sortKey]||''),'vi'));
}
