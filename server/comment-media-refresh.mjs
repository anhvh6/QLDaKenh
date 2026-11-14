// Facebook/Instagram CDN links carry rotating signatures and edge hostnames, so comparing whole URLs rewrote every comment
// conversation on every poll, which invalidated caches and made all open clients refetch. Compare the stable identity instead
// and re-save only when it changes or the stored (expiring) links are old.
const refreshAfterMs=12*3600*1000;
const identity=item=>{if(item?.type==='embed')return String(item.url||'');try{return new URL(item.url).pathname;}catch{return String(item?.url||'');}};
const key=list=>JSON.stringify((Array.isArray(list)?list:[]).map(item=>[item?.type,identity(item),item?.poster?identity({url:item.poster}):'']));
export function commentPostMediaNeedsSave(conversation,next,nowMs=Date.now()){
 if(!Array.isArray(next)||!next.length)return false;
 if(key(conversation?.postMedia)!==key(next))return true;
 const savedAt=Date.parse(conversation?.postMediaAt||'');
 return !Number.isFinite(savedAt)||nowMs-savedAt>=refreshAfterMs;
}
