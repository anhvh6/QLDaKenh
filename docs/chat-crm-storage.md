# Lưu trữ chat và ngữ cảnh CRM

Hệ thống lưu khách hàng, hội thoại và tin nhắn trong SQLite `data/hub.sqlite` trên VPS, qua bảng `records`. Tin nhắn liên kết hội thoại bằng `conversationId`; hội thoại liên kết khách bằng `customerId`. Tin đồng bộ lịch sử cũng được lưu. Phác đồ dùng cơ sở dữ liệu quản lý phác đồ hiện có; hồ sơ khách hàng/học viên không cần có hội thoại.

`chat-crm-storage.sqlite.sql` bổ sung chỉ mục và các view đọc dữ liệu, được áp dụng tự động khi server khởi động. Đây là SQL cho **SQLite**, không chạy trên Supabase. Không cần tạo bảng chat trùng lặp. Hồ sơ CRM bổ sung được lưu dưới kind `crm_profiles`, ID là ID khách hàng, có phiên bản và nhật ký cập nhật.

Hồ sơ CRM bổ sung được lưu trong database và truy cập qua API có kiểm tra quyền. Popup Hồ sơ / Đơn chỉ hiển thị thông tin học viên, phác đồ, bảo mật, chuyên cần, đơn hàng và lịch sử mua hàng; không hiển thị các trường ngữ cảnh CRM. Bot tự động và Gợi ý AI vẫn sử dụng ngữ cảnh CRM đã lưu cùng tiến trình, phác đồ, đơn hàng và lịch sử trao đổi.

AI nhận 20 tin gần nhất trong hội thoại hiện tại và tối đa 12 tin cũ liên quan theo từ khóa từ các hội thoại cá nhân của cùng khách trên kênh được phép. Tìm kiếm hiện xét tối đa 600 tin mới nhất mỗi hội thoại; đây là giới hạn truy xuất ngữ cảnh, **không phải giới hạn lưu trữ**. Không đưa tin gửi lỗi/chưa rõ kết quả, ghi chú nội bộ, tin bị xóa, tin trước mốc xóa hội thoại hoặc hội thoại nhóm vào ngữ cảnh. Bot vẫn chỉ chọn câu trả lời mẫu đã được cấu hình.

Lịch sử chỉ đầy đủ trong phạm vi nền tảng đã cung cấp/đồng bộ về hệ thống; không thể khẳng định toàn bộ tin trước thời điểm kết nối đều đã được lấy về. Hệ thống không tự ghép khách theo tên: các hội thoại cần dùng chung customerId để chia sẻ ngữ cảnh.

API có kiểm tra quyền khách hàng và kênh:
- GET `/api/care/customers/:id/context`
- GET/PATCH `/api/care/customers/:id/crm` (PATCH cần version hiện tại)

Sao lưu bằng chức năng backup hiện có. Bản sao lưu bền vững cần giữ cơ sở dữ liệu, khóa mã hóa và thư mục uploads; không đặt database trong thư mục tạm hoặc filesystem tạm của Vercel.

Kiểm tra tổng số tin từng khách, bao gồm khách không có chat:
```sql
SELECT c.customer_id,c.name,COUNT(m.message_id) AS message_count
FROM crm_customers c
LEFT JOIN crm_conversations v ON v.customer_id=c.customer_id
LEFT JOIN crm_messages m ON m.conversation_id=v.conversation_id
GROUP BY c.customer_id,c.name;
```

## Supabase / PostgreSQL

`chat-crm-storage.sql` is the PostgreSQL 15+ version for the Supabase SQL Editor. It creates `public.chat_crm_records` and the three CRM views with JSONB expressions. It can be run again safely. The table uses the same kind/id/data/version structure as SQLite; it is an optional destination, not a change to the active storage backend. Running it alone does not copy or synchronize chat history from the VPS. The application continues to read/write SQLite and automatically applies only `chat-crm-storage.sqlite.sql`.

RLS is enabled and access for `anon`/`authenticated` is revoked on the table and views. Only trusted server access (service_role) is granted; any future sync/API must retain customer and channel permission checks. Do not put a service role key in browser code. Existing Supabase plan tables are not changed.

## One-time VPS export / Supabase import

Run `node scripts/export-chat-supabase.mjs` from the VPS application directory. It uses SQLite VACUUM INTO to make a consistent full backup, then exports ONLY customers, conversations, messages and crm_profiles from that backup into a CSV. It excludes users, sessions, secrets and channel credentials. Files are stored in a private timestamped directory under data/backups (directory mode 700, files mode 600).

The CSV is intended for the Supabase Table Editor import into an EMPTY chat_crm_records table. It is not an upsert tool: do not reimport the same CSV into a populated table. The primary key (kind,id) prevents duplicate records; a repeat import can fail. Keep the original SQLite database and backup. Validate counts, links and per-kind content fingerprints using docs/chat-crm-verify.sql. Fingerprints include all JSON data, IDs, versions and update timestamps; compare against the exported snapshot, not the live database which can continue changing.

This is a one-time snapshot copy. It does not switch the application's storage backend or automatically sync new chat messages. Attachments remain referenced by their existing URLs; binary files in uploads are not copied to Supabase Storage by this export.
