# MeGa Phương Android

Ứng dụng Android dùng Trusted Web Activity (Android Browser Helper của Google), mở duy nhất `https://quanlydakenh.vercel.app/`. Không nhúng khóa API, mật khẩu hoặc dữ liệu khách hàng trong APK. Không dùng WebView nên giữ luồng đăng nhập OAuth, chọn tệp, Web Push của trình duyệt hỗ trợ.

- Package: `vn.megaphuong.qldakenh`.
- Phiên bản đầu: `1.0.0` / versionCode `1`.
- Android tối thiểu: 7.0 (API 24). Cần Internet và trình duyệt hỗ trợ TWA như Chrome được cập nhật.
- Biểu tượng lấy từ `public/icons/app-512.png`.
- Các tính năng nghiệp vụ chạy trên máy chủ hiện tại, cập nhật web sẽ áp dụng cho app.

## Build

Cần Java 21, Android SDK Platform 36, Build Tools 36.0.0 và Gradle 9.2.1. Tạo `local.properties` với `sdk.dir` trỏ SDK máy build. Thư mục có dấu tiếng Việt có thể gây lỗi Java/aapt trên Windows; khi đó dùng bản sao project trong thư mục ASCII.

Khóa release và `signing.properties` được tạo riêng trong thư mục này, không đưa lên Git. Phải sao lưu cả hai ở nơi riêng tư; những bản nâng cấp APK sau phải dùng cùng khóa. Không tạo khóa mới khi build bản cập nhật.

```properties
storeFile=megaphuong-release.jks
storePassword=YOUR_PRIVATE_PASSWORD
keyAlias=megaphuong
keyPassword=YOUR_PRIVATE_PASSWORD
```

```powershell
gradle --no-daemon assembleRelease lintRelease
```

APK tại `app/build/outputs/apk/release/app-release.apk`. Tăng versionCode trước mỗi bản nâng cấp. Trên môi trường Windows bị lỗi Java NIO socket, thư mục tạm cho socket phải là đường dẫn Windows ngắn, ví dụ `-Djdk.net.unixdomain.tmpdir=C:\tmp`; cấu hình này chỉ phục vụ build, không nằm trong APK.

## Xác thực website và thông báo

Đưa `public/.well-known/assetlinks.json` lên tên miền, trả HTTP 200 với Content-Type `application/json`, không đăng nhập/chuyển hướng. Tệp chứa SHA-256 của chứng chỉ release công khai và package của ứng dụng. Khi chưa xác thực tên miền, trình duyệt có thể hiển thị thanh địa chỉ Custom Tab thay vì toàn màn hình. Nếu dùng Google Play App Signing sau này, bổ sung fingerprint của chứng chỉ Play.

Mở app, đăng nhập, bật thông báo thiết bị trong hệ thống và cho phép quyền thông báo khi Android/trình duyệt hỏi. Dịch vụ TWA nhận thông báo qua Web Push hiện có, không phải một hệ thống FCM riêng. Cần kiểm thử trên thiết bị thực các luồng đăng nhập, thông báo khi app đóng, mở hội thoại từ thông báo, chọn ảnh, tải tệp và nút Back; build thành công không xác nhận những luồng này đã chạy trên mọi thiết bị.

Tài liệu: https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities
