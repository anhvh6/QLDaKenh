export const mediaSortOptions=[['newest','Mới tải lên trước'],['oldest','Cũ nhất trước'],['name','Tên A–Z'],['used','Mới sử dụng trước'],['popular','Dùng nhiều nhất']];
export const shortMediaName=(name,max=26)=>{name=String(name||'Không tên');if([...name].length<=max)return name;const dot=name.lastIndexOf('.'),ext=dot>0&&name.length-dot<=6?name.slice(dot):'';return [...name.slice(0,ext?dot:undefined)].slice(0,max-ext.length-1).join('')+'…'+ext;};
export function mediaRows(assets,{folder='all',sort='newest',query='',kind='',favorites=[],from='',to='',inactive=false}={}){
 let rows=assets.filter(a=>(inactive?a.active===false:a.active!==false));
 if(folder==='recent')rows=rows.filter(a=>['image','video'].includes(a.type)&&a.usage?.count>0).sort((a,b)=>String(b.usage.lastAt||'').localeCompare(String(a.usage.lastAt||''))||String(a.id).localeCompare(String(b.id))).slice(0,20);
 else if(folder==='favorites')rows=rows.filter(a=>favorites.includes(a.id));
 else if(folder==='none')rows=rows.filter(a=>!(a.categoryIds||[]).length);
 else if(folder!=='all')rows=rows.filter(a=>(a.categoryIds||[]).includes(folder));
 rows=rows.filter(a=>(!kind||a.type===kind)&&(!from||String(a.createdAt||'').slice(0,10)>=from)&&(!to||String(a.createdAt||'').slice(0,10)<=to)&&[a.name,a.description,...(a.tags||[])].join(' ').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
 const compare=sort==='popular'?(a,b)=>(b.usage?.count||0)-(a.usage?.count||0):sort==='name'?(a,b)=>String(a.name).localeCompare(String(b.name),'vi',{numeric:true}):sort==='used'?(a,b)=>String(b.usage?.lastAt||'').localeCompare(String(a.usage?.lastAt||'')):sort==='oldest'?(a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')):(a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''));return rows.sort((a,b)=>compare(a,b)||String(a.id).localeCompare(String(b.id)));
}
export function mediaFolders(assets,categories=[],favorites=[]){return [['all','Tất cả','image'],['recent','Dùng gần đây','clock'],['favorites','Yêu thích','heart'],...categories.filter(c=>c.active!==false).sort((a,b)=>(a.order||0)-(b.order||0)).map(c=>[c.id,c.name,'folder']),['none','Chưa phân loại','folder']].map(([id,name,glyph])=>({id,name,glyph,count:mediaRows(assets,{folder:id,favorites}).length}));}
export function savedMediaSort(user){try{return localStorage.getItem('media-sort:'+user)||'newest';}catch{return 'newest';}}
export function saveMediaSort(user,value){try{localStorage.setItem('media-sort:'+user,value);}catch{}}
export async function refreshMediaUsage(H){if(!H.api)return;const data=await H.api('/media/usage');const map=new Map(data.usage.map(r=>[r.id,r]));for(const a of H.state.assets)if(map.has(a.id))a.usage=map.get(a.id);}
