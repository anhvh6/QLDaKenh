# TÀI LIỆU CHI TIẾT CƠ SỞ DỮ LIỆU SUPABASE (POSTGRESQL)
## Hệ Thống Quản Lý Phác Đồ Trẻ Hóa Khuôn Mặt (Mega Phương Facial Yoga System)

Tài liệu này mô tả chi tiết toàn bộ cấu trúc CSDL trên Supabase (PostgreSQL), ý nghĩa nghiệp vụ của từng bảng, trường thông tin, các cột JSONB nâng cao, và hướng dẫn tích hợp cho các hệ thống mở rộng/xây mới dựa trên cơ sở dữ liệu hiện tại.

---

## 1. TỔNG QUAN KIẾN TRÚC CSDL

Cơ sở dữ liệu được thiết kế trên **Supabase PostgreSQL**, tuân thủ các nguyên tắc:
- **Chuẩn hóa đặt tên:** Tên bảng và tên cột dùng kiểu chữ thường (`snake_case`).
- **Khóa chính:** Hầu hết sử dụng `uuid` (sinh tự động bằng `gen_random_uuid()`) hoặc chuỗi mã định danh duy nhất (`customer_id`, `id_sp`, `name`, `code`).
- **Bảo mật hàng (Row Level Security - RLS):** Đã bật RLS trên tất cả các bảng cốt lõi để bảo vệ dữ liệu giữa Admin và Học viên.
- **Cơ chế Phác đồ kép (Hybrid Master & Custom Plan):**
  - **Học viên chưa cá nhân hóa (`is_customized = false`):** Lịch tập được tra cứu động từ bảng phác đồ mẫu `master_video_tasks` theo `video_date` và nhóm bài tập (`ma_vd`).
  - **Học viên đã cá nhân hóa (`is_customized = true`):** Lịch tập được đọc trực tiếp từ bảng `customer_tasks` dành riêng cho học viên đó.

---

## 2. DANH SÁCH & CHI TIẾT CÁC BẢNG DỮ LIỆU (15 BẢNG)

### 2.1. Bảng `customers` (Quản lý Học viên)
Bảng trung tâm lưu trữ toàn bộ thông tin hồ sơ, quyền hạn, thời hạn gói học và cấu hình cá nhân hóa của học viên.

