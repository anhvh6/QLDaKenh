# Zalo cá nhân: đồng bộ và chăm sóc

## Vận hành

1. Trong **Cài đặt → Kênh kết nối**, quét QR bằng Zalo trên điện thoại và xác nhận đăng nhập.
2. Khi phiên nghe sẵn sàng, hệ thống tự tải danh bạ và lịch sử. Thẻ kênh hiển thị trạng thái nhận tin, số liên hệ, số tin đã đọc và lỗi nếu có.
3. **Đồng bộ** đọc lại từ lịch sử mới nhất; bản ghi đã có được chống trùng theo kênh, hội thoại và mã tin Zalo. **Tải thêm lịch sử** tiếp tục từ con trỏ của đợt trước khi chạm giới hạn 30 trang mỗi loại hội thoại.
4. Mở **Chat & chăm sóc** để xem tin. Tin mới cập nhật tự động, giữ bản nháp và hội thoại đang chọn. Danh bạ chưa có tin nằm cuối danh sách.
5. Trả lời dùng đúng loại hội thoại cá nhân/nhóm và phiên QR, không yêu cầu access token của Zalo OA.

## Giới hạn thực tế

- Tích hợp dùng `zca-js` 2.2.0 và phiên Zalo cá nhân, không phải API chính thức của Zalo OA.
- `requestOldMessages` chỉ lấy phần lịch sử Zalo trả về cho phiên này. Không bảo đảm lấy toàn bộ lịch sử trên điện thoại; không có chức năng sao lưu/khôi phục điện thoại trong tích hợp này.
- Bộ đếm tin đồng bộ là số tin đọc từ Zalo, có thể bao gồm tin đã tồn tại. Tin lịch sử không tự kích hoạt workflow, không đánh dấu hàng loạt là chưa đọc.
- Nội dung văn bản được lưu; ảnh/tệp/nhãn dán hiện mô tả hoặc dấu hiệu loại tin. Chưa tải tệp đính kèm hay sao lưu media.
- Tránh mở nhiều phiên Zalo Web cho cùng tài khoản. Nếu bị đá phiên, thẻ kênh báo lỗi để kết nối lại.

## Máy chủ

- Chạy một tiến trình sở hữu phiên Zalo (PM2 fork, một instance). Không chạy nhiều worker cùng nghe một tài khoản.
- Cookie/IMEI/user-agent lưu bằng kho secret mã hóa hiện có. Giữ DATA_DIR và khóa mã hóa qua các lần triển khai để khôi phục được phiên.
- Khởi động lại sẽ phục hồi các kênh API chưa chủ động ngắt. Phiên hết hạn cần quét QR lại.
- `/api/events` sử dụng SSE có xác thực, heartbeat 2 giây, `X-Accel-Buffering: no`. Reverse proxy phải cho kết nối dài và không buffer SSE; nếu có CDN, kiểm tra thêm cấu hình timeout/cache.
- Không cần webhook công khai cho Zalo cá nhân: server kết nối listener Zalo, trình duyệt nhận thay đổi qua SSE.

## Kiểm thử

- `npm test`: kiểm thử ghi dữ liệu, rollback, chống trùng, phân trang, listener, khôi phục lỗi và định tuyến gửi tin bằng SDK giả lập; không gửi cho khách thật.
- `npm run check`: kiểm tra cú pháp server và frontend.
- `npm run test:zalo-ui`: kiểm tra SSE thực tế giữa server thử nghiệm và trình duyệt ở 1440/390px, bản nháp và hội thoại được giữ nguyên. Script dùng Playwright/Edge của môi trường phát triển Windows hiện tại.
- Kiểm thử giao diện tổng thể `npm run test:ui` hiện vướng kỳ vọng tiêu đề PlanEditor cũ; không dùng kết quả đó để xác nhận toàn bộ hệ thống đã đạt.
