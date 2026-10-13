# Kết nối OAuth mạng xã hội

Ứng dụng hỗ trợ OAuth chính thức cho Facebook Page, Instagram Professional, Threads, X, YouTube và TikTok. Tạo ứng dụng tại cổng nhà phát triển của từng nền tảng, bật đúng sản phẩm/quyền, rồi cấu hình biến môi trường trước khi khởi động máy chủ.

## Biến môi trường

```text
OAUTH_BASE_URL=https://your-public-domain.example
META_APP_ID=
META_APP_SECRET=
THREADS_APP_ID=
THREADS_APP_SECRET=
X_CLIENT_ID=
X_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

`OAUTH_BASE_URL` có thể bỏ qua khi thử Facebook, Threads, X hoặc YouTube trên `localhost`. TikTok yêu cầu callback HTTPS công khai. Có thể ghi đè riêng callback bằng `<PROVIDER>_REDIRECT_URI`, ví dụ `GOOGLE_REDIRECT_URI`.

Đăng ký các callback tương ứng:

```text
<OAUTH_BASE_URL>/api/oauth/facebook/callback
<OAUTH_BASE_URL>/api/oauth/instagram/callback
<OAUTH_BASE_URL>/api/oauth/threads/callback
<OAUTH_BASE_URL>/api/oauth/x/callback
<OAUTH_BASE_URL>/api/oauth/youtube/callback
<OAUTH_BASE_URL>/api/oauth/tiktok/callback
```

Sau khi khởi động lại, vào **Cài đặt → Kênh kết nối** và chọn nền tảng. Access token và refresh token được mã hóa trong SQLite bằng `data/encryption.key`; chúng không được trả về trình duyệt hoặc xuất trong bản sao JSON.

Facebook/Instagram cần quyền quản lý Page; Instagram phải là tài khoản Professional liên kết với Page. TikTok Direct Post cần quyền `video.publish` được duyệt. OAuth YouTube hiện xác minh kênh; tải video tự động vẫn ở chế độ hỗ trợ.

## Nhận bình luận/tin nhắn qua webhook (Facebook)

Kết nối OAuth thành công không tự động làm Facebook gửi sự kiện (bình luận, tin nhắn) cho Page đó — cần đủ hai việc:

1. **Webhook cấp App** (một lần, làm thủ công trong [Meta App Dashboard](https://developers.facebook.com/apps)): mục *Webhooks* → thêm sản phẩm Webhooks cho Page → Callback URL là `<OAUTH_BASE_URL>/api/webhooks/<connectionId>`, Verify Token khớp `verifyToken` đã lưu cho kênh đó (đặt trong **Cài đặt → Kênh kết nối**) → bật trường `feed` (bình luận) và `messages` (tin nhắn).
2. **Đăng ký Page vào App** (`subscribed_apps`): ứng dụng tự gọi API này ngay sau khi OAuth kết nối Page, và gọi lại mỗi khi bấm **Kiểm tra kết nối**. Việc này cần quyền `pages_manage_metadata` — nếu Page được kết nối từ trước khi quyền này được thêm vào luồng OAuth, hãy **kết nối lại Facebook Page** (ngắt rồi OAuth lại) để cấp quyền mới; chỉ bấm "Kiểm tra kết nối" trên token cũ sẽ không đủ quyền và việc đăng ký sẽ âm thầm thất bại.

Nếu bình luận/tin nhắn thật không xuất hiện dù đã làm cả hai bước trên, kiểm tra thêm: `OAUTH_BASE_URL` (ví dụ URL ngrok) còn sống và trỏ đúng máy chủ đang chạy — URL ngrok miễn phí đổi mỗi lần khởi động lại, nên Callback URL đã đăng ký ở App Dashboard có thể đã lỗi thời.