| Tên Trường (Column) | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | Định danh hệ thống duy nhất cho bản ghi học viên. |
| `customer_id` | `text` | **UNIQUE, NOT NULL** | Mã học viên công khai (VD: `C17798720771439P4I2`). Dùng làm FK liên kết các bảng khác. |
| `customer_name` | `text` | | Họ và tên học viên. |
| `sdt` | `text` | | Số điện thoại liên hệ của học viên. |
| `email` | `text` | | Email đăng ký của học viên (được xác thực qua Google OAuth). |
| `dia_chi` | `text` | | Địa chỉ nhận quà / địa chỉ học viên. |
| `san_pham` | `jsonb` | Default `'[]'` | Danh sách sản phẩm/gói học học viên đã mua (xem cấu trúc JSONB mục 3.1). |
| `gia_tien` | `numeric` | Default `0` | Tổng giá trị đơn hàng / số tiền thực tế học viên thanh toán. |
| `trang_thai_gan` | `text` | | Trạng thái gán phác đồ (VD: "Đã gán", "Chưa gán"). |
| `trang_thai` | `integer` | | Mã trạng thái hoạt động (1: Hoạt động, 0: Tạm khóa). |
| `ma_vd` | `text` | | Mã nhóm bài tập áp dụng (VD: `T1`, `T2`, `T3`, `T4`, `T5`...). |
| `note` | `text` | | Phân tích tình trạng & mong muốn tập luyện riêng của học viên. |
| `chewing_status` | `text` | | Hướng dẫn ăn nhai cân bằng cá nhân hóa cho học viên. |
| `start_date` | `date` | | Ngày bắt đầu kích hoạt phác đồ (mốc Ngày 1). |
| `end_date` | `date` | | Ngày hết hạn xem phác đồ (sau số ngày `duration_days`). |
| `duration_days` | `integer` | | Thời lượng khóa học tính theo ngày (mặc định 60 ngày). |
| `video_date` | `date` | | Ngày liên kết phác đồ mẫu `master_video_tasks` khi `is_customized = false`. |
| `status` | `text` | Default `'ACTIVE'` | Trạng thái học viên: `ACTIVE` (Hoạt động), `INACTIVE` (Ngừng), `DELETED` (Đã xóa). |
| `sidebar_blocks_json` | `jsonb` | Default `'[]'` | Danh sách các khối thông tin hiển thị trên sidebar phác đồ học viên (xem mục 3.2). |
| `link` | `text` | | Đường dẫn trang phác đồ riêng của học viên. |
| `token` | `text` | **NOT NULL** | Token ngẫu nhiên mã hóa URL truy cập học viên (VD: `scmu202epbe0zskin9a1ed`). |
| `app_title` | `text` | | Tiêu đề phác đồ hiển thị tùy chỉnh (VD: "PHÁC ĐỒ: NGUYỄN THU THẢO"). |
| `app_slogan` | `text` | | Lời chúc / Slogan hiển thị ở đầu trang phác đồ học viên. |
| `is_customized` | `boolean` | Default `false` | `true`: Dùng bài tập riêng trong `customer_tasks`. `false`: Dùng phác đồ mẫu từ `master_video_tasks`. |
| `require_google_auth` | `boolean` | Default `true` | `true`: Bắt buộc đăng nhập Google Email trùng với `email` học viên mới xem được video. |
| `require_device_limit` | `boolean` | Default `true` | `true`: Bắt buộc giới hạn thiết bị đăng nhập qua bảng `customer_devices`. |
| `pending_email` | `text` | | Email mới đang chờ Admin duyệt khi học viên yêu cầu đổi email. |
| `raw_backup` | `jsonb` | Default `'{}'` | Lưu thông tin phụ: Lịch sử điểm danh `video_open_dates`, các ngày đã hoàn thành `completed_days`, tiền đặt cọc `deposit_amount`, cờ tư vấn... (xem mục 3.3). |
| `created_at` | `timestamptz` | Default `now()` | Thời gian khởi tạo học viên. |
| `updated_at` | `timestamptz` | Default `now()` | Thời gian tự động cập nhật bản ghi gần nhất (có trigger `update_customers_updated_at`). |

---

### 2.2. Bảng `master_video_tasks` (Phác đồ Mẫu Chuẩn Theo Ngày)
Lưu giữ kho bài tập mẫu chuẩn hóa theo ngày phát hành (`video_date`) và nhóm (`nhom`). Học viên chưa bị sửa phác đồ riêng sẽ lấy bài tập từ bảng này.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID định danh bài tập mẫu. |
| `video_date` | `date` | **NOT NULL** | Khóa ngày đại diện cho phiên bản/bộ phác đồ mẫu (VD: `2026-05-20`). |
| `day` | `integer` | **NOT NULL** | Ngày thứ mấy trong lộ trình 60 ngày (VD: `1`, `2`, ..., `60`). |
| `type` | `text` | | Phân loại bài tập: `"Bài bắt buộc"` hoặc `"Bài bổ trợ"`. |
| `title` | `text` | | Tên động tác / bài tập (VD: "NẮN CHỈNH MẶT LỆCH"). |
| `detail` | `text` | | Mô tả chi tiết kỹ thuật thực hiện động tác. |
| `link` | `text` | | Link xem video (BunnyCDN ID, URL iframe, YouTube Embed, Google Drive). |
| `nhom` | `text` | | Mã nhóm phác đồ (VD: `T1`, `T2`, `T3`, `T4`, `T5`). |
| `sort_order` | `integer` | Default `0` | Thứ tự ưu tiên hiển thị bài tập trong cùng một ngày. |
| `raw_backup` | `jsonb` | Default `'{}'` | Dữ liệu phụ mở rộng. |
| `created_at` | `timestamptz` | Default `now()` | Thời gian tạo bài tập mẫu. |

---

