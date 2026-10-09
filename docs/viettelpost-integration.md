# Viettel Post

## Kết nối tài khoản

Cài đặt → Đơn vị vận chuyển → Kết nối Viettel Post. Nhập token dài hạn của tài khoản, hoặc đăng nhập tài khoản API Partner. Nếu shop khác tài khoản Partner, nhập thêm tài khoản shop để `ownerconnect`. Hệ thống kiểm tra qua `listInventory` trước khi lưu; mật khẩu không được giữ lại. Token tài khoản và token webhook nằm trong bảng `secrets`, mã hóa AES-256-GCM bằng khóa riêng trên VPS.

Chọn môi trường thật hoặc sandbox và chọn kho gửi. Sandbox cần tài khoản thử nghiệm Viettel Post cấp; không dùng tài khoản thật thay cho tài khoản sandbox. Kho gửi phải có tên, điện thoại, địa chỉ đầy đủ. Đăng nhập sẵn trên website Viettel Post không đồng nghĩa hệ thống được quyền API; cần bước kết nối này.

## Gửi đơn

Cả màn hình Đơn hàng, Tạo đơn nhanh trong chat và Đơn hàng từ hồ sơ học viên đều có phần vận chuyển. Để trống tài khoản để lưu nháp. Chọn tài khoản, nhập người nhận, địa chỉ đầy đủ, khối lượng gram, kích thước cm, giá trị hàng, COD, dịch vụ và loại thu hộ để tạo đơn và gửi sang hãng. Lấy dịch vụ/cước trước khi gửi. Đây là cước dự kiến, không tự thay đổi phí ship khách trả.

Viettel Post `ORDER_PAYMENT`: 1 không thu hộ; 2 thu hộ hàng và cước; 3 thu hộ hàng, shop trả cước; 4 chỉ thu cước, không thu hộ hàng. Hệ thống mặc định loại 3, cấm COD dương với loại 1/4. COD không được vượt tiền còn phải thu của đơn. Chỉ các sản phẩm vật lý được đưa vào kiện. Đơn khóa học/dịch vụ giữ quy trình thanh toán riêng.

Luồng gửi giữ tồn kho, ghi yêu cầu bền vững rồi gọi `createOrderNlp` với mã tham chiếu và `CHECK_UNIQUE=true`. Không tự gửi lại khi timeout/HTTP 5xx/kết quả chưa rõ; hiển thị đơn đã lưu để kiểm tra. Webhook xác thực có mã tham chiếu tương ứng có thể khôi phục kết quả. Hoặc nhân viên kiểm tra ở hãng và dùng Xác minh vận đơn. Khi hãng từ chối rõ ràng, có thể sửa thông tin và gửi lại trên đơn đã lưu.

## Nhận trạng thái

Nút Webhook nhận trạng thái trong kết nối cung cấp URL HTTPS:

`/api/shipping/webhooks/viettelpost/{accountId}`

và token riêng. Cấu hình tại Partner Viettel Post và hoàn tất đăng ký/duyệt webhook theo tài khoản. Chấp nhận mẫu `{ DATA: {...}, TOKEN: "..." }`, hoặc token trong Authorization (có thể có tiền tố Bearer). Không dùng token API tài khoản làm token webhook. API nhận webhook không cần phiên đăng nhập của nhân viên và không đi qua CSRF của giao diện; bắt buộc kiểm tra token trước khi lưu.

Lưu trạng thái nguyên gốc, tên trạng thái, ngày giờ, địa điểm, nhân viên giao, cước, COD, dự kiến giao, bằng chứng và toàn bộ DATA. Chống callback trùng và ngược thời gian. Callback về trước kết quả tạo đơn được lưu rồi áp dụng khi có mã vận đơn. Các mã chưa nhận diện vẫn được giữ nguyên, không đoán trạng thái nội bộ.

Trạng thái nhận hàng trừ tồn kho một lần. Giao thành công không tự ghi nhận thanh toán. Hoàn hàng không tự nhập lại tồn; nhân viên cần kiểm tra hàng và lập phiếu nhận hoàn. Yêu cầu hủy chỉ gửi yêu cầu tới hãng; hàng giữ chỉ giải phóng khi nhận trạng thái hủy. Nhãn A6 được lấy qua `printing-code`, có hạn khoảng một giờ. Trang quản lý tự cập nhật các thay đổi mỗi 10 giây khi không đang nhập/làm việc trong modal.

## CSDL đang chạy

CSDL nghiệp vụ của ứng dụng là SQLite trên VPS (`data/hub.sqlite`). Dữ liệu học viên/phác đồ ở Supabase được giữ theo cấu trúc hiện tại. Tích hợp này không cần sửa bảng học viên của Supabase.

Migration tự chạy khi khởi động: `docs/shipping-storage.sqlite.sql` (version 3).

| Nơi lưu | Thông tin |
| --- | --- |
| records / shipping_accounts | Nhà cung cấp, tên tài khoản, môi trường, kho gửi, danh sách kho, trạng thái kết nối, phiên bản |
| secrets / carrier:{id} | Token API và token webhook mã hóa; không có mật khẩu |
| records / orders | Tên người nhận, điện thoại, địa chỉ, tài khoản vận chuyển, dịch vụ, kiện, trạng thái vận chuyển, shipmentId |
| records / shipments | Mã hãng, mã tham chiếu, accountId, COD, cước/chi tiết phí, kho/người nhận, mã/tên trạng thái hãng, nhân viên giao, vị trí, bằng chứng, lịch sử, dấu đã trừ tồn |
| shipping_requests | Payload tạo đơn, tham chiếu duy nhất/tài khoản, trạng thái gửi, kết quả/lỗi, thời gian |
| shipping_events | Callback đã xác thực, payload, trạng thái, ngày hãng/ngày nhận, cờ áp dụng; khóa chống trùng |
| shipping_order_details, shipping_account_details | View dữ liệu nghiệp vụ để đọc/đối soát |
| stock, payments, returns, audit | Giữ/trừ/nhập tồn, tiền thực nhận, kiểm hàng hoàn, nhật ký |

Sao lưu toàn bộ SQLite cùng `encryption.key` và uploads theo quy trình hiện tại. Không xuất token vào JSON hoặc log. Không sửa/truy vấn trực tiếp bảng secrets bằng màn hình nhân viên.

## Tài liệu chính thức dùng đối chiếu

- https://partner2.viettelpost.vn/document/environment-parameter
- https://partner2.viettelpost.vn/document/get-token-account
- https://partner2.viettelpost.vn/document/get-list-service-by-address-detail
- https://partner2.viettelpost.vn/document/create-by-detail-address
- https://partner2.viettelpost.vn/document/webhook-sample
- https://partner2.viettelpost.vn/document/follow-status-order
- https://partner2.viettelpost.vn/document/update-bill-of-lading-status
- https://partner2.viettelpost.vn/document/sync-end-status

## Xác minh

`npm run check`, `node --test --test-concurrency=1 tests/*.test.mjs`, `npm run test:shipping-ui`. Các bài kiểm tra gọi adapter giả để không tạo vận đơn thật. Vận hành thật còn cần token hợp lệ, kho gửi đầy đủ, webhook được hãng đăng ký và kiểm tra một đơn thật được chọn bởi shop. Không đánh dấu tài khoản thật đã kết nối hoặc webhook đã được hãng duyệt chỉ vì các bài kiểm tra giả đạt.
