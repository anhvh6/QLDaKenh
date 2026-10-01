# Hợp đồng tích hợp với taophacdo

**Cập nhật 2.1:** đã nhúng PlanEditor từ repository taophacdoT4 vào hệ thống local, mở từ đơn đã thanh toán đủ và lưu về hồ sơ/hành trình học viên. Xem [luồng hợp nhất và mã nguồn tái sử dụng](UNIFIED_WORKFLOW.md). Cầu nối Supabase bên dưới vẫn chỉ nhập dữ liệu; việc sửa phác đồ hiện lưu local.

## Nguồn và quyết định thiết kế

Đầu vào: `Đặc tả yêu cầu phần mềm chi tiết.docx` và `SUPABASE_DATABASE_DOCUMENTATION.md` trong workspace. Nội dung yêu cầu được trích vào `REQUIREMENTS_EXTRACTED.txt` để đối chiếu. Các hướng dẫn sao chép/chạy SQL trong tài liệu không được thực thi.

SRS đề xuất `customers(full_name,phone)`, `roles(id)`, `users(password_hash)` nhưng schema hiện hữu dùng các khóa/cột khác. Ưu tiên schema hiện hữu, không tạo lại bảng lõi theo SQL mẫu trong SRS.

| Miền | Khóa nguồn phải giữ | Ánh xạ / mở rộng |
|---|---|---|
| Khách hàng | `customers.id UUID`, `customer_id TEXT UNIQUE` | `name ← customer_name`, `phone ← sdt`, `address ← dia_chi`; FK mới dùng customer_id TEXT |
| Sản phẩm | `products.id UUID`, `id_sp TEXT` | `sku ← id_sp`, `price ← gia_ban`, `cost ← gia_nhap`; không suy diễn tồn từ san_pham |
| Khóa học | `courses.id TEXT` | `fee`, `duration`, `status` giữ nguyên; mã bán nội bộ liên kết courseId |
| Sản phẩm đã mua | `customers.san_pham JSONB` | Chỉ đọc các thuộc tính id_sp/ten_sp/so_luong/don_gia/gia_nhap/thanh_tien; không thay thế bằng đơn đang tạo |
| Thanh toán | `payment_orders.customer_id TEXT`, `order_payload JSONB` | Local chuẩn bị payload giao dịch riêng; chưa POST lên production |
| Phác đồ mẫu | `master_video_tasks.video_date`, `nhom` | Với `is_customized=false`, lọc video_date; nếu ma_vd có giá trị thì lọc nhom=ma_vd; sắp day,sort_order |
| Phác đồ riêng | `customer_tasks.customer_id TEXT` | Với `is_customized=true`, chỉ lấy khách tương ứng và is_deleted=false |
| Điểm danh | `attendance_logs.customer_id TEXT` | Đọc các ngày access_date, không tự tạo điểm danh khi nhân viên xem hồ sơ |
| Quyền | auth.users → admin_users; roles.name / permissions.code | Bổ sung permission social.*; không đổi role hiện tại hoặc policies lõi |
| Popup học viên | `ad_campaigns` | Giữ công dụng popup; chiến dịch nội dung social dùng miền riêng |
| Video/thiết bị | customer_devices, get-bunny-video-token | Không nhập token, không bỏ xác thực, không tự duyệt thiết bị, không làm lộ link ký |

## Cấu trúc mã hiện có

- `server/supabase.mjs`: projection cho phép, đăng nhập tài khoản Supabase hiện hữu, kiểm tra super_admin, preflight REST, xem trước mã hóa theo chủ tài khoản local, nhập theo lô. Mọi request dữ liệu dùng JWT người dùng và anon/publishable key, không dùng service_role.
- `server/taophacdo.mjs`: hành trình, ghi danh, lead, scope đội ngũ, SLA, phác đồ và mẫu nhiều khối.
- `server/domain.mjs`: đơn/giá/tồn/giao vận/thanh toán; snapshot nội dung từng kênh; worker xử lý độc lập.
- `server/store.mjs`: SQLite cục bộ, optimistic version, transaction, secrets mã hóa, journal nghiệp vụ.
- `supabase/preflight.sql`: truy vấn đọc để kiểm tra schema thật, FK, role và RLS.
- `supabase/migrations/202610010001_social_care.sql`: migration bổ sung social_* trên schema hiện hữu. Chưa được chạy. Các bảng mở rộng không thay thế bảng lõi.

## Trạng thái cầu nối

**Đã thực thi được:** nhập chỉ đọc từ Supabase/JSON, giữ khóa nguồn, kiểm tra trước khi nhập, bảo toàn bản ghi không nằm trong lô, giữ các thuộc tính local như tags/tồn khi nhập lại. Nếu ID nhập đè bản ghi local không có nguồn taophacdo, hủy cả lô. Không tự gộp theo SĐT.