### 2.3. Bảng `customer_tasks` (Lịch tập Cá nhân hóa Học viên)
Chứa các bài tập đã được Admin điều chỉnh, thêm, bớt hoặc sửa đổi riêng cho một học viên cụ thể (`is_customized = true`).

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID định danh bài tập riêng của học viên. |
| `customer_id` | `text` | **FK -> `customers(customer_id)` ON DELETE CASCADE** | Mã học viên sở hữu bài tập này. |
| `day` | `integer` | **NOT NULL** | Ngày thứ mấy trong lộ trình cá nhân hóa của học viên. |
| `type` | `text` | | Loại bài tập: `"Bài bắt buộc"` hoặc `"Bài bổ trợ"`. |
| `title` | `text` | | Tên bài tập cá nhân hóa. |
| `detail` | `text` | | Hướng dẫn động tác riêng cho học viên. |
| `link` | `text` | | Đường dẫn video bài tập. |
| `nhom` | `text` | | Nhóm áp dụng. |
| `is_deleted` | `boolean` | Default `false` | Cờ xóa mềm: `true` nếu Admin xóa bài tập này khỏi ngày tập học viên. |
| `sort_order` | `integer` | Default `0` | Thứ tự sắp xếp trong ngày. |
| `raw_backup` | `jsonb` | Default `'{}'` | Dữ liệu lưu trữ bổ sung. |
| `created_at` | `timestamptz` | Default `now()` | Ngày tạo bản ghi bài tập. |

---

### 2.4. Bảng `customer_devices` (Quản lý Thiết bị Đăng nhập Học viên)
Bảo vệ bản quyền phác đồ bằng cách kiểm soát các trình duyệt/thiết bị được phép mở link học viên.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID định danh bản ghi thiết bị. |
| `customer_id` | `text` | **FK -> `customers(customer_id)` ON DELETE CASCADE** | Mã học viên sở hữu thiết bị. |
| `device_id` | `text` | **NOT NULL** | Mã vân tay trình duyệt/thiết bị (sinh bởi FingerprintJS). |
| `device_name` | `text` | | Tên thiết bị / hệ điều hành / trình duyệt (VD: "Chrome 120 on Windows"). |
| `is_approved` | `boolean` | Default `false` | `true`: Thiết bị đã được duyệt truy cập. `false`: Đang chờ duyệt/Bị khóa. |
| `approved_at` | `timestamptz` | | Thời điểm Admin hoặc hệ thống duyệt thiết bị. |
| `last_used_at` | `timestamptz` | Default `now()` | Thời điểm gần nhất thiết bị này truy cập phác đồ. |
| `created_at` | `timestamptz` | Default `now()` | Ngày ghi nhận thiết bị lần đầu. |
| *Constraint* | | **UNIQUE(customer_id, device_id)** | Mỗi học viên không được tạo trùng 1 thiết bị 2 lần. |

---

### 2.5. Bảng `products` (Danh mục Sản phẩm & Gói tập)
Quản lý các sản phẩm, dụng cụ tập, mỹ phẩm hoặc gói dịch vụ bán kèm.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID hệ thống. |
| `id_sp` | `text` | **UNIQUE, NOT NULL** | Mã sản phẩm (VD: `SP001`, `YOGA_FACE_V1`). |
| `ten_sp` | `text` | | Tên sản phẩm / Gói học. |
| `gia_nhap` | `numeric` | Default `0` | Giá nhập / Giá vốn sản phẩm. |
| `gia_ban` | `numeric` | Default `0` | Giá bán niêm yết cho khách hàng. |
| `trang_thai` | `integer` | Default `1` | `1`: Đang kinh doanh, `0`: Ngừng bán. |
| `raw_backup` | `jsonb` | Default `'{}'` | Thông tin mở rộng. |
| `created_at` | `timestamptz` | Default `now()` | Ngày tạo. |
| `updated_at` | `timestamptz` | Default `now()` | Ngày cập nhật gần nhất. |

---

