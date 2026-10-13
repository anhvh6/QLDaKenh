# Tiến trình, quyền nhân viên và ngoại lệ hội thoại

Trong **Cài đặt → Tiến trình & phân công**, mỗi tiến trình có màu và hai quyền cho từng nhân viên:

- **Nhận thông tin:** xem, đọc, trả lời và nhận thông báo tin mới.
- **Tắt thông báo:** tắt thông báo tin mới trên web/app, vẫn xem và trả lời; dấu tin chưa đọc trên thẻ hội thoại vẫn giữ.

Bỏ Nhận thông tin sẽ tự tích Tắt thông báo, khóa ô này và ẩn hội thoại khỏi nhân viên. Tích lại Nhận thông tin sẽ bỏ Tắt thông báo và cho phép chỉnh ô này. Nhân viên hiện tại từ cấu hình cũ và nhân viên mới mặc định đầy đủ quyền. Quyền kênh và vai trò vẫn được kiểm tra riêng.

Trong **Hội thoại → Phân công**, bảng hiển thị quyền hiệu lực cho từng người. Thay đổi tạo ngoại lệ cho người đó trên hội thoại cá nhân/nhóm; những người khác tiếp tục theo mặc định hệ thống. Chọn Trở về quyền mặc định để xóa ngoại lệ. Ngoại lệ luôn được ưu tiên dù mặc định hệ thống thay đổi. Nhóm sử dụng tiến trình của học viên đại diện.

Trước khi lưu quyền mặc định thay đổi ở tiến trình có ngoại lệ, bảng xác nhận liệt kê trạng thái, nhân viên, tên khách/nhóm và hai quyền. Chọn Lưu mặc định mới, giữ ngoại lệ để tiếp tục. Đóng bảng sẽ không lưu. Nếu ngoại lệ thay đổi trong lúc xác nhận, máy chủ từ chối bản xác nhận cũ và yêu cầu xem lại.

Tin lịch sử không tạo thông báo. Push tin mới kiểm tra quyền hiện tại lúc gửi. Thông báo trong app và dấu trên icon cũng bỏ các hội thoại đã tắt thông báo. Thông báo đẩy khi đóng web cần bật Thông báo thiết bị.

Quyền mặc định lưu trong `settings/student-care.stages.*.staffPermissions`; ngoại lệ lưu tại `conversations.carePermissions`. Cấu hình cũ giữ màu nhưng không tiếp tục áp dụng danh sách đọc/nhận cũ. Không cần thay đổi cấu trúc cơ sở dữ liệu.
