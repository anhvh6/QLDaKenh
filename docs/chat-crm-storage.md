# Lưu trữ chat và ngữ cảnh CRM

Hệ thống lưu khách hàng, hội thoại và tin nhắn trong SQLite `data/hub.sqlite` trên VPS, qua bảng `records`. Tin nhắn liên kết hội thoại bằng `conversationId`; hội thoại liên kết khách bằng `customerId`. Tin đồng bộ lịch sử cũng được lưu. Phác đồ dùng cơ sở dữ liệu quản lý phác đồ hiện có; hồ sơ khách hàng/học viên không cần có hội thoại.

`chat-crm-storage.sql` bổ sung chỉ mục và các view đọc dữ liệu, được áp dụng tự động khi server khởi động. Đây là SQL cho **SQLite**, không chạy trên Supabase. Không cần tạo bảng chat trùng lặp. Hồ sơ CRM bổ sung được lưu dưới kind `crm_profiles`, ID là ID khách hàng, có phiên bản và nhật ký cập nhật.

Trong Hồ sơ / Đơn, nhân viên có thể cập nhật mục tiêu, hiện trạng, cách trao đổi, hạn chế và ghi nhận chăm sóc. Bot tự động và Gợi ý AI đều nhận cùng cấu trúc ngữ cảnh: tiến trình, phác đồ, đơn hàng, thông tin CRM và lịch sử liên quan. Các thông tin nhân viên ghi nhận không phải là suy luận tự động về tính cách hoặc bệnh lý.

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