### 2.6. Bảng `courses` (Danh mục Khóa Học)
Quản lý thông tin chung về các chương trình đào tạo.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `text` | **PK** | Mã khóa học (VD: `KH_TRE_HOA_60D`). |
| `name` | `text` | | Tên khóa học. |
| `description` | `text` | | Mô tả chi tiết nội dung khóa học. |
| `fee` | `numeric` | Default `0` | Mức học phí chuẩn. |
| `duration` | `text` | | Thời lượng học (VD: "60 ngày"). |
| `status` | `integer` | Default `1` | Trạng thái (1: Đang mở, 0: Đóng). |
| `raw_backup` | `jsonb` | Default `'{}'` | Dữ liệu mở rộng. |
| `created_at` | `timestamptz` | Default `now()` | Ngày tạo khóa học. |

---

### 2.7. Bảng `ad_campaigns` (Chiến dịch Quảng cáo & Thông báo)
Quản lý các banner / video pop-up quảng cáo hoặc thông báo tự động xuất hiện khi học viên mở phác đồ.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID định danh chiến dịch. |
| `name` | `text` | **NOT NULL** | Tên chương trình/chiến dịch thông báo. |
| `media` | `jsonb` | Default `'[]'` | Mảng danh sách đường dẫn video/ảnh truyền thông (`string[]`). |
| `cta_name` | `text` | | Nút kêu gọi hành động (VD: "ĐĂNG KÝ GIA HẠN"). |
| `cta_link` | `text` | | Đường dẫn chuyển hướng khi bấm nút CTA. |
| `description` | `text` | | Nội dung văn bản chi tiết của thông báo. |
| `display_now` | `boolean` | Default `false` | `true`: Hiển thị ngay lập tức không phụ thuộc số buổi học. |
| `display_days` | `integer` | | Số ngày duy trì hiển thị kể từ `start_time`. |
| `from_session` | `integer` | | Chỉ hiển thị từ buổi học số mấy (VD: từ buổi 10). |
| `to_session` | `integer` | | Hiển thị đến buổi học số mấy (VD: đến buổi 15). |
| `start_time` | `timestamptz` | Default `now()` | Thời điểm bắt đầu chiến dịch. |
| `is_active` | `boolean` | Default `true` | `true`: Chiến dịch đang chạy, `false`: Tắt chiến dịch. |
| `created_at` | `timestamptz` | Default `now()` | Ngày tạo. |
| `updated_at` | `timestamptz` | Default `now()` | Ngày cập nhật. |

---

### 2.8. Bảng `admin_users` (Danh sách Quản trị viên)
Liên kết các tài khoản đăng nhập Admin với Supabase Authentication (`auth.users`).

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | **PK, FK -> `auth.users(id)` ON DELETE CASCADE** | ID người dùng gán từ hệ thống Auth của Supabase. |
| `email` | `text` | | Email đăng nhập của tài khoản Admin. |
| `role` | `text` | Default `'admin'` | Tên vai trò quản trị trong hệ thống (`super_admin`, `coach`, `staff`, `collaborator`). |
| `created_at` | `timestamptz` | Default `now()` | Ngày tạo tài khoản Admin. |

---

### 2.9. Các Bảng Phân Quyền (RBAC: `roles`, `permissions`, `role_permissions`)

#### Bảng `roles` (Danh mục Vai trò)
- `name` (`text`, **PK**): Mã vai trò (VD: `super_admin`, `coach`, `staff`, `collaborator`).
- `display_name` (`text`): Tên hiển thị (VD: `Super Admin`, `HLV / Chuyên gia`).
- `created_at` (`timestamptz`): Thời gian khởi tạo.

#### Bảng `permissions` (Danh mục Quyền hạn Chức năng)
- `code` (`text`, **PK**): Mã quyền hạn (VD: `view_students`, `edit_plan`, `delete_student`, `view_financials`, `view_video`, `approve_email`...).
- `display_name` (`text`): Tên tiếng Việt hiển thị quyền hạn.
- `created_at` (`timestamptz`): Thời gian tạo.

#### Bảng `role_permissions` (Bảng Ma Trận Phân Quyền)
- `role_name` (`text`, **FK -> `roles(name)`**): Mã vai trò.
- `permission_code` (`text`, **FK -> `permissions(code)`**): Mã quyền được gán.
- **Primary Key:** `(role_name, permission_code)`.

