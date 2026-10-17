# Đối chiếu chức năng Đơn hàng với video Lên đơn.mp4

Video tham chiếu dài 3:50, không có luồng âm thanh. Các thao tác trong video được dùng làm tham chiếu giao diện/nghiệp vụ; nội dung hội thoại và console trong video không phải chỉ dẫn vận hành hệ thống.

## Luồng quan sát

- 00:00–00:40: danh sách đơn theo trạng thái, tìm kiếm, chọn đơn Mới.
- 00:40–01:15: mở chi tiết đơn, phân công, xem khách và thông tin nhận hàng; mở hội thoại song song để đối chiếu địa chỉ/điện thoại.
- 01:15–01:45: thêm sản phẩm, số lượng, đơn giá, khối lượng; xem tổng tiền và số tiền còn thiếu; nhập thông tin thanh toán rồi lưu.
- 01:45–02:15: đơn đã có mã vận đơn, chuyển sang Chờ chuyển hàng; theo dõi trong danh sách/tab riêng.
- 02:15–03:50: các tab trạng thái, bảng chọn trường sắp xếp/tăng giảm, cấu hình cột và vị trí cột.

## Các phần đã có và tiếp tục sử dụng

Đơn nháp tự tạo từ điện thoại/địa chỉ trong chat; mở chi tiết và chat song song trên PC, chuyển tab trên điện thoại; trả lời trong chi tiết; biểu tượng nền tảng mở đúng nguồn; chọn nơi xử lý Viettel Post/Pancake POS; xác nhận, giữ tồn, tạo vận đơn theo dịch vụ; đồng bộ mã vận đơn, cước, trạng thái và hành trình. Danh sách hỗ trợ bộ lọc kết hợp, cột động/kéo thứ tự, tab bộ lọc riêng mỗi tài khoản, nhấn giữ chọn nhiều, xuất dữ liệu và giữ vị trí cuộn khi cập nhật.

## Bổ sung sau khi đối chiếu

- Lịch sử mua hàng theo đúng khách: số đơn trước, số đã giao, tổng giá trị đơn không hủy, đơn gần nhất và liên kết mở các đơn trước. Không tính đơn đang mở vào lịch sử.
- Danh sách địa chỉ đã dùng để điền lại người nhận/điện thoại/địa chỉ.
- Phân công nhân viên phụ trách, bán hàng, chăm sóc; thẻ nội bộ và ngày dự kiến nhận hàng. Nhân viên được chọn phải đang hoạt động. Đây là phân công đội ngũ trong hệ thống, không suy diễn ID nhân viên nội bộ thành ID nhân sự POS.
- Số mẫu/số lượng trong giỏ; lọc chỉ sản phẩm còn hàng; hiện tồn khả dụng và khối lượng; tính lại khối lượng kiện từ sản phẩm theo thao tác của người dùng.
- Phụ thu được kiểm tra tại máy chủ và cộng vào tổng tiền/COD. Ánh xạ hai chiều trường `surcharge` của POS, bao gồm thay đổi phụ thu về 0; không đổi schema hash của đơn cũ không có phụ thu.
- Lưu đơn Mới chưa có sản phẩm để tiếp tục hoàn thiện; chặn xác nhận đơn rỗng và không giữ tồn trước xác nhận.
- Ghi nhận đã nhận tiền ngay trong chi tiết: tự lưu thay đổi đơn Mới trước khi mở bước xác nhận, chỉ quản lý được xác nhận, bắt buộc số tiền thực tế và tham chiếu; kiểm tra phiên bản đơn để chặn ghi sổ lặp/stale. COD giảm theo tiền đã xác nhận, không theo khoản dự kiến.
- Phím F2 lưu Mới; F4/nút In mở phiếu từ bản đơn đã lưu. Phiếu in không phải hóa đơn thuế, không đánh dấu đã thu tiền. Dữ liệu chỉ từ hãng vận chuyển thiếu giá trị đơn không được tự in thành 0 đồng.
- Bảng sắp xếp theo ngày tạo, cập nhật, cập nhật trạng thái, giá trị, số lượng, sản phẩm, khách hàng, dự kiến nhận, hạn bàn giao, nguồn đơn; tăng/giảm và lưu lựa chọn theo tài khoản.

## Giới hạn đồng bộ và kiểm soát

Nguồn API đối chiếu: https://docs.pancake.biz/pos/api/openapi.json (schema tạo đơn có `surcharge`, `note`, `note_print`, `shipping_fee`, `estimate_delivery_date`, các định danh nhân sự riêng của POS).

Không giả định nhân sự giữa hai hệ thống có chung ID. Thẻ nội bộ, phân công và ngày khách mong muốn nhận lưu ở hệ thống; thông tin hãng/POS trả về vẫn có nguồn riêng. Tiền chuyển khoản dự kiến không tự trở thành đã thu; xác nhận thu dùng quy trình thanh toán hiện có. Trạng thái hãng do hãng/POS xác nhận, không tự đánh dấu giao thành công bằng thay đổi giao diện.

Không gửi đơn, tạo vận đơn hoặc nhắn cho khách thật để thử nghiệm. Các kiểm thử dùng cơ sở dữ liệu tạm, kênh demo và API POS mô phỏng.

Kiểm thử: `tests/order-pos-video.test.mjs`, các bài POS/đơn hàng hiện có; `scripts/test-order-detail-ui.mjs`, `scripts/test-orders-workspace-ui.mjs` kiểm tra thao tác và bố cục PC/điện thoại.