**Chưa thực thi:** đồng bộ incremental hai chiều, chuyển backend ứng dụng từ SQLite sang Supabase, SSO trực tiếp dùng phiên đăng nhập taophacdo, và giao dịch ghi lên bảng social_* production. SQL mở rộng mới là nền tảng staging: mặc định chỉ cấp SELECT có RLS cho authenticated, không cấp ghi rộng cho trình duyệt. Worker/RPC có giao dịch và kiểm tra quyền cần hoàn thiện, kiểm thử trước khi mở ghi.

Không thể xác nhận RLS chỉ từ tài liệu. REST trả mảng rỗng có thể do policy lọc; UI không coi đó là bằng chứng bảng trống. Quyền của tài khoản trong hệ thống đang chạy phải được kiểm tra bằng tài khoản đại diện từng role.

## Checklist chuyển sang hệ thống hiện hữu

1. Lấy source/version taophacdo, cấu hình URL dự án và bản schema/policies hiện hành từ staging. Không gửi secrets vào chat hoặc đưa vào Git.
2. Sao lưu production bằng quy trình đang sử dụng. Chạy `preflight.sql` chỉ đọc trên staging; so sánh `customer_id`, `courses.id`, khóa/kiểu, defaults và policies. Đặc biệt tài liệu hiện chưa cung cấp đầy đủ RLS và schema payment_orders/video_view_logs.
3. Chạy migration một lần bằng migration runner trong staging. Review permissions social.*; chỉ super_admin được gán mặc định. Không chạy toàn bộ SQL tạo lại hệ thống từ file Word.
4. Nhúng frontend/module vào source taophacdo; thay local session bằng Supabase Auth và lấy role từ admin_users + role_permissions. Không dùng role do browser gửi lên. Không dùng quyền local owner để ghi production.
5. Viết transactional RPC cho xác nhận đơn, reserve/dispatch/return, ghi nhận/hoàn thanh toán, hành trình học viên. Khóa hàng tồn bằng SELECT FOR UPDATE; mỗi giao dịch có idempotency key; append payment_orders thay vì thay thế payload cũ. Không ghi đè raw_backup, san_pham hoặc token bằng patch tổng thể.
6. Worker server giữ provider secrets, xử lý publication bằng claim/lock; webhook public HTTPS xác thực chữ ký, chống lặp, retry backoff. Chỉ subscribe Realtime bảng cần thiết; Realtime cũng phải qua policies đã kiểm thử.
7. Hoàn thiện OAuth/provider app review, ViettelPost API theo hợp đồng tài khoản, mẫu media/voice và các connector còn thiếu trong ma trận.
8. Test role super_admin/coach/staff/collaborator bằng JWT thật: không nhìn thấy kênh khác; học viên không có quyền đọc inbox/lead/secret; nhân viên không vượt quyền thanh toán/export.
9. Chạy e2e trên staging từ post → webhook comment → reply → chat → lead → order → payment → enrollment → journey → shipment textbook. Đối soát một mẫu khách cũ và mới theo customer_id.
10. Chỉ triển khai sau khi các kiểm thử trên qua. Local app không có nút ghi production cho tới khi adapter này được hoàn thiện.

## API localhost bổ sung

| Method / endpoint | Chức năng |
|---|---|
| POST `/api/taophacdo/connect` | Đăng nhập Supabase, xác minh super_admin, lưu token mã hóa |
| POST `/api/taophacdo/preflight` | Kiểm tra các projection đọc |
| POST `/api/taophacdo/preview` | Đọc bảng và giữ snapshot tối đa 10 phút, tối đa 10.000 dòng |
| POST `/api/taophacdo/import` | Nhập snapshot đã xem trước vào SQLite |
| POST `/api/taophacdo/import-json` | `{table,rows,preview:true/false}` |
| POST `/api/care/customers/:id/journey` | Cập nhật giai đoạn có optimistic version và chốt thanh toán |
| GET `/api/care/customers/:id/plan` | Bản đọc phác đồ không bao gồm protected video link |
| POST `/api/care/courses` | Danh mục khóa học localhost và mã bán nội bộ |
| PATCH `/api/care/leads/:id` | Pipeline có điều kiện LOST/WON |
| POST `/api/care/teams` | Nhóm, thành viên, kênh được giao |
| POST `/api/care/config` | SLA phút |
| POST `/api/care/tags` | Nhãn, màu, hàng 1/2 |
| POST `/api/care/templates` | Chuỗi 1–10 khối văn bản và shortcut |
| POST `/api/care/conversations/:id/template` | Gửi tuần tự; runId chỉ tiếp tục run failed, không replay done/unknown |
| GET `/api/events` | SSE chỉ báo có thay đổi; client nạp lại state có scope |

Các mutation yêu cầu phiên local, CSRF, quyền nghiệp vụ. Các endpoint POST hỗ trợ Idempotency-Key. Nhật ký không chứa mật khẩu/token cấu hình. Không coi database snapshot là chứng cứ giao dịch trên nhà cung cấp.

Tham chiếu kỹ thuật: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