---

### 2.10. Bảng `attendance_logs` (Lịch sử Chuyên cần Học viên)
Lưu vết các ngày học viên mở phác đồ tập luyện để chạy báo cáo và thống kê chuyên cần.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID định danh lượt học. |
| `customer_id` | `text` | **FK -> `customers(customer_id)` ON DELETE CASCADE** | Mã học viên tham gia học. |
| `access_date` | `date` | **NOT NULL, Default `CURRENT_DATE`** | Ngày tập luyện (định dạng `YYYY-MM-DD`). |
| `created_at` | `timestamptz` | Default `now()` | Thời điểm ghi nhận log chuyên cần. |
| *Constraint* | | **UNIQUE(customer_id, access_date)** | Đảm bảo mỗi học viên chỉ có tối đa 1 điểm chuyên cần/ngày. |

---

### 2.11. Bảng `admin_logs` (Nhật ký Thao tác & Tự động Phê duyệt)
Lưu nhật ký bảo mật khi có sự kiện tự động duyệt email, duyệt thiết bị hoặc cảnh báo xâm nhập.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID nhật ký. |
| `type` | `text` | **NOT NULL** | Loại sự kiện (`AUTO_APPROVED_EMAIL`, `AUTO_APPROVED_DEVICE`, `LOGIN_FAIL`...). |
| `customer_id` | `text` | **FK -> `customers(customer_id)` ON DELETE CASCADE** | Mã học viên liên quan. |
| `old_email` | `text` | | Email cũ của học viên trước khi đổi. |
| `new_email` | `text` | | Email mới được duyệt cập nhật. |
| `approved_device` | `text` | | Mã thiết bị được duyệt tự động. |
| `message` | `text` | | Ghi chú văn bản chi tiết về lý do/sự kiện. |
| `created_at` | `timestamptz` | Default `now()` | Thời gian xảy ra sự kiện. |

---

### 2.12. Bảng `video_view_logs` (Nhật ký Xem Video Chi tiết)
Theo dõi hành vi phát video của học viên hoặc admin để bảo vệ bản quyền video trên BunnyCDN.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID định danh lượt xem. |
| `user_id` | `uuid` | | ID tài khoản Admin nếu người xem là Admin. |
| `customer_id` | `text` | | Mã học viên thực hiện xem video. |
| `task_id` | `uuid` | | ID bài tập liên quan. |
| `bunny_video_id` | `text` | | Mã Video GUID trên BunnyCDN. |
| `ip` | `text` | | Địa chỉ IP của thiết bị xem. |
| `user_agent` | `text` | | Trình duyệt / thiết bị phát video. |
| `created_at` | `timestamptz` | Default `now()` | Thời gian mở xem video. |

---

### 2.13. Bảng `payment_orders` (Đơn hàng & Giao dịch Thanh toán)
Lưu vết payload giao dịch thanh toán mua khóa học/sản phẩm.

| Tên Trường | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Mô Tả |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PK, Default `gen_random_uuid()` | ID định danh đơn hàng. |
| `customer_id` | `text` | | Mã học viên thanh toán. |
| `order_payload` | `jsonb` | Default `'{}'` | Dữ liệu chi tiết hóa đơn thanh toán. |
| `created_at` | `timestamptz` | Default `now()` | Thời gian tạo đơn. |

---

## 3. CẤU TRÚC DỮ LIỆU CÁC CỘT JSONB NÂNG CAO

### 3.1. Cột `customers.san_pham` (Danh sách sản phẩm đã mua)
Mảng các đối tượng `PurchasedProduct` có cấu trúc:
```json
[
  {
    "id_sp": "SP001",
    "ten_sp": "Bộ Dụng Cụ Nắn Chỉnh Khuôn Mặt V1",
    "so_luong": 1,
    "don_gia": 1500000,
    "gia_nhap": 800000,
    "thanh_tien": 1500000
  }
]
```

