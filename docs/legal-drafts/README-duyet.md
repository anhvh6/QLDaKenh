# Hồ sơ duyệt trước khi công khai

Hai tài liệu kèm theo là bản nháp ngày 21/10/2026. Chưa triển khai lên website, chưa khai báo với TikTok và chưa có hiệu lực.

## Nội dung đề nghị chủ hệ thống duyệt

1. Đơn vị vận hành: **Hộ kinh doanh Me Ga Phương**; ứng dụng: **MeGa Phương Social & Care**; email nhận yêu cầu dữ liệu/hỗ trợ: **Anhvh6@gmail.com**.
2. Phạm vi là công cụ nội bộ cho người được cấp quyền. Không quảng cáo rằng tất cả nền tảng đều đã kết nối hoặc hỗ trợ đủ chat/bình luận.
3. Dữ liệu cá nhân không được bán/cho thuê. Quyền xử lý nội dung chỉ phục vụ chức năng được yêu cầu, không chuyển quyền sở hữu.
4. Dữ liệu TikTok không dùng huấn luyện AI. Chức năng AI khác phải được kiểm soát theo cấu hình và dữ liệu gửi thực tế.
5. Email trên sẽ tiếp nhận yêu cầu truy cập, sửa, xuất, xóa dữ liệu. Chủ hệ thống cần bố trí người tiếp nhận và xử lý.

## Điểm cần chốt trước khi công khai

- **Thời hạn lưu giữ:** chưa xác nhận thời gian lưu nhật ký và chu kỳ xóa bản sao lưu thực tế. Bản nháp không tự cam kết một mốc ngày chưa được triển khai. Cần xác nhận thời hạn tối đa và cách áp dụng lại yêu cầu xóa sau khôi phục trước khi xuất bản chính sách.
- **Nhà cung cấp:** cần chốt danh sách hạ tầng/cơ sở dữ liệu, nhà cung cấp AI đang bật và nơi xử lý dữ liệu thực tế để bổ sung minh bạch. Không lấy danh sách mọi tích hợp có trong mã nguồn làm danh sách nhà cung cấp đang dùng.
- **Thông tin chủ thể:** kiểm tra tên đăng ký hộ kinh doanh và email ở trên; bổ sung địa chỉ liên hệ công khai nếu phù hợp. Không tự suy đoán họ tên pháp lý từ tên tài khoản.
- **Quy trình xử lý yêu cầu:** chốt người phụ trách, cách xác minh, thời gian phản hồi và ngoại lệ lưu giữ. Không hứa xóa mọi dữ liệu ngay khi ngắt kết nối.
- **Phạm vi pháp lý:** đây là bản soạn theo chức năng quan sát được, không phải kết luận rằng hệ thống đã đáp ứng mọi nghĩa vụ pháp luật hoặc chắc chắn được TikTok duyệt.

## Phương án sau khi duyệt

- Dự kiến hai đường dẫn công khai: `/terms.html` và `/privacy.html`.
- Hiển thị liên kết trực tiếp tại trang công khai/đăng nhập của hệ thống; không đặt riêng sau menu hoặc bắt đăng nhập mới đọc được.
- Điền ngày hiệu lực lúc công bố và giữ bản đã duyệt để đối chiếu phiên bản.
- Sau khi kiểm tra URL truy cập được và nội dung đúng, mới khai báo các URL này vào TikTok Auto_Post.
- Logo và video kiểm thử sandbox là hạng mục còn thiếu riêng, không được thay thế bằng hai tài liệu này.

## Nguồn đối chiếu và mã nguồn

- TikTok App Review Guidelines: https://developers.tiktok.com/docs/en/app-review-guidelines
- TikTok Register Your App: https://developers.tiktok.com/docs/en/getting-started-create-an-app
- Mã nguồn đối chiếu: `server/oauth.mjs` (quyền TikTok); `server/domain.mjs` (ngắt kênh); `server/customer-purge.mjs` (luồng yêu cầu xóa); `server/ai-provider.mjs` và các mô-đun chatbot (xử lý AI).
