export function contentGroups(items){
 const groups=new Map();for(const c of [...items].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(a.id).localeCompare(String(b.id)))){
  const at=Date.parse(c.createdAt),key=Number.isFinite(at)?new Date(at+7*3600000).toISOString().slice(0,10):'';
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);
 }
 return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([day,items])=>({day,label:day?day.split('-').reverse().join('/'):'Chưa có ngày tạo',items}));
}
