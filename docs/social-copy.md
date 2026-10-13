# Sao chép bài viết và kho Google Drive

Nội dung > Sao chép: dán link, Xem trước, Tải (thiết bị/Drive), Reup, Thoát.
Caption giữ nguyên Unicode, emoji, xuống dòng, hashtag; media giữ thứ tự.
Không dùng ảnh Open Graph đơn lẻ để giả lập một album đầy đủ.

Reup tạo bản nháp chưa tải media. Đăng/Lên lịch mới tạo tác vụ nền: tải bản
cao nhất bộ trích xuất cung cấp, lưu Drive, nạp assets rồi tạo lịch xuất bản.
Nếu tải/Drive lỗi, không tạo lịch đăng; tác vụ hiện lỗi và cho Thử lại.
Chỉ chạy hai tác vụ tải đồng thời trên VPS. Tác vụ bị gián đoạn do restart
được đánh dấu lỗi để người dùng kiểm tra và thử lại.

## Kho bài

Mỗi bài là một thư mục riêng:

- `caption.txt`: văn bản nguyên gốc UTF-8.
- `post.json`: schema `qlda-social-post`, version 1; nguồn, tiêu đề, caption,
  media theo thứ tự và ID tệp Drive.
- Media ảnh/video, có thứ tự trong manifest.

Nội dung > Từ Google Drive: duyệt thư mục, chọn Dùng bài này. Hệ thống đọc
manifest, kiểm tra đủ tệp trong đúng thư mục, nạp ở nền và mở màn hình đăng
bài. Không cần nhập lại caption hay gắn từng media. Kho chỉ duyệt các tệp
ứng dụng có quyền truy cập theo scope `drive.file`.

## Cấu hình Google

Chủ hệ thống mở Cài đặt > Google Drive, nhập OAuth Client ID, Client Secret
và địa chỉ HTTPS công khai của ứng dụng. Bật Google Drive API trong Google
Cloud; OAuth client loại Web application. Redirect URI:
`https://quanlydakenh.vercel.app/api/drive/callback` (hoặc origin đã cấu hình).
Mỗi người dùng bấm Kết nối Google Drive và cấp quyền tài khoản của mình.
Refresh token và client secret chỉ lưu trong bảng secrets mã hóa; không trả
về API trạng thái. Có thể bỏ trống ID thư mục để tự tạo `QLDaKenh - Kho Reup`.

Google Drive không bị đổi sang chia sẻ công khai. API mạng xã hội đọc media
qua URL ký có hạn của ứng dụng; chỉ cấp cho asset của gói Sao chép.

## Runtime và giới hạn

VPS cần Python, FFmpeg và môi trường riêng:

```sh
python3 -m venv .copy-runtime
.copy-runtime/bin/pip install -r scripts/social-copy-requirements.txt
```

Node tự tìm `.copy-runtime/bin/python`, hoặc dùng `SOCIAL_COPY_PYTHON`.
Local Windows có thể đặt biến này trỏ tới Python đã cài các dependencies.

Facebook share được giải sang URL bài gốc. Album Facebook công khai đọc
payload của chính bài (đối chiếu post_id), kiểm tra số ảnh, chọn viewer image
lớn nhất; video dùng yt-dlp + FFmpeg. Gallery khác dùng gallery-dl, video dùng
yt-dlp. Bài riêng tư, bài bị gỡ, yêu cầu đăng nhập hoặc chặn máy chủ sẽ hiện
lỗi; không báo tải thành công khi thiếu media. Tối đa 100 media/bài, 1 GB/tệp.

Đăng album qua Facebook và carousel qua Instagram/Threads được hỗ trợ trong
connector. Các kênh khác giữ khả năng đăng tự động/hỗ trợ hiện có của hệ thống;
không hứa tự động đăng định dạng mà API chưa tích hợp. Bài nhiều video Facebook
phải dùng hỗ trợ đăng. Định dạng bố cục riêng của từng mạng không thể giữ nguyên
trên mọi mạng; caption và tệp nguồn được giữ nguyên trong gói bài.

## Kiểm tra

`node --test tests/social-copy.test.mjs tests/integration.test.mjs`

`node scripts/test-social-copy-ui.mjs`

`python scripts/test-social-copy-parser.py`

Kiểm thử Drive dùng API giả lập; cần OAuth thật để nghiệm thu tải vào tài khoản
Google của người dùng. Bốn link mẫu người dùng cung cấp đã kiểm tra trích xuất
trực tiếp trên VPS; video Reel đầu tiên đã tải thành MP4 có cả video và audio.
# Thư mục Google Drive có sẵn

Kết nối dùng scope `drive.file`. Dán ID không tự cấp quyền truy cập thư mục đã tạo ngoài ứng dụng. Trong Cài đặt > Google Drive, dùng **Chọn thư mục từ Google Drive** (Google Picker) để chọn và cấp quyền cho thư mục. Bật Google Picker API trong cùng dự án OAuth; nếu dự án yêu cầu developer key, nhập Google Picker API key ở cấu hình. Hạn chế key cho Google Picker API và website của ứng dụng cùng `https://docs.google.com/*`.

Endpoint POST `/api/drive/picker` yêu cầu phiên đăng nhập, quyền Nội dung và CSRF; chỉ trả access token ngắn hạn của người gọi để mở bộ chọn. Không trả refresh token hay client secret, không lưu token trong trình duyệt. Lưu thư mục kiểm tra lại quyền ghi qua Drive API trước khi thay cấu hình. ID hoặc link `https://drive.google.com/drive/folders/...` đều được hỗ trợ; lỗi 404/403 được phân biệt với lỗi máy chủ.

