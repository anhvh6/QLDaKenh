# taophacdo Social & Care — bản localhost

Ứng dụng quản lý nội dung đa kênh, bình luận, chăm sóc khách hàng, khách hàng/học viên, khóa học và bán hàng. Đã điều chỉnh theo hai tài liệu trong thư mục này. Chạy bằng Node.js 24+, không cần cài gói npm cho máy chủ.

**Truy cập:** http://localhost:4317

**Bản 2.1 — hợp nhất luồng tạo phác đồ:** Chat → tạo đơn → xác nhận nhận đủ tiền → **Tạo & quản lý phác đồ** → lưu và cập nhật hành trình học viên. Đã tích hợp trực tiếp PlanEditor từ mã nguồn `anhvh6/taophacdoT4`, có giao diện PC/điện thoại. Phác đồ ở giai đoạn này lưu tại localhost; chưa ghi ngược Supabase hoặc triển khai lên website production. Xem [hướng dẫn luồng hợp nhất](docs/UNIFIED_WORKFLOW.md).

```powershell
npm start
```

Hoặc chạy nền trên Windows:

```powershell
.\Start-Local.ps1
```

Lần đầu tự tạo tài khoản chủ hệ thống. Có thể chọn dữ liệu mẫu; kênh mẫu không đăng hay gửi tin ra ngoài. Tài khoản và dữ liệu đã có không bị đặt lại khi nâng cấp. Nếu đã thiết lập, đăng nhập bằng tài khoản đã tạo trước đó.

## Luồng sử dụng

1. **Cài đặt → Kênh:** thêm kênh ở chế độ mẫu, hỗ trợ thủ công hoặc API được connector hỗ trợ. Token lưu mã hóa ở máy chủ.
2. **Nội dung → Lịch đăng:** soạn một nội dung, chọn nhiều kênh, điều chỉnh bản từng kênh. Đăng ngay hoặc lên lịch tối thiểu 10 phút sau hiện tại; giờ Việt Nam GMT+7. Từng kênh có kết quả độc lập. Máy phải bật và máy chủ phải chạy đến giờ đăng.
3. **Bình luận:** xem riêng bình luận; trả lời công khai, gắn nhãn, ghi chú và tạo đơn theo khách đang được chọn. Facebook webhook có kiểm tra chữ ký và chống sự kiện lặp.
4. **Chat & chăm sóc:** dùng nhãn nhanh hai hàng; gõ `/` để chọn mẫu nhiều khối văn bản; xem trước rồi gửi lần lượt. SLA đánh dấu khách đang chờ quá hạn. Nội dung ghi chú không gửi ra ngoài và không kết thúc SLA.
5. **Cơ hội / Lead:** số điện thoại Việt Nam trong tin/bình luận được chuẩn hóa và tạo lead có nguồn. Số trùng chỉ tạo gợi ý, không tự gộp khách. Các bước NEW → CONTACTING → QUALIFIED → WON / LOST. LOST cần lý do; WON cần đơn xác nhận.
6. **Tạo đơn ngay trong chat:** mở tab “Tạo đơn”, chọn sản phẩm/khóa học, số lượng, giảm giá, thông tin nhận. Tạo nháp và tùy chọn gửi tóm tắt. Đơn được ghi vào timeline nội bộ.
7. **Đơn hàng:** kiểm tra rồi xác nhận để giữ tồn hàng vật lý. Bàn giao vận chuyển mới trừ tồn thực tế. Đơn khóa học/dịch vụ không giữ tồn và không tạo vận đơn. Ghi nhận thanh toán, hoàn tiền và COD là thao tác riêng; giao thành công không đồng nghĩa đã thu tiền.
8. **Hành trình học viên:** MOI → DA_CALL → DONG_TIEN → DANG_HOC → SAP_HET_HAN → DA_XONG. Từ bước thanh toán cần đơn thu đủ hoặc ghi danh đã xác minh; bắt đầu học cần ngày hợp lệ. Khi còn tối đa 7 ngày, hệ thống nhắc sắp hết hạn. Hết hạn không tự đánh dấu đã học xong.
9. **Hồ sơ 360°:** xem mã khách, sản phẩm từ taophacdo, khóa học đã mua, người phụ trách, thời hạn, lịch sử hành trình và bản đọc phác đồ/điểm danh.
10. **Đội ngũ & SLA:** chủ hệ thống tạo nhóm, chọn nhân viên và kênh; nhân viên chỉ đọc/thao tác khách thuộc phạm vi được giao. Chủ hệ thống/quản lý có phạm vi toàn workspace.

