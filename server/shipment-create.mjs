import {fail} from './domain.mjs';
import {carrierTokenMetadata} from './carrier-token.mjs';
const id=(value,label)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)fail('Viettel Post chưa xác định được '+label+'. Bổ sung đầy đủ địa chỉ rồi lấy lại báo cước.');return n;};
export async function prepareCarrierCreation(a,p,token,request){
 const metadata=carrierTokenMetadata(token);if(!metadata.apiTokenReady)fail('Token Viettel Post đã hết hạn. Kết nối lại trong Cài đặt.');
 for(const key of ['ORDER_NUMBER','SENDER_FULLNAME','SENDER_PHONE','SENDER_ADDRESS','RECEIVER_FULLNAME','RECEIVER_PHONE','RECEIVER_ADDRESS','PRODUCT_NAME','ORDER_SERVICE','ORDER_SERVICE_ADD','ORDER_NOTE'])if(p[key]!=null&&Buffer.byteLength(String(p[key]),'utf8')>150)fail('Viettel Post giới hạn '+key+' tối đa 150 byte UTF-8. Rút gọn thông tin trước khi gửi.');
 for(const item of p.PRODUCT_DETAIL||[])if(Buffer.byteLength(String(item.PRODUCT_NAME||''),'utf8')>150)fail('Tên sản phẩm gửi Viettel Post vượt quá 150 byte UTF-8.');
 const quote=await request(a.environment,'/v2/order/getPriceAllNlp',{token,fullResponse:true,body:{SENDER_ADDRESS:p.SENDER_ADDRESS,RECEIVER_ADDRESS:p.RECEIVER_ADDRESS,PRODUCT_TYPE:p.PRODUCT_TYPE,PRODUCT_WEIGHT:p.PRODUCT_WEIGHT,PRODUCT_PRICE:p.PRODUCT_PRICE,MONEY_COLLECTION:p.MONEY_COLLECTION,PRODUCT_LENGTH:p.PRODUCT_LENGTH,PRODUCT_WIDTH:p.PRODUCT_WIDTH,PRODUCT_HEIGHT:p.PRODUCT_HEIGHT,TYPE:1}});
 const sender=quote?.SENDER_ADDRESS||quote?.data?.SENDER_ADDRESS,receiver=quote?.RECEIVER_ADDRESS||quote?.data?.RECEIVER_ADDRESS,services=quote?.RESULT||quote?.data?.RESULT||[];
 if(!services.some(s=>s.MA_DV_CHINH===p.ORDER_SERVICE))fail('Dịch vụ đã chọn không còn phù hợp. Lấy lại báo cước trước khi tạo đơn.');
 const inventory=Number(a.sender?.inventoryId||0);if(inventory&&!(a.inventories||[]).some(i=>Number(i.groupaddressId)===inventory))fail('Kho gửi không thuộc tài khoản vận chuyển đã chọn. Đồng bộ và chọn lại kho gửi.');
 const {PRODUCT_DETAIL,...base}=p;
 // CUS_ID is 0 in the official sample; JWT UserId is not a documented CUS_ID.
 // Do not invent a delivery appointment when the customer did not request one.
 return {...base,ORDER_SERVICE_ADD:p.ORDER_SERVICE_ADD||'',GROUPADDRESS_ID:inventory,CUS_ID:0,ORDER_TYPE:1,TYPE:1,SENDER_PROVINCE:id(sender?.PROVINCE_ID,'tỉnh/thành người gửi'),SENDER_DISTRICT:sender?.DISTRICT_ID? id(sender.DISTRICT_ID,'quận/huyện người gửi'):null,SENDER_WARD:id(sender?.WARD_ID,'phường/xã người gửi'),RECEIVER_PROVINCE:id(receiver?.PROVINCE_ID,'tỉnh/thành người nhận'),RECEIVER_DISTRICT:receiver?.DISTRICT_ID?id(receiver.DISTRICT_ID,'quận/huyện người nhận'):null,RECEIVER_WARD:id(receiver?.WARD_ID,'phường/xã người nhận'),LIST_ITEM:PRODUCT_DETAIL};
}
