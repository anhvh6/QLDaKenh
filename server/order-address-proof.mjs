import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
const key=randomBytes(32);
export function addressProof(location){const payload=Buffer.from(JSON.stringify({...location,expires:Date.now()+86400000})).toString('base64url');return payload+'.'+createHmac('sha256',key).update(payload).digest('base64url');}
export function verifiedAddress(input,target,address){
 if(!input.addressProof){if(input.requireAddressValidation===true||input.requireAddressValidation==='true')throw Object.assign(Error('Chọn và xác nhận đầy đủ khu vực nhận hàng trước khi tạo đơn.'),{status:400});return null;}
 try{const [p,s,...extra]=String(input.addressProof).split('.'),expected=createHmac('sha256',key).update(p).digest('base64url');if(extra.length||!s||s.length!==expected.length||!timingSafeEqual(Buffer.from(s),Buffer.from(expected)))throw Error();const location=JSON.parse(Buffer.from(p,'base64url'));if(location.expires<Date.now()||location.target!==(target||'')||location.fullAddress!==String(address||'').trim())throw Error();delete location.expires;return location;}catch{throw Object.assign(Error('Địa chỉ đã thay đổi hoặc hết phiên xác nhận. Vui lòng kiểm tra lại khu vực nhận hàng.'),{status:400});}
}
