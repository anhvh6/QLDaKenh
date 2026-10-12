# Màu tiến trình và phân công nhận thông tin

Trong **Cài đặt → Tiến trình & phân công**, chọn màu cho mỗi tiến trình học viên, bật “Áp dụng quyền nhân viên” và chọn một hoặc nhiều người:

- **Nhận thông tin:** được đọc/trả lời và nhận thông báo tin nhắn mới.
- **Đọc thông tin:** được đọc/trả lời, không nhận thông báo tin nhắn mới.

Quyền truy cập kênh vẫn được kiểm tra. Nhân viên không hoạt động không được nhận thông báo. Chủ hệ thống và quản lý giữ quyền đọc quản lý; họ chỉ nhận thông báo nếu có tên trong danh sách nhận thông tin khi cấu hình đã áp dụng.

Các trạng thái tự tạo tại **Màu tên khách** cũng có hai danh sách quyền này. Nếu nhiều trạng thái cùng khớp, quyền đọc và danh sách nhận thông tin được hợp nhất, không gửi trùng cho cùng người. Màu tên vẫn theo thứ tự ưu tiên của quy tắc; màu tiến trình hiển thị riêng trên nhãn và thẻ hội thoại.

Nhóm khách hàng sử dụng tiến trình/trạng thái của học viên đại diện. Chọn học viên đại diện trong hồ sơ nhóm trước nếu cần.

Trong **Hội thoại → Phân công**, danh sách hiện tại bao gồm những người nhận thông tin theo trạng thái hoặc phân công riêng. Chọn “Phân công riêng”, bỏ người cũ và chọn người mới để chuyển thông báo từ các tin tiếp theo. Chọn “Theo cấu hình trạng thái học viên” để khôi phục mặc định. Phân công nhận tin không tự tước quyền đọc đang có của nhân viên.

Thông báo trong ứng dụng lưu theo đúng người nhận tại thời điểm tin đến. Thông báo đẩy cũng kiểm tra phân công hiện tại khi gửi, tránh gửi tới người cũ sau khi chuyển người. Tin lịch sử, tin gửi đi và ghi chú không tạo thông báo tin khách mới. Thông báo đẩy khi web đóng cần nhân viên bật **Thông báo thiết bị** trên từng thiết bị.

Các tiến trình chưa bật cấu hình nhân viên giữ hành vi quyền kênh hiện có. Việc lưu cấu hình có kiểm tra phiên bản để tránh ghi đè thay đổi của người khác. Cấu hình lưu trong bản ghi `settings/student-care`; quyền trạng thái tự tạo lưu trong `settings/chat-names`. Không cần thay đổi cấu trúc cơ sở dữ liệu.