## Kết nối dữ liệu taophacdo

Mở **Tích hợp taophacdo**. Hiện hỗ trợ hai đường:

- Đăng nhập Supabase bằng URL dự án, publishable/anon key và tài khoản `super_admin` hiện có; không dùng service-role key. Kiểm tra cấu trúc, chọn bảng, xem trước, rồi nhập bản sao về localhost. Quyền đọc thực tế do Supabase RLS quyết định. Mật khẩu không lưu; access token mã hóa và hết hạn thì đăng nhập lại.
- Nhập file JSON `{"table":"customers","rows":[...]}` đã xuất từ hệ thống hiện tại. Có bước kiểm tra trước khi lưu. Mỗi request tối đa 2 MB; chia lô với bảng lớn.

**Hiện tại đây là cầu nối nhập chỉ đọc, không phải đồng bộ hai chiều.** Không có kết nối production được cấu hình sẵn; không SQL nào trong thư mục `supabase` đã được tự động chạy. Dữ liệu nhập được lưu vào SQLite của localhost; thay đổi tại đây chưa ghi ngược vào taophacdo.

Các bảng nhập được: `customers`, `products`, `courses`, `master_video_tasks`, `customer_tasks`, `attendance_logs`. Giữ `customers.id`, `customers.customer_id`, `products.id_sp`, `courses.id`. Danh mục khóa học có mã bán hàng nội bộ để lên đơn nhưng vẫn giữ `courseId` gốc.

Không nhập token học viên, raw_backup, ghi chú sức khỏe, thông tin thiết bị hoặc link video có bảo vệ. Không thay đổi Google Auth/device limit. Không gộp hai hồ sơ nguồn taophacdo tại localhost; việc gộp phải được xử lý ở hệ thống gốc để giữ quan hệ phác đồ/thiết bị.

Chi tiết: [TÍCH HỢP TAOPHACDO](docs/TAOPHACDO_INTEGRATION.md). Phạm vi đối chiếu SRS: [MA TRẬN YÊU CẦU](docs/REQUIREMENTS_STATUS.md).

## Phạm vi connector hiện tại

| Kênh | Chức năng có mã thực thi | Cần bổ sung / điều kiện |
|---|---|---|
| Facebook Page | Đăng văn bản/ảnh/video qua token; trả lời tin nhắn văn bản, bình luận; webhook Messenger và feed comment | App, quyền duyệt, token, phiên bản Graph, HTTPS webhook công khai; chưa có OAuth UI/refresh tự động/Private Reply/ẩn xóa comment |
| Instagram | Xuất bản ảnh/video bằng container | Tài khoản Professional và quyền API; chưa có inbox |
| Threads | Xuất bản văn bản/ảnh/video | Token và quyền tương ứng; chưa có inbox |
| X | Đăng văn bản | Token có quyền; chưa upload media/inbox |
| Blogger, DEV.to | Đăng bài văn bản | Blog ID/token hoặc API key; chưa đồng bộ bình luận |
| Zalo OA | Gửi tin tư vấn văn bản khi API cho phép | Chưa nhận webhook/OAuth hoặc đăng nội dung OA tự động |
| TikTok, YouTube, Reddit | Chuẩn bị gói nội dung, nhắc lịch, xác nhận URL đã đăng | Chưa có connector đăng API thực tế |
| Facebook cá nhân, Zalo cá nhân | Hỗ trợ đăng thủ công | Không dùng cookie/password để tự động hóa tài khoản cá nhân |

