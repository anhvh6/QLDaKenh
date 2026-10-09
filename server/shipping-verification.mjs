// Only a carrier detail response can establish that a shipment was created.
export function verifyCarrierLink(shipment, detail, inventories, tracking) {
 if (!detail || String(detail.ORDER_NUMBER) !== tracking || !detail.RECEIVER_FULLNAME) throw Error('Hãng chưa trả đúng chi tiết vận đơn.');
 if (/\*/.test(String(detail.RECEIVER_PHONE||'')) || Number(detail.MONEY_COLLECTION)<0) throw Error('API đang che thông tin vận đơn; chủ shop có thể chọn file XLSX xuất từ website hãng để bổ sung thông tin đối chiếu.');
 if (!inventories?.some(i => String(i.groupaddressId) === String(detail.GROUPADDRESS_ID))) throw Error('Vận đơn không thuộc tài khoản đang kết nối.');
 if (String(detail.GROUPADDRESS_ID) !== String(shipment.sender?.inventoryId)) throw Error('Vận đơn khác kho gửi của đơn hàng.');
 if (String(detail.ORDER_REFERENCE || '') !== shipment.reference) throw Error('Mã tham chiếu tại hãng không khớp mã đơn trong hệ thống.');
 const phone = v => String(v || '').replace(/\D/g, '').replace(/^84/, '0');
 if (phone(detail.RECEIVER_PHONE) !== phone(shipment.receiver?.phone)) throw Error('Số điện thoại người nhận không khớp.');
 if (!Number.isFinite(Number(detail.MONEY_COLLECTION)) || Number(detail.MONEY_COLLECTION) !== shipment.cod) throw Error('Tiền thu hộ tại hãng không khớp đơn hàng.');
 return detail;
}
