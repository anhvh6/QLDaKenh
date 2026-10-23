# MeGa Phương Android

Ứng dụng Android dùng Trusted Web Activity (Android Browser Helper của Google), mở duy nhất `https://quanlydakenh.vercel.app/`. Không nhúng khóa API, mật khẩu hoặc dữ liệu khách hàng trong APK. Không dùng WebView nên giữ luồng đăng nhập OAuth, chọn tệp, Web Push của trình duyệt hỗ trợ.

- Package: `vn.megaphuong.qldakenh`.
- Phiên bản hiện tại: `1.0.2` / versionCode `3` (cài đè bản cũ bằng cùng khóa).
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
gradle --no-daemon testDebugUnitTest assembleRelease lintRelease
```

APK tại `app/build/outputs/apk/release/app-release.apk`. Tăng versionCode trước mỗi bản nâng cấp. Trên môi trường Windows bị lỗi Java NIO socket, thư mục tạm cho socket phải là đường dẫn Windows ngắn, ví dụ `-Djdk.net.unixdomain.tmpdir=C:\tmp`; cấu hình này chỉ phục vụ build, không nằm trong APK.

## Xác thực website và thông báo

Đưa `public/.well-known/assetlinks.json` lên tên miền, trả HTTP 200 với Content-Type `application/json`, không đăng nhập/chuyển hướng. Tệp chứa SHA-256 của chứng chỉ release công khai và package của ứng dụng. Khi chưa xác thực tên miền, trình duyệt có thể hiển thị thanh địa chỉ Custom Tab thay vì toàn màn hình. Nếu dùng Google Play App Signing sau này, bổ sung fingerprint của chứng chỉ Play.

Mở app, đăng nhập, bật thông báo thiết bị trong hệ thống và cho phép quyền thông báo khi Android/trình duyệt hỏi. Dịch vụ TWA nhận thông báo qua Web Push hiện có, không phải một hệ thống FCM riêng. Cần kiểm thử trên thiết bị thực các luồng đăng nhập, thông báo khi app đóng, mở hội thoại từ thông báo, chọn ảnh, tải tệp và nút Back; build thành công không xác nhận những luồng này đã chạy trên mọi thiết bị.

Tài liệu: https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities

## Bản sửa khởi động 1.0.1

`MainActivity` thay callback mặc định `QualityEnforcer` bằng `CustomTabsCallback` thông thường. Callback mặc định của thư viện cố ý ném RuntimeException khi provider gửi `quality_enforcement.crash`; lỗi mạng/điều hướng không được làm đóng tiến trình ứng dụng nghiệp vụ. Xác thực Digital Asset Links vẫn do trình duyệt thực hiện, không tắt hay bỏ qua. Bổ sung FocusActivity và REORDER_TASKS theo hướng dẫn thư viện để đưa hội thoại về trước khi mở thông báo. Launcher cho phép resize, không khóa hướng màn hình trên thiết bị gập.

Kiểm thử Robolectric trên API 35 và 36 tái hiện callback gây crash của thư viện, xác nhận callback mới không ném lỗi và kiểm tra manifest. Những kiểm thử này không thay thế chạy APK trên Samsung Fold 7 hoặc logcat của thiết bị.

## Bản sửa khởi động 1.0.2 và kiểm thử máy ảo

Đã cài APK 1.0.1 lên Android Emulator API 36 Google Play x86_64 và tái hiện lỗi native:

```
IllegalArgumentException: Component class
com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity
does not exist in vn.megaphuong.qldakenh
```

Stack trace đi qua `ManageDataLauncherActivity.addSiteSettingsShortcut` và `LauncherActivity.launchTwa`. Kiểm thử Robolectric không bắt được kiểm tra tồn tại component này của PackageManager trên thiết bị thật. Bản 1.0.2 khai báo Activity và `android:manageSpaceActivity`, đồng thời bổ sung `NotificationPermissionRequestActivity` để Chrome có thể xin quyền POST_NOTIFICATIONS thay mặt ứng dụng trên Android 13+.

Kịch bản kiểm thử thiết bị (sẽ đóng Chrome đang mở trên máy ảo, chỉ chạy sau khi đăng nhập xong):

```powershell
$env:ANDROID_ADB='C:/path/to/Android/Sdk/platform-tools/adb.exe'
$env:ANDROID_SERIAL='emulator-5556'
node scripts/test-android-emulator.mjs releases/android/MeGa-Phuong-1.0.2.apk
```

Kịch bản ghi log crash, thử 5 lần khởi động từ trạng thái Chrome đã đóng và đổi kích thước điện thoại/màn hình mở rộng/ngang. Kiểm thử Push phải làm riêng: bật quyền trên app, gửi từ hệ thống thật, xác nhận NotificationRecord thuộc `vn.megaphuong.qldakenh`, xem thông báo trong khay, đối chiếu receipt hiển thị từ service worker và bấm mở Hộp thư. Không coi HTTP gửi thành công là bằng chứng đã hiện thông báo.

Ngày 23/10/2026 đã kiểm chứng Push thật trên máy ảo Android 16 đã đăng nhập: thông báo thử và tin Instagram từ `@huangying24_5` (nội dung `Ok2`) xuất hiện khi app ở nền. Mở rộng nhóm thông báo Android rồi bấm thông báo con đã mở đúng hội thoại và đánh dấu tin `Ok2`. Bấm phần tóm tắt của nhóm có thể mở trang Tổng quan; đó không phải thao tác mở thông báo riêng. Bằng chứng và báo cáo máy ảo lưu trong `releases/android/qa-1.0.2` (không đưa dữ liệu người dùng lên Git). Chưa kiểm thử trực tiếp trên Fold 7 vật lý.
