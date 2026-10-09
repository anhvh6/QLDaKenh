export function collectionPolicy({bankTransfer=false,freeShipping=true,total=0,paid=0}={}){
 return {cod:bankTransfer?0:Math.max(0,Number(total)-Number(paid)),payment:bankTransfer?(freeShipping?1:4):(freeShipping?3:2)};
}
export function cheapestService(rows=[]){
 return rows.filter(r=>r.GIA_CUOC!==null&&r.GIA_CUOC!==undefined&&String(r.GIA_CUOC).trim()!==''&&Number.isFinite(Number(r.GIA_CUOC))&&Number(r.GIA_CUOC)>=0).reduce((best,r)=>!best||Number(r.GIA_CUOC)<Number(best.GIA_CUOC)?r:best,null);
}
