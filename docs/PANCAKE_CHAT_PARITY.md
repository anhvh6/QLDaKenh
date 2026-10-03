# Chat & chăm sóc — đối chiếu với Pancake

Khảo sát giao diện tài khoản người dùng tại https://pancake.vn/pzl_84966888609 ngày 03/10/2026; hoàn thiện và kiểm thử mã ngày 04/10/2026 (giờ Việt Nam).

Phạm vi: Hội thoại cá nhân và nhóm. Không khảo sát hay sửa chức năng bình luận/livestream. Chỉ xem giao diện, mở menu/biểu mẫu; không gửi tin, tạo nhóm, xóa thành viên hoặc sửa hồ sơ trên Pancake. Không sao chép danh bạ, nội dung tư vấn hay thông tin đơn hàng thật vào dữ liệu kiểm thử.

## 1. Danh sách và bộ lọc

| Quan sát trên Pancake | QL đa kênh | Phạm vi thực hiện |
|---|---|---|
| Bố cục danh sách — nội dung chat — thông tin/tạo đơn | Có | PC ba cột; mobile mở từng hội thoại và bảng hồ sơ |
| Tìm kiếm hội thoại | Có | Tên, điện thoại, email, tin cuối và nội dung toàn bộ tin đã lưu; không phân biệt dấu |
| Lọc chưa đọc | Có | Trạng thái đọc trong QL đa kênh |
| Lọc cá nhân, nhóm, người lạ | Có | Người lạ chỉ xác định sau đợt đồng bộ danh bạ đầy đủ; không đoán khi chưa có dữ liệu |
| Có/không có số điện thoại | Có | Theo hồ sơ khách hàng |
| Chưa trả lời, đã đọc chưa trả lời | Có | Theo waitingSince; ghi chú nội bộ không kết thúc thời gian chờ |
| Sắp theo thời gian, người chờ lâu nhất | Có | Mới nhất/cũ nhất/chờ lâu nhất; hội thoại ghim đứng trước |
| Lọc thẻ và không gắn thẻ | Có | Kết hợp một trong các thẻ hoặc tất cả thẻ |
| Lọc nhân viên/chưa phân công; A và B/A hoặc B | Có | Hỗ trợ nhiều người phụ trách; mỗi người phải có quyền trên kênh |
| Lọc khoảng ngày theo thời gian tạo/cập nhật | Có một phần | Ngày tạo hoặc tin cuối; mốc hôm nay/7/30/90 ngày; biên ngày theo UTC+7. Chưa có thanh chọn khoảng giờ trong ngày |
| Xem mọi hội thoại của cùng khách | Có | Theo customerId đã liên kết, không tự gộp người trùng tên/SĐT |
| Ghim/lưu trữ, thao tác nhiều hội thoại | Có | Nội bộ; tối đa 100 hội thoại mỗi đợt, cập nhật nguyên tử khi có xung đột |

## 2. Hộp chat cá nhân

| Quan sát trên Pancake | QL đa kênh | Chi tiết |
|---|---|---|
| Tin có ngày/giờ và trạng thái | Có | API đã nhận khác với đã đọc; không giả lập xác nhận đọc từ khách |
| Mẫu trả lời, phím tắt, chủ đề | Có một phần | Tìm tên/phím tắt/nội dung, chèn nháp, mẫu nhiều khối có xem trước; chưa có phân loại chủ đề mẫu |
| Trả lời trích dẫn từng tin | Có | Zalo dùng quote của SDK khi có dữ liệu gốc; dữ liệu cũ/kênh khác dùng văn bản trích dẫn rõ ràng |
| Chuyển tiếp | Có một phần | Chuyển văn bản thành nháp ở hội thoại đích; người dùng kiểm tra và gửi. Không tự chuyển tệp hoặc ghi chú nội bộ |
| Sao chép | Có | Clipboard trên HTTPS; hộp chọn văn bản trên HTTP |
| Ghim tin | Có | Ghim nội bộ QL đa kênh, không tuyên bố đã ghim trên Zalo |
| Nhắc hẹn từ tin/hội thoại | Có | Hạn, nội dung, người phụ trách, hoàn tất/hủy; badge và thông báo trong ứng dụng khi mở. Không gửi nhắc lên Zalo hoặc thông báo hệ điều hành |
| Danh bạ, mở hội thoại mới | Có một phần | Mở hội thoại của liên hệ đã đồng bộ; chưa tìm tài khoản Zalo mới bằng SĐT hoặc gửi lời mời kết bạn |
| Ảnh/video, clipboard ảnh | Có | Upload trực tiếp trong chat hoặc Ctrl+V ảnh, lưu nháp trước khi gửi; Zalo cá nhân có adapter gửi file và đọc kích thước ảnh. Kênh khác báo chưa hỗ trợ media |
| File/ảnh/video/liên kết theo hội thoại | Có | Phân loại, tìm về tin gốc, mở link an toàn; URL nền tảng có thể hết hạn; chưa tải kho media lịch sử đầy đủ từ điện thoại |
| Emoji/sticker | Một phần | Emoji Unicode; chưa gửi sticker Zalo |
| Bản nháp | Có | Riêng từng hội thoại, lưu trong sessionStorage của tab theo tài khoản; giữ qua realtime/chuyển hội thoại/tải lại, không đồng bộ nháp sang thiết bị khác |
| Ghi chú khách, thông tin, lịch sử đơn | Có | Ghi chú nội bộ, hồ sơ 360°, đơn nháp, hành trình và tạo phác đồ được giữ nguyên |
| Enter/Shift+Enter, chuyển hội thoại nhanh | Có | Enter để gửi là tùy chọn; Shift+Enter xuống dòng; Alt+↑/↓ đổi hội thoại; Alt+I mở hồ sơ |

