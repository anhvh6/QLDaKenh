# Đối chiếu tích hợp Viettel Post — 09/10/2026

Đã đọc tài liệu chính thức trên trình duyệt và đối chiếu mã nguồn, yêu cầu đã lưu trên VPS và danh mục địa chỉ API. Không tạo thêm vận đơn trong đợt rà soát này.

## Nguồn

- [Hướng dẫn tích hợp](https://partner2.viettelpost.vn/document/detail-instructions)
- [Token xác thực](https://partner2.viettelpost.vn/document/token-authen)
- [Môi trường, định dạng và thông báo lỗi](https://partner2.viettelpost.vn/document/environment-parameter)
- [Tạo đơn bằng ID địa chỉ](https://partner2.viettelpost.vn/document/create-order-id-address)

## Kết quả

| Nội dung | Đối chiếu |
| --- | --- |
| Production | Đúng: `https://partner.viettelpost.vn`, không dùng domain dashboard để gọi API. |
| Header Token | Đúng: token trong header, thông tin lưu mã hóa. |
| Xác thực Partner | Mã có luồng `Login → ownerconnect`, đúng tài liệu. |
| Token sao chép từ website | Mã có chế độ đổi bằng `LoginVTP`, đúng tài liệu. Kết nối cũ không lưu phương thức xác thực nên không chứng minh được đường lấy token chỉ từ JWT. |
| Token Partner = -1 | Tài liệu không định nghĩa đây là quyền tạo đơn; không được dùng riêng giá trị này để chặn. Quy tắc chặn đã được bỏ ở lần sửa trước. |
| Tạo đơn | Đúng endpoint `POST /v2/order/createOrder`, có kho, địa chỉ ID, sản phẩm, dịch vụ và kiểm tra trùng. |
| Địa chỉ đã gửi | Danh mục V2 xác nhận `1/24/477` = Hà Nội/Đống Đa/Khương Thượng; `2/43/781` = TP.HCM/Quận 1/Cầu Kho. Không trộn mã V2/V3 trong đơn này. |
| COD/thanh toán | Đúng: `ORDER_PAYMENT=1`, `MONEY_COLLECTION=0` cho đơn đã chọn chuyển khoản và shop trả cước. |
| CUS_ID | Bản trước suy từ JWT UserId, không có căn cứ trong tài liệu. Đã đưa về `0` theo mẫu chính thức; chưa chứng minh đây là nguyên nhân lỗi. |
| Dịch vụ thêm | Đưa giá trị rỗng về chuỗi rỗng theo mẫu, thay vì `null`. |
| Content-Type | Bổ sung `charset=UTF-8` theo tài liệu. |
| Giới hạn chuỗi | Thêm kiểm tra 150 byte UTF-8. Địa chỉ gửi/nhận của lần lỗi chỉ 81/68 byte, nên giới hạn này không giải thích lần lỗi đó. |
| Ngày giao | Bỏ ngày tự phát sinh khi người dùng chưa đặt lịch. Tài liệu chung nhắc `yyyy-MM-dd`, mẫu tạo đơn lại dùng ngày/giờ dạng `dd/MM/yyyy`; không khẳng định một định dạng chưa được hãng xác nhận. |
| Webhook | Dùng nhận trạng thái sau khi hãng tạo đơn; webhook kiểm tra thành công không chứng minh quyền tạo đơn. |

## Giới hạn xác minh

Lần gửi được người dùng cho phép trước đợt rà soát này: `MOC-MV0OXU91-E06899`, 15:56:13 ngày 09/10/2026 (Asia/Ho_Chi_Minh), kho `29380875`, dịch vụ `VMCH`, cước báo `24639`, COD `0`. API trả `System error`, chưa có mã vận đơn. Trạng thái được giữ `unknown`, không tự gửi lại.

Tài liệu hãng mô tả `System error` là lỗi backend chưa xác định rõ nguyên nhân. Đọc được kho và báo cước chưa chứng minh tài khoản/dịch vụ được phép tạo đơn. Không thể kết luận lỗi nằm hoàn toàn ở hãng hoặc ở payload chỉ từ thông báo này. Cần log xử lý của Viettel Post hoặc một lần thử tiếp được người dùng cho phép sau khi đối chiếu trùng.
