# Đối chiếu phạm vi triển khai với SRS

Trạng thái ngày 01/10/2026. “Có localhost” nghĩa là chức năng có API, lưu dữ liệu và giao diện sử dụng; không có nghĩa đã nối tài khoản thật hoặc hoàn tất mọi tiêu chí của module SRS. Hai tài liệu đầu vào không bị chỉnh sửa.

| Module | Có localhost / đã bổ sung | Còn thiếu trước nghiệm thu toàn bộ SRS |
|---|---|---|
| M01 Kênh | Danh mục đa kênh, token mã hóa, test connection, soft disconnect, trạng thái/mode rõ ràng, phạm vi theo nhóm | OAuth từng provider, refresh token tự động, app review, health polling đầy đủ |
| M02 Nội dung | Draft, media upload, caption/biến thể, lên lịch GMT+7 ≥10 phút, job độc lập từng đích, retry có kiểm soát, frozen revision | Sửa bài live, remote delete, lịch lặp, duyệt nhiều cấp; connector TikTok/YouTube/Reddit API |
| M03 Inbox | Text chat, notes, realtime SSE, hai hàng quick tags, thư viện mẫu/shortcut và chuỗi văn bản, in-chat cart/order, timeline đơn | Media/voice trong chat, chuỗi media, typing/read receipt, Supabase Realtime, full bộ lọc nâng cao, mention/notify theo user |
| M04 Comment | Màn hình riêng, Facebook feed webhook ký, chống lặp, reply công khai, nguồn post/comment→lead, nhận sửa/xóa từ webhook | Private Reply mở Messenger thực tế, ẩn/xóa từ UI, auto-hide có chính sách |
| M05 CRM | Hồ sơ, nhập/gộp local có chốt dữ liệu nguồn, tags, đơn/hội thoại, giữ customer_id, social identity từ comment | UI xác minh/gộp identity, đa địa chỉ có chuẩn hóa, hợp nhất đa nền tảng có phê duyệt |
| M06 Lead | Trích SĐT VN, nguồn, pipeline, lý do LOST, điều kiện WON, gợi ý trùng, phân công round-robin theo kênh | Drag/drop Kanban, rule phân lead linh hoạt, conversion workflow hoàn chỉnh |
| Học viên/phác đồ | 6 giai đoạn, thanh toán được xác minh, phụ trách, ngày học, nhắc ≤7 ngày, lịch sử; đọc hybrid plan + attendance; ghi danh từ đơn khóa học | Sửa/gia hạn phác đồ trên hệ thống gốc, tạo protected link qua SSO, tái ghi danh liên thông production |
| M07 Đơn hàng | Draft/confirm, giá server, discount gate, reserve/dispatch, dịch vụ/khóa học, thanh toán/refund/COD độc lập, payment payload mapping | Giao dịch/RPC Supabase, nhiều kho, combo/biến thể đầy đủ, thuế/hóa đơn tài chính |
| M08 SLA/notification | Timer, note không kết thúc SLA, cảnh báo quá hạn, SSE, nút cập nhật bảo vệ bản soạn | Escalation tái phân công theo cấp, push/email/SMS, giờ làm việc/nghỉ lễ |
| M09 Báo cáo | Thống kê local về nội dung/đơn/tiền; lưu trace nguồn ở đơn; export JSON | Insight từ nền tảng, report attribution/FRT chuyên sâu, Excel dashboard/filter đầy đủ |
| M10/M12 Quyền/team | Local roles, quản lý user, nhóm/kênh, scope reads + writes; migration tham chiếu RBAC có sẵn | SSO taophacdo, ma trận quyền tùy biến local, kiểm thử RLS live, khóa user kèm tự tái phân công |
| M11 Adapter/webhook | Connector interface, Meta signature + dedupe, worker local, ambiguous-result state, idempotency, audit | Inbox Zalo/IG webhooks, durable retry/backoff DLQ đầy đủ, worker distributed |
| M13 Sản phẩm/giao vận | Vật lý/dịch vụ/khóa học, SKU, tồn, course import, GHN adapter, ViettelPost tracking thủ công và đối soát | ViettelPost API thật/nhãn hãng/webhook, combo, nhiều kho, custom columns |
| Tích hợp CSDL | Read-only Supabase/JSON bridge, projection bảo vệ dữ liệu, canonical mapping, preflight/migration staging | Không phải backend Supabase hoàn chỉnh; chưa sync 2 chiều, chưa apply SQL, chưa kiểm thử production |

## Kiểm thử đã thực hiện

- `npm run check`: cú pháp tất cả module server/frontend chính.
- `npm test`: 35 tests, gồm 3 nhóm tổng; 32 tình huống con. Có test restart/persistence, idempotency, tồn, COD, refund, CSRF, role/team scope, canonical import, phác đồ master/custom, lead, chữ ký và dedupe comment, chốt hành trình, chuỗi mẫu; thêm kiểm tra bàn giao sau thanh toán, lưu phác đồ, xung đột phiên bản, bảo vệ dữ liệu riêng và khóa sửa khi hoàn tiền.
- `npm run test:ui`: Edge headless, PC 1440×1000, mobile 390×844; duyệt các màn hình chính, tạo khóa học, tạo đơn trong chat, mở panel trên mobile, mở và lưu PlanEditor gốc từ đơn thanh toán đủ trên cả PC và mobile; không lỗi JavaScript hoặc tràn toàn trang. Ảnh và JSON trong `test-results`.

Bản 2.1 bổ sung tạo/sửa phác đồ local bằng PlanEditor thực từ taophacdoT4, cập nhật hồ sơ/hành trình và xuất gói bàn giao. Sửa dữ liệu trên hệ thống gốc, protected link và SSO production vẫn thuộc giai đoạn tích hợp CSDL tiếp theo.
- Không chạy thao tác xuất bản, gửi tin, tạo vận đơn thật; không thay đổi CSDL taophacdo đang vận hành.

Các mục “còn thiếu” là công việc thực sự chưa triển khai hoặc chưa kiểm chứng; không được coi là đã hoàn thành chỉ nhờ có tài liệu/migration. Bản này sẵn dùng cho các luồng localhost đã nêu, chưa thể gọi là nghiệm thu đầy đủ toàn bộ SRS/production.
