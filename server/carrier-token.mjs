// Metadata only: Viettel Post validates authenticity via listInventory/API calls.
export function carrierTokenMetadata(token){
 let claims;try{claims=JSON.parse(Buffer.from(String(token).split('.')[1],'base64url').toString());}catch{return {apiTokenReady:true,tokenKind:'unknown',customerId:0};}
 const customerId=Number.isSafeInteger(Number(claims.UserId))&&Number(claims.UserId)>0?Number(claims.UserId):0,expires=Number(claims.exp),webSession=Number(claims.Partner)===-1;
 return {customerId,apiTokenReady:!webSession&&!(Number.isFinite(expires)&&expires*1000<=Date.now()),tokenKind:webSession?'web-session':Number(claims.Partner)>0?'shop-api':'unknown',tokenExpiresAt:Number.isFinite(expires)?new Date(expires*1000).toISOString():null};
}
