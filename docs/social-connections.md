# Kết nối mạng xã hội

Trong Cài đặt > Kênh kết nối, hồ sơ có trạng thái `configured` chỉ là hồ sơ chờ cấp quyền. Chỉ sau khi OAuth hoặc kiểm tra token đọc được đúng tài khoản thì mới có trạng thái `connected`. Hồ sơ và liên kết công khai không phải thông tin xác thực API.

## Cổng bổ sung

- Mastodon: OAuth tại **mastodon.social**, đăng ký ứng dụng theo phiên, quyền `read:accounts write:statuses`. Không nhận URL máy chủ tùy ý. Bản này xuất bản văn bản, tối đa 500 ký tự.
- Reddit: cấu hình `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` cho ứng dụng web được phép dùng API. Callback `/api/oauth/reddit/callback`, quyền `identity submit`, phiên offline. Xuất bản bài văn bản lên hồ sơ người dùng, không tự đăng vào subreddit khác.
- Tumblr: cấu hình `TUMBLR_CLIENT_ID`, `TUMBLR_CLIENT_SECRET`. Callback `/api/oauth/tumblr/callback`, quyền `basic write offline_access`. Chọn đúng blog thuộc tài khoản đã cấp quyền. Xuất bản văn bản bằng Neue Post Format.
- Bluesky: chọn Sửa, nhập handle vào “Tài khoản cần kết nối”, nhập **mật khẩu ứng dụng** vào ô token, lưu rồi Kiểm tra. Mật khẩu ứng dụng được thay bằng access/refresh token sau khi xác minh. Chỉ hỗ trợ tài khoản trên `bsky.social`, bài văn bản tối đa 300 grapheme. Không dùng mật khẩu chính.
- Meta Business Suite: cổng mở trang quản trị; không phải tài khoản xuất bản độc lập.
- Google Doanh nghiệp: cổng quản trị hồ sơ; cần chủ doanh nghiệp xác minh với Google và được cấp quyền API trước khi tích hợp xuất bản. Hiện không quảng bá là kết nối API.

Mastodon và Bluesky đồng bộ bình luận công khai trên tối đa 20 bài gần đây mỗi lần; Bluesky đọc luồng trả lời sâu tối đa 6 cấp. Cả hai hỗ trợ trả lời văn bản. Bluesky thêm Like/gỡ Like và chia sẻ lại bình luận. Chưa tích hợp chat riêng cho hai cổng này; Tumblr/Reddit hiện chỉ có phần xuất bản văn bản. Khả năng được khai báo tại `public/social-capabilities.js`, dùng chung cho báo cáo và nút thao tác.

## Kiểm tra chức năng trên từng kênh

Trong mỗi thẻ Cài đặt, mở **Chức năng & kiểm tra API** rồi chọn **Kiểm tra API từng chức năng**. Phép kiểm tra chỉ gọi API đọc hồ sơ, dữ liệu, đăng ký webhook hiện có; không tự đăng bài, trả lời, Like, share hoặc gửi tin. Kết quả đọc thành công không chứng minh quyền ghi hay giao nhận thực tế. Các quyền ghi vẫn cần thử từ thao tác do người dùng chủ động thực hiện.

X và YouTube đã có nhánh trả lời bình luận; YouTube chuyển trả lời con về ID bình luận cấp đầu theo yêu cầu API. Blogger và DEV.to không có nhánh tạo trả lời trong connector, nên giao diện mở bài gốc thay vì hiển thị ô gửi không hoạt động. Instagram đã khai báo khả năng chat văn bản phù hợp với nhánh gửi hiện có; việc gửi còn phụ thuộc quyền token, webhook và cửa sổ 24 giờ.

YouTube và X quét bình luận mỗi 5 phút; YouTube luân phiên 5 video mỗi lần. Lỗi quota/credits/quyền giãn thử tự động 6 giờ; HTTP 429 giãn 15 phút. Đây là kiểm soát mức sử dụng, không tăng quota, mua credits hay tự cấp thêm quyền.

Bluesky chỉ có bài công khai. Hệ thống từ chối lựa chọn đăng riêng tư trước khi gửi để tránh vô tình làm lộ nội dung. Kết quả chia sẻ không xác định sẽ chặn thử lại tự động để tránh tạo bài trùng.

## Nhập danh sách hồ sơ

`node --env-file=.env scripts/import-social-profiles.mjs --file /duong-dan/profiles.json`

Mặc định chỉ xem trước. Thêm `--apply` để tạo kênh chờ kết nối bằng tài khoản chủ hệ thống và ghi nhật ký. Mỗi dòng gồm `provider`, `name`, `profileUrl`, tùy chọn `accountId`, `expectedAccount`, `note`. Không có token hoặc mật khẩu trong tệp. Chạy lại không tạo trùng hồ sơ đã nhập; không ghi đè các kênh khác.

`expectedAccount` giúp callback từ chối tài khoản đăng nhập nhầm. Với Facebook/Blogger/YouTube dùng ID cố định; Instagram/Threads/X/Reddit/Tumblr/Bluesky dùng handle. Mastodon dùng `username@mastodon.social`.

Không đăng bài thử lên tài khoản thật khi chỉ đang kiểm tra kết nối.

## Khôi phục

Trước khi nhập hồ sơ sản xuất, sao lưu SQLite bằng `VACUUM INTO`, đồng thời sao lưu `encryption.key`. Khi cần gỡ tính năng, triển khai lại commit trước; các hồ sơ mới vẫn được giữ để tránh mất dữ liệu. Khôi phục toàn bộ SQLite chỉ trong cửa sổ bảo trì sau khi lưu lại dữ liệu phát sinh kể từ bản sao lưu.
