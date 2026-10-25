export const mediaSortOptions=[['newest','Mới tải lên trước'],['oldest','Cũ nhất trước'],['name','Tên A–Z'],['used','Mới sử dụng trước'],['popular','Dùng nhiều nhất']];
export const shortMediaName=(name,max=26)=>{name=String(name||'Không tên');if([...name].length<=max)return name;const dot=name.lastIndexOf('.'),ext=dot>0&&name.length-dot<=6?name.slice(dot):'';return [...name.slice(0,ext?dot:undefined)].slice(0,max-ext.length-1).join('')+'…'+ext;};
export function mediaRows(assets,{folder='all',sort=folder==='recent'?'popular':'newest',query='',kind='',favorites=[],from='',to='',inactive=false}={}){
 let rows=assets.filter(a=>(inactive?a.active===false:a.active!==false));
 if(folder==='recent')rows=rows.filter(a=>['image','video'].includes(a.type)&&a.usage?.chatCount>0);
 else if(folder==='favorites')rows=rows.filter(a=>favorites.includes(a.id));
 else if(folder==='none')rows=rows.filter(a=>!(a.categoryIds||[]).length);
 else if(folder!=='all')rows=rows.filter(a=>(a.categoryIds||[]).includes(folder));
 rows=rows.filter(a=>(!kind||a.type===kind)&&(!from||String(a.createdAt||'').slice(0,10)>=from)&&(!to||String(a.createdAt||'').slice(0,10)<=to)&&[a.name,a.description,...(a.tags||[])].join(' ').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
 const count=a=>folder==='recent'?a.usage?.chatCount||0:a.usage?.count||0,at=a=>folder==='recent'?a.usage?.chatLastAt||'':a.usage?.lastAt||'';
 const compare=sort==='popular'?(a,b)=>count(b)-count(a)||at(b).localeCompare(at(a)):sort==='name'?(a,b)=>String(a.name).localeCompare(String(b.name),'vi',{numeric:true}):sort==='used'?(a,b)=>at(b).localeCompare(at(a)):sort==='oldest'?(a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')):(a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''));return rows.sort((a,b)=>compare(a,b)||String(a.id).localeCompare(String(b.id)));
}
export function mediaFolders(assets,categories=[],favorites=[]){return [['all','Tất cả','image'],['recent','Dùng gần đây','clock'],['favorites','Yêu thích','heart'],...categories.filter(c=>c.active!==false).sort((a,b)=>(a.order||0)-(b.order||0)).map(c=>[c.id,c.name,'folder']),['none','Chưa phân loại','folder']].map(([id,name,glyph])=>({id,name,glyph,count:mediaRows(assets,{folder:id,favorites}).length}));}
export function savedMediaSort(user,folder='all'){const fallback=folder==='recent'?'popular':'newest';try{return localStorage.getItem('media-sort:'+user+(folder==='recent'?':chat-recent':''))||fallback;}catch{return fallback;}}
export function saveMediaSort(user,value,folder='all'){try{localStorage.setItem('media-sort:'+user+(folder==='recent'?':chat-recent':''),value);}catch{}}
export async function refreshMediaUsage(H){if(!H.api)return;const data=await H.api('/media/usage');const map=new Map(data.usage.map(r=>[r.id,r]));for(const a of H.state.assets)if(map.has(a.id))a.usage=map.get(a.id);}

export function mediaPage(rows,page=0,size=20){const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(Math.max(0,Number(page)||0),pages-1);return {items:rows.slice(current*size,(current+1)*size),page:current,pages,total:rows.length};}
