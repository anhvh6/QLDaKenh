# Tài liệu phân tích: Hệ thống kết nối Zalo cá nhân & Cập nhật Real-time

Tài liệu này cung cấp cái nhìn chi tiết về kiến trúc và cách triển khai kết nối Zalo cá nhân thông qua Web API (không phải Zalo Official Account) cùng với cơ chế cập nhật tin nhắn theo thời gian thực (Real-time). Lập trình viên có thể sử dụng tài liệu này như một bản thiết kế (blueprint) để áp dụng vào các dự án/hệ thống khác.

---

## 1. Cơ chế kết nối với Zalo Cá nhân

Hệ thống không sử dụng API chính thức của Zalo OA mà sử dụng kỹ thuật **Reverse Engineering Zalo Web** thông qua thư viện `zca-js` (một bản fork/wrapper để tương tác với Zalo Web).

### 1.1. Luồng đăng nhập bằng mã QR
Thay vì yêu cầu người dùng nhập số điện thoại và mật khẩu (dễ bị chặn và nguy hiểm), hệ thống dùng luồng đăng nhập qua mã QR.

**Các bước hoạt động:**
1. **Khởi tạo Zalo Client:** Server sử dụng `zca-js` để khởi tạo instance của Zalo.
2. **Yêu cầu mã QR:** Server gọi hàm `loginQR()` của `zca-js`. Hàm này sẽ kết nối đến server Zalo và trả về một mã QR (dưới dạng base64 image).
3. **Lắng nghe sự kiện quét mã:** Server lắng nghe các sự kiện qua callback của luồng login:
   - `QRCodeGenerated`: Trả mã QR về cho phía Frontend hiển thị.
   - `QRCodeScanned`: Người dùng đã dùng điện thoại quét mã (trạng thái chờ xác nhận).
   - `GotLoginInfo`: Người dùng đã bấm "Đăng nhập" trên điện thoại.
4. **Lưu trữ phiên đăng nhập (Session):** Khi có sự kiện `GotLoginInfo`, server sẽ trích xuất thông tin định danh bao gồm:
   - `cookie`: Chứa token xác thực thực sự của Zalo Web.
   - `imei`: Định danh thiết bị ảo.
   - `userAgent`: Chuỗi định danh trình duyệt gốc để tránh bị Zalo phát hiện bất thường.
   Các thông tin này được lưu vào cơ sở dữ liệu (Bảng `Account`).

### 1.2. Khôi phục phiên đăng nhập (Resume Session)
Khi server khởi động lại hoặc có yêu cầu gửi tin nhắn mới, hệ thống không cần quét lại mã QR.
- Lấy `cookie`, `imei`, và `userAgent` từ DB.
- Khởi tạo lại `Zalo` instance từ `zca-js`.
- Gọi hàm `login(session_data)` bằng các credential đã lưu để khôi phục trạng thái online.

---

## 2. Cơ chế cập nhật thời gian thực (Real-time)

Hệ thống cần nhận tin nhắn từ Zalo gửi đến ngay lập tức và đẩy xuống Frontend cho người dùng. Quá trình này được chia thành 2 kết nối WebSocket:
1. **Zalo Server <-> Hệ thống Backend** (thông qua Listener của thư viện `zca-js`).
2. **Hệ thống Backend <-> Frontend Client** (thông qua thư viện `Socket.IO`).

### 2.1. Zalo Server -> Backend (Zalo Listener)
Sau khi login thành công (sử dụng cookie), `zca-js` mở một kết nối WebSocket ẩn dưới nền (listener) tới máy chủ Zalo.

- Server gọi `api.listener.start()` để bắt đầu nghe sự kiện.
- Đăng ký các sự kiện trên `api.listener`:
  - `connected`: Kết nối thành công tới Zalo.
  - `message`: Có tin nhắn mới từ Zalo gửi đến (hoặc tin nhắn do chính mình gửi đi từ thiết bị khác).
  - `error`, `disconnected`, `closed`: Xử lý lỗi và tự động kết nối lại.
  
**Xử lý khi có sự kiện `message`:**
Dữ liệu thô (raw data) từ Zalo sẽ được:
1. Parse thành định dạng chuẩn của hệ thống (bóc tách `msgId`, `threadId`, `sender`, nội dung, và `attachments`).
2. Lưu vào bộ nhớ tạm (runtime memory).
3. Đẩy thông báo Push Notification qua FCM nếu người dùng đang offline.