### 3.2. Cột `customers.sidebar_blocks_json` (Các khối thông tin Sidebar phác đồ)
Lưu cấu trúc các thẻ thông tin phụ bên cạnh bài tập của học viên:
```json
[
  {
    "id": "block_17161829001",
    "title": "BỮA ĂN CHẤT LƯỢNG",
    "content": "Ưu tiên đạm chất lượng cao từ thịt, cá, trứng. Tham khảo thực đơn tại đây...",
    "type": "default", 
    "video_link": "https://drive.google.com/file/d/1_8uKdhWj2L2mVDcSQ5-epsyWDV5Lb-cz/view"
  },
  {
    "id": "block_17161829002",
    "title": "HỖ TRỢ TRỰC TIẾP CHUYÊN GIA",
    "content": "Liên hệ ngay nếu có câu hỏi trong quá trình tập luyện.",
    "type": "dark",
    "is_chat": true
  }
]
```
- `type`: `"default"` (nền trắng chữ xanh) hoặc `"dark"` (nền xanh đậm chữ trắng).
- `is_chat`: `true` -> Nút sẽ kích hoạt hộp thoại chat AI/Chuyên gia.
- `video_link`: Link video hoặc ảnh hướng dẫn kèm theo khối.

### 3.3. Cột `customers.raw_backup` (Dữ liệu mở rộng & Điểm danh)
```json
{
  "completed_days": [1, 2, 3, 5],
  "video_open_dates": ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-22"],
  "is_deposit": true,
  "deposit_amount": 500000,
  "is_consultation": false,
  "creator_email": "admin@phacdo.com"
}
```

---

## 4. QUY TRÌNH & LOGIC NGHIỆP VỤ KHI TÍCH HỢP HỆ THỐNG MỚI

### 4.1. Cách lấy danh sách bài tập theo Ngày cho Học viên (Logic chuẩn)
Để hệ thống mới lấy đúng bài tập trong Ngày $N$ của học viên `CUSTOMER_ID`:

```typescript
// 1. Đọc thông tin học viên
const { data: customer } = await supabase
  .from('customers')
  .select('*')
  .eq('customer_id', CUSTOMER_ID)
  .single();

let tasks = [];

if (customer.is_customized) {
  // 2A. Nếu đã cá nhân hóa -> Lấy từ customer_tasks
  const { data: customTasks } = await supabase
    .from('customer_tasks')
    .select('*')
    .eq('customer_id', CUSTOMER_ID)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true });
    
  tasks = customTasks;
} else {
  // 2B. Nếu chưa cá nhân hóa -> Lấy từ master_video_tasks theo video_date và nhóm (ma_vd)
  let query = supabase
    .from('master_video_tasks')
    .select('*')
    .eq('video_date', customer.video_date)
    .order('sort_order', { ascending: true });
    
  if (customer.ma_vd) {
    query = query.eq('nhom', customer.ma_vd);
  }
  
  const { data: masterTasks } = await query;
  tasks = masterTasks;
}

// 3. Lọc lấy bài tập của Ngày thứ N (day = N)
const dayTasks = tasks.filter(t => t.day === N);
```

### 4.2. Xử lý Link Video (BunnyCDN, Google Drive, Zalo)
- **BunnyCDN Video ID (GUID):** Gọi Edge Function `get-bunny-video-token` truyền `{ video_id, customer_id, token }` để nhận URL có chữ ký hết hạn sau 5 phút: `https://video.phacdo.com/embed/...`.
- **Google Drive Link:**
  - Nếu link chứa `drive.google.com`, tự động chuyển đổi `/view` thành `/preview` khi nhúng `iframe`.
  - Hỗ trợ xem trực tiếp ảnh bằng CDN Proxy của Google: `https://lh3.googleusercontent.com/d/{FILE_ID}`.
- **Zalo / Facebook / Social Link:**
  - Tuyệt đối mở bằng tab mới (`window.open(link, '_blank')`), không nhúng qua `iframe` vì Zalo chặn `X-Frame-Options`.

