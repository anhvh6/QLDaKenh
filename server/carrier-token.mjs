// Metadata only: Viettel Post validates authenticity via listInventory/API calls.
export function carrierTokenMetadata(token){
 let claims;try{claims=JSON.parse(Buffer.from(String(token).split('.')[1],'base64url').toString());}catch{return {apiTokenReady:true,tokenKind:'unknown',customerId:0};}
 const customerId=Number.isSafeInteger(Number(claims.UserId))&&Number(claims.UserId)>0?Number(claims.UserId):0,expires=Number(claims.exp),expiry=Number.isFinite(expires)&&Math.abs(expires*1000)<=8640000000000000?expires*1000:null;
 // Partner is not a documented permission claim. A valid API login may return -1.
 const accountPhone=/^(?:0\d{9}|84\d{9})$/.test(String(claims.sub||''))?String(claims.sub):null;
 return {customerId,accountPhone,apiTokenReady:!(expiry!==null&&expiry<=Date.now()),tokenKind:Number(claims.Partner)>0?'shop-api':'api-session',tokenExpiresAt:expiry!==null?new Date(expiry).toISOString():null};
}
