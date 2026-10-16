const dayKey=value=>{if(!value)return '';const s=String(value);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';};
const dayNumber=value=>Date.parse(dayKey(value)+'T00:00:00+07:00')/86400000;
const parsed=value=>{if(typeof value==='string')try{return JSON.parse(value);}catch{return null;}return value;};
const normalize=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
export function learnerCycleSummary(customers,products,time=Date.now()){
 const today=dayKey(time),[year,month,day]=today.split('-').map(Number),start=new Date(Date.UTC(year,month-1-(day<15?1:0),15)),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,14));const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10),stats={new:0,noPlan:0,consultation:0,deposit:0,active:0,expiring:0,total:0,opened:0,profit:0};
 const map=new Map();for(const p of products){if(p.id_sp)map.set(String(p.id_sp).trim(),p);if(p.ten_sp)map.set('NAME:'+normalize(p.ten_sp),p);}
 for(const c of customers){if(c.status==='DELETED')continue;stats.total++;const created=/^\d{4}-\d{2}-\d{2}/.test(String(c.created_at||''))?String(c.created_at).slice(0,10):dayKey(c.created_at),inCycle=created>=from&&created<=to,hasPlan=!!String(c.video_date||c.Video_date||'').trim(),start=Number.isFinite(dayNumber(c.start_date))?dayNumber(c.start_date):dayNumber(today),current=Math.floor(dayNumber(today)-start)+1,end=dayNumber(c.end_date),left=Number.isFinite(end)?Math.ceil(end-dayNumber(today)):(c.duration_days||30)-Math.max(0,current);
  if(created===today)stats.new++;
  if(c.is_consultation){if(inCycle)stats.consultation++;}else if(c.is_deposit){if(inCycle)stats.deposit++;}else if(!hasPlan){if(inCycle)stats.noPlan++;}else if(current>=1&&left>=0&&left<=5)stats.expiring++;
  if(hasPlan&&current>=1&&left>5)stats.active++;
  const raw=parsed(c.raw_backup)||{};if((Array.isArray(raw.video_open_dates)&&raw.video_open_dates.includes(today))||raw.last_video_open_time&&dayKey(raw.last_video_open_time)===today)stats.opened++;
  if(inCycle){let cost=0,revenue=0;for(const i of (Array.isArray(parsed(c.san_pham))?parsed(c.san_pham):[])){const qty=Number(i.so_luong)||0;if(qty<=0)continue;const p=map.get(String(i.id_sp||'').trim())||map.get('NAME:'+normalize(i.ten_sp));cost+=(Number(i.gia_nhap??p?.gia_nhap)||0)*qty;revenue+=(Number(i.don_gia??i.gia_ban??p?.gia_ban)||0)*qty;}stats.profit+=((Number(c.gia_tien)||0)>0?Number(c.gia_tien):revenue)+(c.is_deposit?Number(c.deposit_amount)||0:0)-cost;}
 }return {stats,from,to,today};
}
