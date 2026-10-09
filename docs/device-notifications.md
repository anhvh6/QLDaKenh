# Thông báo thiết bị

Cài đặt → Thông báo thiết bị → Bật thông báo trên từng máy/điện thoại. Cấp quyền trong hộp thoại trình duyệt. Có thể bật/tắt âm thanh và từng nguồn: tin nhắn mới, nhắc hẹn, AI/nhắc việc gán nhân viên. Nút Gửi thông báo thử chỉ gửi tới thiết bị hiện tại.

Ứng dụng web đã cài (PWA) dùng cùng cơ chế Web Push. iPhone/iPad cần iOS/iPadOS 16.4 trở lên, thêm trang vào Màn hình chính, mở từ icon và cấp quyền. Âm thanh, badge và hiển thị màn hình khóa do hệ điều hành, trình duyệt, chế độ tập trung và quyền thiết bị quyết định. Không ép bật các quyền đó bằng mã web.

Người dùng đã cho phép gửi tên khách và nội dung tin nhắn qua dịch vụ push để xem trên màn hình khóa. Mỗi thiết bị có tùy chọn Hiện tên khách và nội dung tin nhắn; tắt tùy chọn này để chỉ hiện thông báo chung. Nhấn thông báo mở đúng hội thoại hoặc AI chuyển nhân viên. Payload không chứa token đăng nhập hay khóa truy cập học viên.

VAPID được tự tạo và lưu mã hóa trong SQLite `secrets`, khóa giải mã trong `data/encryption.key`. Giữ cả hai khi sao lưu/chuyển VPS; không tạo lại khóa khi triển khai. Không cần đặt khóa vào frontend hoặc Git. Subscription theo thiết bị được gắn với tài khoản hiện tại; đăng xuất hủy subscription của thiết bị. Máy chủ chỉ gửi khi tài khoản còn hoạt động và còn phiên đăng nhập hợp lệ.

Worker chạy 5 giây/lần, chỉ xử lý sự kiện mới, kiểm tra người nhận và quyền kênh. Không gửi lại lịch sử khi bật lần đầu. Tin trực tiếp dùng thời điểm máy chủ tiếp nhận (`pushReceivedAt`), thay vì thời gian gửi từ nền tảng, để không bỏ sót tin mới đến trễ. Mỗi subscription lưu cursor/dedup, retry sau lỗi tạm thời và loại bỏ subscription khi dịch vụ trả 404/410. Âm thanh hệ điều hành sử dụng tùy chọn `silent`; âm thanh trong trang chỉ phát sau thao tác người dùng khi chưa bật push, tránh phát trùng.

Nút Bật thông báo xuất hiện ngay trên thanh đầu trang khi thiết bị chưa bật. Nếu trình duyệt đã cấp quyền và còn subscription, đăng nhập tự đồng bộ đăng ký về máy chủ. Tắt thủ công trên thiết bị không bị tự bật lại. Cài đặt hiển thị trạng thái đăng ký, lần máy chủ gửi thành công và lỗi dịch vụ push nếu có.

Kiểm tra: `node --test tests/web-push.test.mjs`, `node scripts/test-device-notifications-ui.mjs`. Kiểm thử transport và PushManager được giả lập, không gửi tới dịch vụ push hoặc khách hàng thật. Việc nhận trên thiết bị thật cần người dùng cấp quyền và thử bằng nút Gửi thông báo thử.
