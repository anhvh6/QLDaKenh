# Chiến dịch truyền thông

Chiến dịch có hai phần độc lập: **Đăng bài** dùng các chiến dịch nội dung hiện có; **Truyền thông** dùng kết nối chat, trạng thái học viên và thư viện hiện có.

## Cấu hình

Vào **Chiến dịch → Truyền thông → Tạo chiến dịch**. Chọn **Nền tảng / Kênh chat** và trạng thái (một, nhiều hoặc tất cả). Danh sách kênh chỉ hiển thị kết nối đang hoạt động; tin trả lời luôn dùng chính hội thoại nguồn. Các trạng thái kết hợp theo OR; nền tảng, kênh và thời gian kết hợp theo AND. Chỉ xét hội thoại riêng, kết nối đang hoạt động, và quyền truy cập của người tạo. Không tự tạo nhóm hoặc kết bạn.

- **Sắp hết hạn:** còn từ 0 đến N ngày, theo ngày Việt Nam.
- **Đã hết hạn:** đã hết hạn ít nhất N ngày (0 vẫn chỉ khớp sau khi đã hết ngày cuối cùng).
- **Đang học:** đã qua ít nhất N ngày kể từ ngày bắt đầu, vẫn ở trạng thái Đang học.
- **Đã đặt cọc:** đã qua ít nhất N ngày từ lần chuyển sang đặt cọc được ghi nhận. Không đoán ngày đặt cọc từ ngày cập nhật hồ sơ bất kỳ.
- **Người mới:** tin đầu tiên được hệ thống ghi nhận là tin khách gửi trong khoảng từ lúc chiến dịch được tạo/bắt đầu áp dụng. Lịch sử trước đó trên các hội thoại riêng của khách được dùng để loại khách cũ. Nếu chọn chưa kết bạn, Zalo cá nhân phải có quan hệ bạn bè được xác định là `false`; chưa biết thì loại. Mỗi khách mới chỉ được xếp một lượt trong chiến dịch, kể cả khi cấu hình lặp.

Mỗi khối nội dung là một tin gồm văn bản và tối đa 10 tệp thư viện. Có tối đa 20 khối, sắp xếp bằng nút lên/xuống. `{{name}}` được thay bằng tên khách tại lúc gửi. Zalo OA hiện chỉ dùng văn bản; Zalo cá nhân và Messenger dùng chức năng tệp hiện có. Giới hạn và cửa sổ trả lời của nền tảng vẫn được kiểm tra qua adapter gửi tin hiện có.

## Lịch và hàng đợi

Tất cả thời gian dùng GMT+7. **Một lần** chạy vào ngày bắt đầu tại giờ gửi; giờ này không được trước thời điểm bắt đầu. **Chu kỳ** chạy mỗi N ngày tính từ ngày bắt đầu, tại giờ gửi. Không có ngày kết thúc nghĩa là tiếp tục đến khi tạm dừng. Lịch quá 30 phút không tự gửi bù khi máy chủ hoạt động lại. Chế độ **Thủ công** cho xem người nhận và chủ động xếp hàng trong khoảng áp dụng.

Người nhận được kiểm tra lại trước từng tin. Mỗi lượt lịch có mã duy nhất; bấm gửi thủ công dùng request ID và version để chống gửi lặp/stale cấu hình. Mỗi giây xử lý tối đa một khối, theo thứ tự của từng người nhận. Khách đã có lượt còn chờ hoặc chưa rõ kết quả không được xếp trùng ở lượt kế tiếp.

Tạm dừng hoặc sửa cấu hình hủy các tin chưa gửi của cấu hình cũ. Tin đang được nền tảng tiếp nhận có thể hoàn tất. Trước khi gọi nền tảng, job được lưu `sending`; khi khởi động lại, job này thành `unknown`, không tự gửi lại. Lỗi hoặc kết quả chưa rõ dừng các khối còn lại của người nhận đó. Nhật ký có thông tin lỗi và nút mở hội thoại để kiểm tra.

## Dữ liệu và kiểm thử

Các loại bản ghi mới: `communication_campaigns`, `communication_runs`, `communication_jobs`. API `/api/communication-campaigns` yêu cầu đồng thời quyền chiến dịch và inbox. Lượt và job lưu actor, configRevision, người nhận, thứ tự khối và mã tin nhắn. Worker không đổi chiến dịch đăng bài, dữ liệu phác đồ hoặc cấu hình POS.

- Unit/integration: `node --test tests/communication-campaigns.test.mjs`
- UI PC/mobile bằng dữ liệu tạm và kênh mô phỏng: `npm run test:communication-ui`
- Hồi quy: `node --test --test-concurrency=1 tests/*.test.mjs`

Không tạo chiến dịch thật, kích hoạt gửi cho khách thật hoặc gửi tin thử thật trong quá trình triển khai tính năng.

## Gửi ngay cho Người mới

Khi chọn Người mới, có thể bật **Gửi ngay sau khi nhận được tin nhắn**. Chế độ này chỉ dùng Người mới, tự động thực hiện và ẩn Lặp lại, Chu kỳ, Giờ gửi. Ngày bắt đầu/kết thúc vẫn giới hạn thời gian áp dụng. Worker kiểm tra mỗi giây, dựa trên tin đến trực tiếp và xếp một lượt bền vững theo mã tin đầu tiên; không kích hoạt bởi lịch sử nhập lại, không gửi trùng khi nền tảng phát lại tin và không gửi bù những tin nhận trong lúc tạm dừng. Điều kiện chưa kết bạn vẫn áp dụng nếu được chọn.
