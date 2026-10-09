# Tạo và đồng bộ vận đơn khi không có quyền xem log Viettel Post

API tạo đơn dùng `POST /v2/order/createOrder`, mã địa chỉ và kho gửi của hãng. `System error` được giữ là chưa rõ kết quả: không tự gửi lại hoặc thử một API tạo khác vì có thể tạo trùng.

## Đồng bộ lịch sử

Vào Đơn hàng → Đồng bộ vận đơn cũ, dán mã vận đơn thực tế từ danh sách Viettel Post (tối đa 100 mã/lần). Hệ thống đọc `GET /v2/order/detail-v2?o=...`, kiểm tra mã và kho thuộc tài khoản, nhập người nhận, hàng hóa, COD, cước, trạng thái. Để trống danh sách mã để cập nhật các vận đơn đã nhập và các vận đơn đã gắn với đơn nội bộ. Webhook tiếp tục nhận cập nhật; nút đồng bộ có thể lấy lại trạng thái khi chưa có callback.

Ngày 09/10/2026 đã đối chiếu 28 mã hiện trên website trong khoảng 03–09/10/2026: thêm 26, cập nhật 2, không có lỗi. Đây là phạm vi một tuần, chưa phải toàn bộ lịch sử tài khoản.

API của kết nối hiện tại trả điện thoại/địa chỉ `******`, tiền `-1` cho các vận đơn này. Không hiển thị số âm như cước thật hoặc coi tiền thiếu là 0. Trong Đồng bộ vận đơn cũ có thể chọn file XLSX xuất từ website Viettel Post (tối đa 1 MB/100 mã); hệ thống kiểm tra mã vận đơn, tài khoản/kho, tham chiếu và tên người nhận qua API, rồi bổ sung các trường bị che từ file. Dữ liệu file có nguồn và thời điểm nhập; lần đồng bộ API sau giữ lại các trường này nếu hãng tiếp tục che. Không ghi nhận thanh toán hay tồn kho từ file lịch sử.

File được tải lúc 16:43 đã được bộ đọc của hệ thống kiểm tra đủ 28 vận đơn, có đầy đủ điện thoại, địa chỉ và cước. Cần xuất các khoảng ngày khác để bổ sung lịch sử ngoài 03–09/10.

## Cách xử lý đơn đang chưa rõ kết quả

1. Kiểm tra trên website Viettel Post theo người nhận, điện thoại, ngày tạo, tất cả kho/trạng thái để tránh tạo trùng. Mã MOC là mã tham chiếu của shop, không phải mã vận đơn PKE do hãng cấp.
2. Nếu đã có vận đơn, mở Hành trình → Gắn vận đơn đã tạo trên Viettel Post. Nhập mã PKE. Hệ thống đọc chi tiết tại hãng và đối chiếu đúng tài khoản/kho, mã tham chiếu, điện thoại, COD trước khi gắn. Cước và trạng thái lấy từ hãng.

   Nếu hãng che điện thoại/COD, chủ shop có thể đính kèm file XLSX xuất từ website hãng. Hệ thống vẫn kiểm tra mã, kho và tham chiếu qua API; đối chiếu điện thoại/COD từ file và ghi lại nguồn xác minh. Nếu thiếu dữ liệu đối chiếu, việc gắn bị chặn.
3. Nếu xác định chưa có và tạo bằng website hãng, điền mã tham chiếu MOC của đơn nội bộ, đúng kho gửi, người nhận và COD. Sau đó gắn mã PKE như bước 2.
4. Sau khi có mã vận đơn, Hành trình → Lấy lại trạng thái từ hãng để cập nhật trực tiếp; webhook vẫn hoạt động bình thường. Trạng thái giao hàng không tự ghi nhận tiền COD về shop.

## Thông tin chẩn đoán của hệ thống

Các lỗi API mới lưu thời điểm, môi trường, endpoint, HTTP status và mã trạng thái Viettel Post trong vận đơn. Hành trình hiển thị các trường này. Không lưu token, mật khẩu hay response headers vào phần chẩn đoán. Các lần lỗi cũ không có dữ liệu này nên không thể khôi phục mã lỗi chi tiết đã bị bỏ qua.

Kiểm thử tự động dùng API giả lập; không chứng minh hãng đã nhận một vận đơn thực tế. Cần thử một đơn thật có phạm vi và giới hạn cước được chủ shop duyệt trước khi kết luận API tạo đơn đã hoạt động.