### 4.3. Xác thực & Phê duyệt thiết bị (`customer_devices`)
1. Khi học viên mở link trên thiết bị mới, hệ thống tạo mã Fingerprint JS `device_id`.
2. Truy vấn `customer_devices` với `customer_id` và `device_id`.
3. Nếu `is_approved = true`, cho phép xem phác đồ. Nếu chưa duyệt hoặc số thiết bị vượt quá giới hạn, mở màn hình yêu cầu xác thực Google Email hoặc duyệt tự động (ghi log vào `admin_logs`).

---

## 5. THỰC THI SCHEMA TRÊN SUPABASE (SQL SCRIPT CHI TIẾT)

Để khởi tạo nhanh CSDL cho một dự án mới hoàn toàn giống hệ thống hiện tại, chạy toàn bộ lệnh SQL bên dưới tại **Supabase SQL Editor**:

```sql
create extension if not exists "pgcrypto";

-- 1) Bảng Admin Users
create table if not exists admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

-- 2) Bảng Products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  id_sp text not null unique,
  ten_sp text,
  gia_nhap numeric not null default 0,
  gia_ban numeric not null default 0,
  trang_thai integer not null default 1,
  raw_backup jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Bảng Customers
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null unique,
  customer_name text,
  sdt text,
  email text,
  dia_chi text,
  san_pham jsonb not null default '[]'::jsonb,
  gia_tien numeric not null default 0,
  trang_thai_gan text,
  trang_thai integer,
  ma_vd text,
  note text,
  chewing_status text,
  start_date date,
  end_date date,
  duration_days integer,
  video_date date,
  status text not null default 'ACTIVE',
  sidebar_blocks_json jsonb not null default '[]'::jsonb,
  link text,
  token text not null,
  app_title text,
  app_slogan text,
  is_customized boolean not null default false,
  require_google_auth boolean not null default true,
  require_device_limit boolean not null default true,
  pending_email text,
  raw_backup jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) Bảng Customer Devices
create table if not exists customer_devices (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references customers(customer_id) on delete cascade,
  device_id text not null,
  device_name text,
  is_approved boolean not null default false,
  approved_at timestamptz,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(customer_id, device_id)
);

-- 5) Bảng Master Video Tasks
create table if not exists master_video_tasks (
  id uuid primary key default gen_random_uuid(),
  video_date date not null,
  day integer not null,
  type text,
  title text,
  detail text,
  link text,
  nhom text,
  sort_order integer not null default 0,
  raw_backup jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 6) Bảng Customer Tasks
create table if not exists customer_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references customers(customer_id) on delete cascade,
  day integer not null,
  type text,
  title text,
  detail text,
  link text,
  nhom text,
  is_deleted boolean not null default false,
  sort_order integer not null default 0,
  raw_backup jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 7) Bảng Ad Campaigns
create table if not exists ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  media jsonb not null default '[]'::jsonb,
  cta_name text,
  cta_link text,
  description text,
  display_now boolean not null default false,
  display_days integer,
  from_session integer,
  to_session integer,
  start_time timestamptz default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8) Bảng RBAC
create table if not exists roles (
  name text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  code text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role_name text references roles(name) on delete cascade,
  permission_code text references permissions(code) on delete cascade,
  primary key (role_name, permission_code)
);

-- 9) Bảng Logs
create table if not exists attendance_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references customers(customer_id) on delete cascade,
  access_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique(customer_id, access_date)
);

create table if not exists admin_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  customer_id text references customers(customer_id) on delete cascade,
  old_email text,
  new_email text,
  approved_device text,
  message text,
  created_at timestamptz not null default now()
);

-- Index tăng tốc truy vấn
create index if not exists idx_customers_token on customers(token);
create index if not exists idx_customers_lookup on customers(customer_id, token);
create index if not exists idx_master_tasks_lookup on master_video_tasks(video_date, day, sort_order);
create index if not exists idx_customer_tasks_lookup on customer_tasks(customer_id, day, sort_order);
create index if not exists idx_attendance_logs_date on attendance_logs(access_date);
```

---
*Tài liệu được tổng hợp tự động từ cấu trúc thực tế của hệ thống Mega Phương Facial Yoga Management System.*
