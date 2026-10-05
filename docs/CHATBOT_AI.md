# Chatbot AI – bản localhost và migration Supabase

## Đã triển khai

- `/api/chatbot/connections`: OpenAI Responses / Gemini generateContent, API key mã hóa qua kho secret hiện có. Khóa không xuất ra state.
- `/api/chatbot/bots`: chọn các tiến trình bằng OR, chọn kênh, danh sách câu trả lời và thời gian chờ.
- Bot trùng tiến trình/kênh cần lựa chọn route cụ thể. Không có điểm ưu tiên số.
- Câu trả lời dùng `templates.text`, `usageInstructions`, `assetIds`, `enabled`; không có câu hỏi mẫu.
- AI chọn ID mẫu. Backend gửi văn bản mẫu, thay `{{name}}`, cùng các media gắn sẵn. Không để mô hình tự sinh thông tin nghiệp vụ hoặc media URL.
- Nhân viên phụ trách theo tiến trình ở `settings/progress-staff`. Chưa phân công hoặc không có quyền kênh thì chuyển vào danh sách chưa có người phụ trách cho owner/manager.
- Icon chat chỉ bật/tắt; nút thông tin xem bot, lý do, tác vụ và tiếp quản. Khách không đủ điều kiện không thể bật. Yêu cầu đang mở phải hoàn tất trước khi bật lại.
- Worker 2 giây lưu receipts, jobs, runs và handoffs trong SQLite. Gom tin theo thời gian chờ; không xử lý lịch sử tải lại; hủy nếu nhân viên trả lời, tiến trình/route đổi hoặc bot tắt.
- Khởi động lại khi đang gọi AI có thể xử lý lại tác vụ chưa gửi. Khi đang gửi, đưa vào unknown và chuyển nhân viên đối soát, không tự gửi lại.
- Không thay đổi thanh toán, tiến trình hoặc quyền học. Không gửi tin thật trong kiểm thử.

## Sử dụng

1. Mở `/#chatbot` bằng tài khoản owner.
2. Thêm kết nối, API key và tên model; kiểm tra kết nối (có gọi API thật).
3. Thêm mẫu trả lời, hướng dẫn sử dụng và media tùy chọn.
4. Chọn nhân viên phụ trách từng tiến trình.
5. Thêm bộ chatbot, chọn tiến trình OR và kênh, giải quyết các route trùng nhau rồi bật.
6. Xem các yêu cầu tại `/#handoffs`; mở chat, nhận và hoàn tất xử lý.

OpenAI hiện có sẽ được nhập thành kết nối nếu cấu hình cũ có đủ token/model. Không tự tạo hoặc bật bot.

## Giới hạn triển khai hiện tại

- Runtime vẫn dùng SQLite localhost, chưa chuyển nguồn lưu sang Supabase.
- Chỉ hội thoại cá nhân. Chat nhóm bị chặn tự động vì chưa có mô hình tiến trình cho từng người gửi để tránh lộ dữ liệu.
- Kênh thật phải được connector hỗ trợ và connected; media hiện phụ thuộc khả năng adapter. Lỗi/không hỗ trợ chuyển nhân viên.
- Danh sách bàn giao cập nhật qua SSE đang có; không tự gửi thông báo ra email/Zalo của nhân viên.
- Worker localhost chỉ chạy một instance. SQL có cơ chế claim lease cho backend Supabase nhiều worker về sau; chưa có adapter runtime PostgreSQL trong bản này.
- Nhật ký không chứa API key. Các bản ghi AI lưu ngữ cảnh câu hỏi; cần chính sách lưu giữ/backup theo vận hành của đơn vị.

## Supabase

Migration: `supabase/migrations/20261005_chatbot_ai.sql`.

Đây là migration mở rộng, chưa chạy trên project thật. Prerequisite: schema `admin_users`, `customers`, `permissions`, `role_permissions` khớp tài liệu hiện có. Kiểm tra schema thực tế và chạy trên bản sao trước.

- Tạo bảng `mc_*` cho chat, contact bridge, media, mẫu, bot, route, hàng đợi, outbox, bàn giao và usage.
- Giữ nguyên các cột `customers.status`, `trang_thai`, `trang_thai_gan`; contact mới có thể chưa liên kết học viên.
- RLS đọc theo nhân viên/kênh. Client không có quyền ghi trực tiếp; backend kiểm tra JWT, quyền và revision trước khi ghi bằng service role.
- API key dùng `secret_ref` trỏ tới secret manager của backend, không lưu plaintext trong bảng.
- Storage `mc-media` private. Backend upload/kiểm tra MIME và đăng ký metadata; chỉ dùng signed URL sau kiểm tra quyền.
- Thêm `manage_chatbots`, `toggle_chatbots`, `view_chatbot_logs`; super_admin được cấu hình. Các role khác cần gán permission rõ ràng.
- Worker RPC `mc_claim_chatbot_jobs` chỉ cho service_role. Trạng thái dispatching/unknown cần đối soát; không retry gửi tự động.
- Trước chuyển nguồn ghi: map local ID với UUID, map users với admin_users, upload media, chuyển lịch sử và chọn một nguồn ghi duy nhất.

SQL đã rà soát cấu trúc, chưa được thực thi trên PostgreSQL/Supabase trong phiên này. Vì vậy chưa xác nhận tương thích project thật hoặc RLS bằng truy vấn live.

## Kiểm thử

`npm test`, `npm run check`, `npm run test:chatbot-ui`, `npm run test:chat-names-ui`.

Backend kiểm tra OR, xung đột, quyền, giữ khóa bí mật, chọn mẫu, chống trùng/history, chuyển nhân viên, recovery unknown, output ngoài bộ mẫu và nhân viên trả lời khi AI đang tạo phản hồi. UI kiểm tra cấu hình, mẫu, checkbox OR, icon và PC/mobile.
