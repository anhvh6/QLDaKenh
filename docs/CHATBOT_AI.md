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

## Bản sửa Gemini 05/10/2026

- Model Gemini dùng API ID do `models.list` trả về, lọc `supportedGenerationMethods=generateContent`; tải danh sách từ khóa mới hoặc khóa đã lưu, có phân trang.
- Chấp nhận `models/<id>` và loại prefix trước khi gọi API. Từ chối tên hiển thị có dấu cách như `Gemini 3.6` để tránh gửi URL sai.
- Gemini không dùng trường OpenAI Project/Organization; giao diện ẩn và backend bỏ qua các giá trị này.
- Lỗi provider giữ HTTP status phù hợp và thông tin lỗi đã che khóa; phân biệt quota, quyền, model, timeout và safety/empty response. Không hiển thị phần thinking.
- Quy trình sửa cấu hình: sửa kết nối → Gemini → nhập API key hoặc giữ khóa đã lưu → Tải danh sách model → chọn model → Lưu → Kiểm tra kết nối.

## Nhóm kết nối AI (06/10/2026)
Mỗi bot chọn 1–20 kết nối bằng checkbox; cấu hình cũ một kết nối vẫn dùng được. Các kết nối bật có khóa được luân phiên giữa các lượt gọi. Khi API lỗi, thử từng kết nối còn lại một lần; không gửi tin khách trong bước thử này. Model trả kết quả không hợp lệ vẫn chuyển nhân viên theo cơ chế kiểm tra mẫu hiện có. Không tự đổi model hoặc bật kết nối đã tắt.
Kết nối lỗi 429 nghỉ 60 giây, 401/403/404 nghỉ 5 phút, lỗi khác nghỉ 15 giây. Hết thời gian nghỉ cho phép thử lại; chưa có lượt thử thì không khẳng định phục hồi. Nút Kiểm tra kết nối cho phép kiểm tra thủ công. Thống kê số lượt gọi, số lỗi, tỷ lệ lỗi, lỗi quota tính từ lúc triển khai, gồm kiểm tra thủ công; không phải quota còn lại của Google. Cập nhật cấu hình không bị tăng version bởi thống kê; bỏ kết quả cũ nếu cấu hình bị sửa trong khi đang gọi.
Xóa một kết nối bỏ nó khỏi nhóm bot, giữ bot hoạt động nếu còn kết nối; không còn thì tắt bot, bỏ route và hủy công việc chưa gửi. Lịch sử giữ nguyên. Tất cả kết nối đều lỗi hoặc đang nghỉ: chuyển nhân viên. Runtime hiện lưu SQLite; migration 20261006_ai_connection_pool.sql là cấu trúc Supabase bổ sung, chưa được áp dụng/kiểm thử trực tiếp. Khi làm adapter Supabase, trước xóa phải cập nhật mc_chatbots.ai_connection_id sang kết nối còn lại hoặc null và tắt bot không còn kết nối.

Lỗi AI tạm thời 408/429/502/503/504: worker giữ job waiting, thử lại tối đa 3 lần sau 15/30/60 giây (kèm jitter và thời gian nghỉ kết nối nếu dài hơn), vẫn chuyển sang pool dự phòng trước. Hết số lần thử thì chuyển nhân viên. Lỗi 400/401/403/404 và kết quả sai mẫu không tự thử lại. Không tự thử lại bước gửi tin có kết quả không rõ. Gợi ý thủ công không có tác vụ gửi tự động; bấm lại khi kết nối phục hồi.

### Nhập/xuất câu trả lời mẫu bằng Excel

Chủ hệ thống dùng nút **Nhập Excel / Xuất Excel** trong Câu trả lời mẫu. Hộp nhập có nút tải mẫu .xlsx, chọn file và xem trước kết quả từng dòng. Chọn bộ chatbot để gắn các mẫu mới, hoặc chỉ thêm vào thư viện. Nhập chỉ thêm mới; tên trùng được bỏ qua; file có dòng lỗi phải sửa trước khi nhập. File tối đa 1 MB, 1000 dòng; nội dung giải nén tối đa 20 MB. Không hỗ trợ công thức hoặc file có mật khẩu.

Sheet `Cau tra loi` gồm tên, nội dung, hướng dẫn AI sử dụng, mã media cách nhau dấu ; và Bật Có/Không. Ba cột đầu bắt buộc; tối đa 10 media/mẫu, media phải tồn tại và dùng được cho mẫu. Excel giữ tham chiếu tới thư viện hiện có. Xuất được tất cả câu trả lời hoặc riêng một bộ chatbot. API owner-only `/api/chatbot/templates/excel/{sample,export,preview,import}`; dữ liệu dùng bảng/records templates và templateIds hiện có, không cần migration mới.

### Danh sách câu trả lời mẫu và xóa hàng loạt
Mỗi dòng chỉ hiển thị tên, một dòng nội dung rút gọn, số media và trạng thái. Bấm Sửa để xem đầy đủ. Chủ hệ thống chọn từng mẫu hoặc Chọn tất cả rồi Xóa đã chọn, xác nhận trước khi xóa. Mẫu bị xóa được gỡ khỏi các bộ chatbot; bộ hết mẫu tự tắt và hủy tác vụ chờ. Lịch sử tin đã gửi và media trong thư viện được giữ nguyên. API POST /api/chatbot/templates/bulk-delete kiểm tra phiên bản tất cả mẫu và thực hiện trong một giao dịch. Không cần migration SQL mới.

### Nhắc việc bằng # trong hội thoại
Bấm Nhắc việc dưới tin đến để tạo bản nháp # kèm trích dẫn, hoặc gõ # ở đầu ô trả lời. Chọn nhân viên từ danh sách gợi ý (lọc theo tên, chỉ người có quyền kênh), nhập hướng dẫn rồi Gửi. Đây là giao việc nội bộ, không gửi nội dung # ra nền tảng khách hàng. Yêu cầu source=mention xuất hiện trong AI chuyển nhân viên; tin nguồn đổi màu khi còn việc chờ. Mở hội thoại cuộn tới messageId. Đúng nhân viên được giao gửi tin thành công sẽ hoàn tất các việc nhắc của mình tại hội thoại; ghi chú nội bộ, tin AI, tin của người khác và lượt gửi thất bại không hoàn tất. Có thể bấm Đã xử lý. Hồ sơ resolved được giữ để đối soát, ẩn khỏi danh sách chờ; màu tin trở lại bình thường khi hết việc chờ. Giao việc thủ công không bị worker AI đổi nhân viên theo tiến trình. Dùng kho records hiện có, không cần SQL mới cho runtime hiện tại.
Kiểm thử: tests/staff-tasks.test.mjs, scripts/test-chat-mention-ui.mjs.