## 3. Hộp chat nhóm

| Quan sát trên Pancake | QL đa kênh | Điều kiện |
|---|---|---|
| Hiện người gửi từng tin | Có | Dùng senderName/ID; không gán mọi tin nhóm cho một khách |
| Danh sách thành viên, tìm tên/ID, trưởng nhóm | Có | Đồng bộ getGroupInfo + getGroupMembersInfo; hiển thị số lượng và thời điểm đồng bộ |
| Tạo nhóm bằng tên và chọn bạn bè | Có | Chọn kênh Zalo API, 2–100 liên hệ đã đồng bộ, xác nhận tạo thật; quyền owner/manager trong QL đa kênh |
| Đổi tên, thêm/xóa thành viên | Có | Biểu mẫu riêng; xác nhận tác động lên Zalo, kiểm tra vai trò Zalo trước khi gọi SDK, thông báo kết quả từng phần |
| Rời nhóm/giải tán | Có | Checkbox và nhập chính xác tên nhóm; giải tán cần trưởng nhóm Zalo. Lưu trữ hội thoại nội bộ sau thành công, không xóa lịch sử |
| Nhắn riêng cho thành viên, kết bạn từ menu | Chưa có đầy đủ | Có thể tìm liên hệ đã đồng bộ trong Danh bạ; chưa gửi lời mời kết bạn từ đây |
| Tag @ thành viên | Chưa có | Chưa thêm mentions có cấu trúc; gõ @name chưa được coi là tag Zalo thật |

## 4. Chưa tuyên bố tương đương toàn bộ Pancake

Các mục quan sát thấy trong menu/Trợ giúp nhưng chưa triển khai: phản ứng trên tin, xóa/thu hồi trên Zalo, chọn nhiều tin để in, gửi danh thiếp, sticker, OCR ảnh, giọng nói và đồng bộ nhắc hẹn lên Zalo. Chưa khảo sát đầy đủ thiết lập nâng cao ngoài Hội thoại; không coi tên một phím tắt là bằng chứng luồng đó đang hoạt động trên tài khoản này.

## 5. Dữ liệu và quyền

- Tái sử dụng `records` SQLite hiện có: conversations, messages, customers, assets, tags, teams. Thêm loại `chat_reminders`; không reset CSDL và không đổi các khóa liên kết phác đồ.
- Hội thoại mở rộng: pinned, archived, assigneeIds, isFriend, group, groupNeedsSync, groupUnavailable.
- Tin mở rộng: pinned, quoteId, quoteSource, attachments, senderName/senderId.
- Các API chat xác thực session/CSRF theo server hiện tại, kiểm tra quyền inbox, phạm vi kênh và revision. Gửi/xóa nhóm không được thực hiện chỉ bằng thay đổi trường nội bộ.
- File upload qua chat được gắn connectionId; đọc file/gửi lại file kiểm tra quyền kênh. Media thư viện dùng chung cũ giữ chính sách hiện tại.
- Cấu trúc mở rộng này là lớp dữ liệu local hiện có; chưa tạo migration tương ứng lên Supabase production.

## 6. Xác minh và vận hành

- `npm run check`: gồm cú pháp các module chat mới.
- `npm test`: kiểm tra chống truy cập chéo kênh, xung đột revision, rollback thao tác hàng loạt, nhắc hẹn, trích dẫn, media, bộ lọc, adapter nhóm Zalo, kích thước ảnh.
- `npm run test:chat-ui`: PC 1440px/mobile 390px, bản nháp, mẫu, trích dẫn, upload media vào nháp, ghim, tìm tin, phân công, nhắc hẹn, bộ lọc kết hợp, thành viên nhóm và đánh dấu đọc hàng loạt.
- `npm run test:zalo-ui`: nhận thay đổi qua SSE và giữ bản nháp/hội thoại.
- Kiểm thử dùng dữ liệu giả lập, không gửi cho khách thật hoặc thay đổi nhóm Zalo thật. Cần kiểm tra thực tế trên tài khoản được phép sau triển khai.
- Cài dependency theo package-lock bằng `npm ci`, rồi khởi động lại tiến trình server. Không chạy đồng thời listener local và VPS của cùng tài khoản Zalo.
- Tình trạng VPS cần đối chiếu lần triển khai mới nhất; không suy ra đã triển khai chỉ từ việc mã nguồn đã lên GitHub.
