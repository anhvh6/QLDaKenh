# Tên khách, thao tác nhanh và màu trạng thái

- Trong Chat & chăm sóc, chạm tên cá nhân/nhóm để sao chép; thông báo cạnh tên tự ẩn sau 1,2 giây.
- Giữ tên khoảng 0,65 giây để mở đổi tên. Di chuyển ngón tay/chuột hoặc hủy chạm sẽ hủy nhấn giữ. Có mục Đổi tên hiển thị trong menu Hội thoại để dùng bàn phím.
- Tên cá nhân được lưu vào hồ sơ khách và điền sẵn trong phác đồ. Đồng bộ danh bạ Zalo giữ lại tên đã tự đặt. Đổi tên không sửa tên tài khoản Zalo của người khác.
- Tên nhóm mặc định đổi trong QL đa kênh. Với Zalo API, chủ/quản lý có thể chọn Đổi cả tên nhóm trên Zalo; máy chủ kiểm tra quyền quản trị Zalo trước khi gọi SDK.
- Bốn icon cạnh tên cá nhân: kết bạn/hủy kết bạn, tạo nhóm có chọn sẵn khách, hồ sơ, tạo phác đồ. Chức năng Zalo yêu cầu kênh API tương ứng; không mô phỏng thành công trên kênh demo.
- Gửi lời mời vẫn là đang chờ, chưa coi là bạn bè. Icon hỗ trợ đọc lại trạng thái khi chưa biết/chờ chấp nhận. Đồng bộ danh bạ xác nhận bạn bè cũng xóa trạng thái chờ.
- Cài đặt → Màu tên khách: chủ hệ thống thêm/sửa/tắt quy tắc, đổi màu, thứ tự ưu tiên và ngưỡng sắp hết hạn 1–90 ngày. Quy tắc khớp đầu tiên quyết định màu.
- Điều kiện: quan hệ Zalo, cọc chưa thu đủ, có/chưa có phác đồ, hiệu lực/thời hạn, nhãn hội thoại hoặc gán thủ công. Trạng thái tự thêm được gán tại Hội thoại → Trạng thái & màu tên. Thiếu dữ liệu không tự suy ra đã kết bạn hoặc còn hiệu lực.
- API dùng kiểm tra quyền kênh, phiên bản hồ sơ/hội thoại và nhật ký. Cấu hình lưu trong settings/chat-names, trạng thái thủ công ở customers.chatStatusIds. Không cần sửa schema SQLite hiện có.

## Phác đồ từ chat

Trình tạo phác đồ nhận dữ liệu khách qua `/plan-editor/` và API bridge hiện có. Trang quản lý phác đồ tổng thể vẫn ở `/plan-ui/`. `npm run build:plan` chỉ build adapter sang `public/plan-editor`. Khi quay lại, mở đúng hội thoại và giữ bản nháp. Vẫn kiểm tra thu đủ tiền trước khi lưu; bản bridge lưu vào workspace, chưa đồng bộ Supabase production.

## Xác minh

- 62 kiểm thử backend đã đạt.
- `npm run test:chat-names-ui`: sao chép/tự ẩn thông báo; nhấn giữ không sao chép; đổi tên cá nhân/nhóm; hồ sơ; chọn sẵn thành viên nhóm; xác nhận kết bạn giả lập; cấu hình và màu thủ công; điền tên học viên; quay lại đúng chat; PC 1440px/mobile 390px và 360px.
- `npm run test:chat-ui` và `npm run test:zalo-ui`: các chức năng chat và bản nháp/realtime.
- Không gửi lời mời, hủy bạn hay đổi nhóm khách thật khi kiểm thử. Adapter Zalo dùng [zca-js](https://github.com/RFS-ADRENO/zca-js) hiện có trong dự án.