### 2.2. Backend -> Frontend (Socket.IO)
Để đẩy dữ liệu tức thì xuống trình duyệt của người dùng, hệ thống sử dụng **Socket.IO**.

**Cách thức triển khai:**
1. **Xác thực Socket:** Khi Frontend kết nối Socket.IO tới Backend, nó gửi kèm JWT token.
2. **Phân Room theo User:** Backend xác thực JWT, lấy ra `userId` và tự động đưa socket đó vào một Room riêng (VD: `socket.join('user:' + userId)`). Việc chia Room giúp đảm bảo tính Multi-tenant, tin nhắn của user nào chỉ đẩy về đúng user đó.
3. **Phát sự kiện (Emit) tự động:** 
   - Khi Listener của Zalo (ở bước 2.1) nhận được tin nhắn, nó sẽ sử dụng biến toàn cục `global.io` của Socket.IO đã được gán sẵn.
   - Hàm `io.to('user:' + userId).emit('zalo:message:new', payload)` được thực thi.
   - Frontend lắng nghe sự kiện `zalo:message:new` và render tin nhắn mới lên giao diện ngay lập tức mà không cần tải lại trang.

---

## 3. Hướng dẫn xây dựng cho Hệ thống khác (Dành cho Lập trình viên)

Nếu bạn muốn áp dụng giải pháp này cho hệ thống của mình (bằng Python, Go, hoặc Node.js server độc lập), bạn cần xây dựng theo mô hình sau:

### Bước 1: Trình quản lý kết nối Zalo (Zalo Client Worker)
- Sử dụng hoặc build lại một thư viện tương tác Zalo Web API.
- Tạo một module phụ trách luồng tạo mã QR, lắng nghe quá trình quét và bóc tách được `cookie`, `imei`.
- Lưu trữ các credential này an toàn vào Database.

### Bước 2: Thiết lập Bộ thu nhận tin nhắn (Message Listener)
- Vì Zalo dùng WebSocket, mỗi tài khoản Zalo đang hoạt động cần duy trì 1 connection WebSocket dài hạn tới máy chủ Zalo.
- Tạo một cấu trúc dữ liệu trên RAM (VD: `Map<UserId, ZaloListener>`) để quản lý nhiều phiên đăng nhập song song.
- Viết hàm `onMessage(raw_data)` để hứng toàn bộ payload. Chuẩn hoá cấu trúc tin nhắn để hệ thống của bạn dễ xử lý.

### Bước 3: Cầu nối Realtime nội bộ (Backend -> Client)
- Chọn công nghệ phù hợp: WebSocket thuần, Socket.IO, hoặc SignalR.
- Khi Client kết nối tới Web của bạn, yêu cầu truyền Token xác thực.
- Bản đồ hoá (Map) `ConnectionId` của Web với `UserId` trong DB.
- Khi `ZaloListener` có tin nhắn -> Tìm danh sách `ConnectionId` đang online của `UserId` đó -> Tiến hành gọi `Send(Message)`.

### Một số lưu ý quan trọng khi triển khai:
1. **Tính ổn định (Rate Limit & Block):** Cơ chế mã hoá của Zalo thay đổi liên tục và thường xuyên ngắt kết nối WebSocket (văng listener). Bạn bắt buộc phải code logic **Auto Reconnect** khi bắt được sự kiện ngắt kết nối (như hệ thống hiện tại cấu hình `retryOnClose: true`).
2. **Xử lý `cipher_key`:** Hệ thống phải lắng nghe và lấy được `cipher_key` mới nhất từ Zalo thì mới có thể giải mã được nội dung tin nhắn gửi về.
3. **Quản lý tài nguyên:** Mỗi tài khoản Zalo cần 1 listener liên tục trên RAM. Nếu có 10,000 user, bạn phải tối ưu bộ nhớ hoặc ngắt kết nối tạm thời đối với những user lâu không hoạt động.
4. **Kiến trúc Microservices:** Nếu hệ thống của bạn có nhiều server Node.js chạy song song, bạn không thể chỉ lưu Socket connection trên RAM cục bộ. Cần dùng **Redis Pub/Sub** (như Socket.IO Redis Adapter) để đảm bảo dù Web Client kết nối vào Server A nhưng Listener ở Server B bắt được tin nhắn Zalo, Server B vẫn báo được cho Server A để đẩy xuống trình duyệt.
