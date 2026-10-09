# Thông tin để Viettel Post tra cứu lỗi tạo vận đơn

Đề nghị kiểm tra API tạo đơn cho tài khoản Production 0988262641, mã khách hàng 14280733.

- Thời điểm: 09/10/2026 17:17:24.912 (GMT+7), tương ứng 10:17:24.912 UTC.
- Endpoint: POST https://partner.viettelpost.vn/v2/order/createOrder
- Xác thực: token website đã đổi thành công qua LoginVTP; token mới còn hạn.
- ORDER_NUMBER / mã tham chiếu: MOC-MV0OXU91-E06899
- GROUPADDRESS_ID: 29380875 (A Hoàng Anh)
- CUS_ID: 0 theo mẫu tài liệu chính thức.
- ORDER_SERVICE: VMCH; API báo cước 24639 VND.
- ORDER_PAYMENT: 1; MONEY_COLLECTION: 0.
- PRODUCT_TYPE: HH; PRODUCT_WEIGHT: 500 gram; PRODUCT_QUANTITY: 1; PRODUCT_PRICE: 330000 VND.
- SENDER_PROVINCE / DISTRICT / WARD: 1 / 24 / 477.
- RECEIVER_PROVINCE / DISTRICT / WARD: 2 / 43 / 781.
- CHECK_UNIQUE: true.
- HTTP: 200; mã nghiệp vụ: 205; message: System error; không có mã vận đơn.
- listInventory và getPriceAllNlp hoạt động. Tài khoản và ba kho khớp website.
- Đã kiểm tra trùng trên website trước khi gửi theo điện thoại và mã tham chiếu, tất cả kho/trạng thái, ngày 03–09/10, không tìm thấy đơn.

Nhờ xác nhận lỗi phát sinh ở bước xác thực/quyền tạo đơn, cấu hình tài khoản/kho/dịch vụ, hay trường payload nào; và yêu cầu này có tạo vận đơn ở phía hãng không. Xin cung cấp mã vận đơn nếu đã tạo để tránh gửi trùng.

Không kèm token, mật khẩu, OTP hoặc thông tin người nhận. Tài liệu này chưa được gửi cho bên thứ ba.
