export const posStatusNames={0:'Mới',17:'Chờ xác nhận',1:'Đã xác nhận',11:'Chờ hàng',20:'Đã đặt hàng',12:'Chờ in',13:'Đã in',8:'Đang đóng hàng',9:'Chờ chuyển hàng',2:'Đã gửi hàng',3:'Đã nhận',16:'Đã thu tiền',4:'Đang hoàn',15:'Hoàn một phần',5:'Đã hoàn',6:'Đã hủy',7:'Đã xóa'};
export const posTransitions={0:[17,1,11,20,12,13,8,9,6],17:[1,6],1:[11,20,12,13,8,9,6],11:[20,12,13,8,9,6],20:[12,13,8,9,6],12:[13,8,9,6],13:[8,9,6],8:[9,6],9:[1,2,6],2:[3,4],3:[16,4],4:[15,5],15:[5],16:[],5:[],6:[],7:[]};
export function posStatusOptions(row,{directCarrier=false}={}){
 const code=Number(row.status),partner=row.partner||{},tracking=partner.extend_code||partner.order_number_vtp;
 return (posTransitions[code]||[]).map(status=>({status,label:posStatusNames[status],reason:
 code===17&&status===1?'Duyệt đối soát trên POS trước khi xác nhận.':
 directCarrier?'Vận đơn trực tiếp: cập nhật từ hãng vận chuyển.':
 [16,15,5].includes(status)?'Thực hiện thu tiền / kiểm hàng hoàn trên POS để đối soát.':
 tracking&&[2,3,4].includes(status)?'Trạng thái này được cập nhật từ hãng vận chuyển.':
 tracking&&[1,6].includes(status)&&!['request_received','waiting','processing_picked_up','picking_up','canceled',null,undefined].includes(partner.partner_status)?'Hãng đã lấy hàng; cần xử lý với hãng vận chuyển.':''}));
}
