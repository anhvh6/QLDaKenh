# Rà soát tài khoản Viettel Post — 09/10/2026

## Định danh đã đối chiếu

- Partner Production: Đỗ Thị Kim Dung, tài khoản 0988262641.
- Token kết nối đang bật: subject 0988262641, UserId 14280733.
- API listInventory trả cusId 14280733 cho cả ba kho 29597917, 29380875, 17983067.
- Website viettelpost.vn hiển thị Đỗ Thị Kim Dung và ba kho trùng tên, điện thoại, địa chỉ với API; A Hoàng Anh là kho mặc định trên website.
- Kho A Hoàng Anh: 29380875, số người gửi 0378243131. Số người gửi khác số đăng nhập là bình thường.
- Kết nối đã ngắt cũng cùng subject/UserId/kho. Chỉ đọc để đối chiếu, không kích hoạt lại hoặc sử dụng tạo đơn.

Kết luận: dữ liệu đối chiếu nhất quán với cùng tài khoản; không có bằng chứng kết nối nhầm tài khoản. Số điện thoại/email trên biểu mẫu thông tin tài khoản website bị trình duyệt che, nên không đọc vượt qua cơ chế che đó. Định danh được đối chiếu bằng Partner, token và các kho do API xác thực trả về.

## Lỗi tạo đơn thực tế

- Mã tham chiếu: MOC-MV0OXU91-E06899 (không phải mã vận đơn).
- Lần tạo được duyệt gần nhất: 16:58:50 ngày 09/10/2026, Asia/Ho_Chi_Minh.
- Endpoint: POST https://partner.viettelpost.vn/v2/order/createOrder.
- HTTP 200; mã nghiệp vụ 205; message System error; không trả ORDER_NUMBER.
- Kho 29380875, dịch vụ VMCH được báo cước 24639đ, COD 0đ, ORDER_PAYMENT 1, trọng lượng 500g.
- Địa chỉ V2 gửi 1/24/477, nhận 2/43/781 đã đối chiếu danh mục.
- Token chưa hết hạn tại thời điểm gửi. Luồng cấp token của kết nối cũ chưa được ghi lại, không thể chứng minh chỉ qua JWT.
- Tài liệu hãng mô tả System error là lỗi phát sinh từ backend chưa xác định nguyên nhân. Không suy ra riêng từ mã 205 rằng sai token hoặc hãng đã tạo đơn.

## Sửa trong hệ thống

- Giữ lựa chọn mặc định, dịch vụ và cấu hình kho khi cập nhật kết nối.
- Sửa kết nối bằng token để trống giữ token API hiện tại, không đổi lại qua LoginVTP.
- Ghi lại luồng cấp token LoginVTP/ownerconnect/token nhập trực tiếp cho các lần kết nối mới.
- Hiển thị số tài khoản, mã khách hàng và ngày hết hạn cho chủ hệ thống.

## Bước xác minh còn thiếu

Cần xác minh luồng cấp token của kết nối cũ. Nếu lấy token ở Quản lý token của website, nhập token nguồn vào chế độ website để đổi đúng qua LoginVTP. Không đưa JWT hiện tại trở lại LoginVTP. Nếu dùng Partner, thực hiện Login và ownerconnect với cùng tài khoản theo tài liệu. Sau khi xác minh luồng token, thử tạo cần một lần gửi thực tế được duyệt riêng và đối chiếu trùng, do lần duyệt trước đã sử dụng.

Nếu token cấp lại đúng luồng vẫn lỗi 205, cần Viettel Post tra cứu thời điểm/endpoint/mã tham chiếu hoặc cung cấp sandbox chính thức để tái hiện. Người dùng không cần tự có quyền log backend. Không gửi token, mật khẩu hoặc yêu cầu tự thay CUS_ID theo phỏng đoán cho bộ phận hỗ trợ.

Nguồn: https://partner2.viettelpost.vn/document/token-authen ; https://partner2.viettelpost.vn/document/environment-parameter ; https://partner2.viettelpost.vn/document/create-order-id-address

## Kết quả sau khi cấp lại token website megaphuong

Ngày 09/10/2026, người dùng nhập token megaphuong vào chế độ website. Hệ thống đổi qua LoginVTP thành công, ghi authMethod=LoginVTP, subject=0988262641, UserId=14280733, hết hạn 17:12:26 ngày 10/10/2026.

Phát hiện và sửa biểu mẫu kho không chọn lại inventory hiện tại khi mở: thao tác lưu kho có thể ghi inventoryId rỗng dù tên/địa chỉ vẫn hiển thị đúng. Đã khôi phục kho 29380875 và sửa biểu mẫu giữ đúng option. Lỗi này không giải thích các lần thử trước có GROUPADDRESS_ID đúng; không coi đây là nguyên nhân đã được chứng minh của lỗi 205.

Sau khi người dùng duyệt riêng, đã kiểm tra trùng theo điện thoại và mã tham chiếu trên website, tất cả trạng thái, tất cả kho, ngày 03–09/10: không có kết quả. Gửi đúng một lần lúc 17:17:24.912 ngày 09/10/2026 (10:17:24.912 UTC), bằng token LoginVTP mới, kho 29380875, dịch vụ VMCH 24639đ, COD 0, ORDER_PAYMENT 1, CHECK_UNIQUE true. Kết quả HTTP 200 / status 205 / System error; không có ORDER_NUMBER. Giữ unknown và không thử tiếp.

Các bước cấp lại token, đối chiếu tài khoản và khôi phục kho đã hoàn tất. Kết quả thực tế chưa chứng minh quyền tạo đơn thành công. Cần hãng kiểm tra xử lý yêu cầu tại thời điểm trên hoặc cấp sandbox chính thức; không thể xác định thêm nguyên nhân chỉ từ phản hồi này.
