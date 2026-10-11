# Kiểm tra chat và tiến trình học viên — 11/10/2026

## Kiểm tra trên hệ thống đang chạy

- Tin nhắn do người dùng gửi từ nick khác: “Kiểm tra chat hoàng anh”. Máy chủ nhận lúc 10:33 giờ Việt Nam; giao diện hiển thị trong hội thoại Hoàng Anh, kênh Yixi, tin nhắn riêng.
- Mở hội thoại chuyển thẻ sang đã đọc. Không ghi nhận lỗi JavaScript khi quan sát.
- Kiểm tra form hồ sơ, đặt cọc và đặt lịch của Hoàng Anh bằng dữ liệu hiện có, đóng form không lưu.
- Không tạo lịch, gửi tin trả lời, sửa tiến trình hoặc tạo vận đơn thật trong lần kiểm tra này.

## Kiểm thử bằng dữ liệu riêng

Các script giao diện khởi động máy chủ localhost với thư mục dữ liệu riêng, không dùng dữ liệu sản xuất.

| Luồng | Kết quả |
|---|---|
| Hai nhân viên đang gõ; cảm xúc; chuyển tiếp nhiều đích; chọn nhiều tin | Đạt |
| Nhắc việc từ tin đến/tin gửi; mở việc; hoàn tất bằng trả lời hoặc nút xử lý | Đạt sau sửa lỗi chọn nhân viên |
| Tin nhắn nhanh, chủ đề, nhập/xuất Excel và xóa nhiều mẫu | Đạt |
| Ảnh, sticker, video, mention, preview liên kết, xem ảnh toàn màn hình | Đạt |
| Tạo lịch ở Người mới | Đạt; chuyển thành Hẹn tư vấn |
| Tạo lịch ở tiến trình cao hơn | Đạt; giữ nguyên tiến trình |
| Cọc mặc định, tải lại thông tin cũ, khóa sản phẩm cũ và sửa bằng bút | Đạt |
| Đủ tiền, học phí còn lại sau cọc, cảnh báo hạ tiến trình trước lưu | Đạt |
| Nhắc tư vấn quá hạn; chỉ hiện ở Hẹn tư vấn hoặc thấp hơn; trả lời và xử lý | Đạt |
| Nhóm chung, thành viên nhóm, chọn/lưu học viên đại diện, đổi tên | Đạt |
| Tạo phác đồ từ chat, preview và quay lại hội thoại | Đạt |
| Số điện thoại/danh thiếp/địa chỉ mới vào form đơn; tên người nhận độc lập tên nick | Đạt |

Kiểm tra cú pháp thành công. Bộ kiểm thử tự động: **234/234 đạt**.

## Lỗi đã sửa trong lần rà soát

1. Mục Thành viên nhóm gọi chức năng bị thiếu: bổ sung danh sách, tìm kiếm, avatar, màu tiến trình và mở hội thoại cá nhân.
2. Chọn nhân viên nhắc việc bị lỡ cú bấm khi mất focus ô nhập và dòng đang gõ biến mất: giữ focus trong lúc chọn.
3. Học viên/phác đồ đã xóa vẫn được gắn nhãn tên “Phác đồ còn hiệu lực”: loại dữ liệu đã xóa khỏi quy tắc này.
4. Cập nhật các script kiểm thử cũ theo vị trí/nút và quy tắc đặt lịch hiện hành.
5. Bảng chọn thẻ hội thoại tràn màn hình điện thoại: neo bảng dưới thanh tên và giữ trong chiều rộng màn hình.

## Tối ưu tốc độ

- Nén gzip bất đồng bộ cho phản hồi JSON từ 64 KiB, chỉ khi trình duyệt chấp nhận gzip. Giữ Cache-Control: no-store và Vary: Accept-Encoding.
- Trên dữ liệu chat thực tế (tin nhắn, hội thoại, khách hàng), dung lượng JSON **5.261.978 byte → 1.430.341 byte**, giảm **73%**. Đây là phép đo dung lượng, không phải cam kết giảm 73% thời gian tải trang.
- Tính thống kê sử dụng thư viện media theo một lượt thay vì quét toàn bộ tin nhắn riêng cho từng tài sản.
- Bỏ qua dựng lại giao diện inbox khi phản hồi trạng thái không đổi, tránh tải lại media không cần thiết.

## Phạm vi chưa chứng minh trực tiếp

Tin đến Zalo thật đã được xác nhận. Tin gửi ra, chuyển tiếp ra Zalo và tạo nhắc hẹn Zalo thật được kiểm tra qua các luồng riêng/mô phỏng; không gửi tới khách thật để kiểm thử. Chưa đo thời gian tải đầu cuối trên mạng của người dùng sau triển khai.