API có thể từ chối do quyền, loại tài khoản, cửa sổ nhắn tin hoặc hạn mức. Trạng thái `demo_published`, `awaiting_manual`, `accepted` và `published` được phân biệt; không báo “đã đăng thật” cho tác vụ mô phỏng. Các connector chưa được kiểm thử với tài khoản thật trong lần triển khai này.

Vận chuyển: có connector tạo đơn/báo phí GHN cần token/Shop ID; ViettelPost hiện **nhập mã vận đơn thực tế đã tạo ở hãng**, cập nhật và đối soát tại localhost. Chưa triển khai API tạo đơn/nhãn hãng/webhook ViettelPost. Phiếu in nội bộ không phải nhãn vận chuyển do hãng cấp.

## Dùng trên điện thoại

Giao diện responsive đã kiểm thử ở 390 × 844 và 1440 × 1000. Trên cùng Wi-Fi/LAN, khởi động máy chủ cho LAN:

```powershell
.\Start-Local.ps1 -BindAddress 0.0.0.0
```

Nếu bản chỉ-local đang chạy, dừng bằng `Stop-Local.ps1` trước rồi chạy lại. Truy cập `http://<IP-LAN-của-PC>:4317` từ điện thoại. Windows Firewall cần cho phép cổng theo cấu hình mạng của bạn. Không tự mở firewall, tunnel hoặc cổng Internet. `localhost` trên điện thoại trỏ về điện thoại, không trỏ về PC. Triển khai công khai cần HTTPS và worker chạy thường trực.

## Dữ liệu, sao lưu và vận hành

- SQLite: `data/hub.sqlite`, WAL bật. Media: `data/uploads/`.
- Khóa mã hóa: `data/encryption.key`. Giữ cùng bản sao lưu; mất khóa thì không đọc được token đã lưu.
- Trong Cài đặt có sao lưu SQLite và xuất JSON dữ liệu nghiệp vụ. Sao lưu database **không** bao gồm file media/khóa; cần sao lưu cả thư mục `data` khi dừng ứng dụng để có bản khôi phục đầy đủ.
- Bản sao trước nâng cấp: `data/backups/before-taophacdo-v2.sqlite` nếu dữ liệu đã có lúc nâng cấp.
- Không xóa `data`, không đưa lên Git. Không có password mặc định.
- Localhost dùng tài khoản/role nội bộ. Khi nhúng production, dùng Supabase Auth và RBAC có sẵn theo tài liệu tích hợp; tài khoản local không tự trở thành admin production.
- SSE thông báo thay đổi; nếu đang soạn hoặc có giỏ hàng thì hiện nút tải cập nhật để tránh mất nội dung đang nhập.

## Kiểm thử

```powershell
npm run check
npm test
npm run test:ui
```

API tests tạo database riêng trong `test-data`, không sửa dữ liệu của bạn. UI tests dùng Edge headless và Playwright trong runtime của máy này; máy khác đặt `PLAYWRIGHT_PATH` tới gói Playwright đã cài và chỉnh đường dẫn Edge nếu khác. `test-results` chứa ảnh PC/điện thoại và báo cáo UI.

Đã kiểm thử logic giá do server quyết định, chống bán vượt tồn, không ghi trùng COD, hoàn tiền/hoàn hàng, CSRF, giới hạn nhóm, mapping taophacdo, nhánh phác đồ, chuỗi mẫu, lead/webhook dedupe, chốt thanh toán học viên và dữ liệu tồn tại sau restart. Chưa kiểm thử SQL trên Supabase thật, RLS của hệ thống hiện hữu hay gửi bài/tin/vận đơn thật.
