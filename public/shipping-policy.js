export function collectionPolicy({bankTransfer=false,freeShipping=true,total=0,paid=0}={}){
 return {cod:bankTransfer?0:Math.max(0,Number(total)-Number(paid)),payment:bankTransfer?(freeShipping?1:4):(freeShipping?3:2)};
}
