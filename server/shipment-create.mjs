import {fail} from './domain.mjs';
import {carrierTokenMetadata} from './carrier-token.mjs';
const id=(value,label)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)fail('Viettel Post chưa xác định được '+label+'. Bổ sung đầy đủ địa chỉ rồi lấy lại báo cước.');return n;};
export async function prepareCarrierCreation(a,p,token,request){
 const metadata=carrierTokenMetadata(token);if(!metadata.apiTokenReady)fail('Token Viettel Post đã hết hạn. Kết nối lại trong Cài đặt.');
 const quote=await request(a.environment,'/v2/order/getPriceAllNlp',{token,fullResponse:true,body:{SENDER_ADDRESS:p.SENDER_ADDRESS,RECEIVER_ADDRESS:p.RECEIVER_ADDRESS,PRODUCT_TYPE:p.PRODUCT_TYPE,PRODUCT_WEIGHT:p.PRODUCT_WEIGHT,PRODUCT_PRICE:p.PRODUCT_PRICE,MONEY_COLLECTION:p.MONEY_COLLECTION,PRODUCT_LENGTH:p.PRODUCT_LENGTH,PRODUCT_WIDTH:p.PRODUCT_WIDTH,PRODUCT_HEIGHT:p.PRODUCT_HEIGHT,TYPE:1}});
 const sender=quote?.SENDER_ADDRESS||quote?.data?.SENDER_ADDRESS,receiver=quote?.RECEIVER_ADDRESS||quote?.data?.RECEIVER_ADDRESS,services=quote?.RESULT||quote?.data?.RESULT||[];
 if(!services.some(s=>s.MA_DV_CHINH===p.ORDER_SERVICE))fail('Dịch vụ đã chọn không còn phù hợp. Lấy lại báo cước trước khi tạo đơn.');
 const inventory=Number(a.sender?.inventoryId||0);if(inventory&&!(a.inventories||[]).some(i=>Number(i.groupaddressId)===inventory))fail('Kho gửi không thuộc tài khoản vận chuyển đã chọn. Đồng bộ và chọn lại kho gửi.');
 const {PRODUCT_DETAIL,...base}=p;
 return {...base,GROUPADDRESS_ID:inventory,CUS_ID:metadata.customerId,ORDER_TYPE:1,TYPE:1,DELIVERY_DATE:new Date().toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour12:false}).replace(',',''),SENDER_PROVINCE:id(sender?.PROVINCE_ID,'tỉnh/thành người gửi'),SENDER_DISTRICT:sender?.DISTRICT_ID? id(sender.DISTRICT_ID,'quận/huyện người gửi'):null,SENDER_WARD:id(sender?.WARD_ID,'phường/xã người gửi'),RECEIVER_PROVINCE:id(receiver?.PROVINCE_ID,'tỉnh/thành người nhận'),RECEIVER_DISTRICT:receiver?.DISTRICT_ID?id(receiver.DISTRICT_ID,'quận/huyện người nhận'):null,RECEIVER_WARD:id(receiver?.WARD_ID,'phường/xã người nhận'),LIST_ITEM:PRODUCT_DETAIL};
}
