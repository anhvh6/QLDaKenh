# Bản sửa Zalo — trạng thái triển khai 03/10/2026

Mã nguồn đã lên `anhvh6/QLDaKenh`, nhánh `main`, commit `7926341275a742e877d18eb9cb78d0a230edadb9`.

## Đã xác minh

- 47 kiểm thử backend đạt; kiểm tra cú pháp đạt.
- Kiểm thử giao diện Zalo ở 1440px và 390px đạt: tin mới qua SSE, giữ bản nháp, giữ hội thoại và không tràn chiều ngang.
- Kiểm thử không gửi tin cho khách thật.
- Kiểm thử giao diện tổng thể còn vướng kỳ vọng tiêu đề PlanEditor, được ghi trong ZALO_PERSONAL.md.

## Chưa triển khai được

GitHub Actions run https://github.com/anhvh6/QLDaKenh/actions/runs/37112275060 dừng ở bước Deploy to VPS: `Error: missing server host`. Máy chủ chưa nhận bản sửa qua workflow này. Chưa xác minh tài khoản Zalo thật tải được danh bạ/lịch sử hoặc nhận tin sau sửa.

## Cách triển khai

Chọn một trong hai cách:

1. Cấu hình GitHub Actions Secrets theo workflow hiện tại: `VPS_HOST` = `36.50.55.233`, `VPS_USERNAME` = tài khoản sở hữu ứng dụng/PM2 trên VPS, `VPS_SSH_KEY` = khóa SSH hợp lệ. Sau đó chạy lại job deploy bị lỗi. Không lưu khóa vào mã nguồn hay gửi trong chat.
2. Trong terminal VPS đã đăng nhập đúng tài khoản vận hành ứng dụng, chạy từng lệnh sau. Dừng nếu một lệnh lỗi; không reset hoặc ghi đè thay đổi riêng trên máy chủ:

```sh
cd ~/QLDaKenh
git status --short
git pull --ff-only origin main
npm ci
npm run check
pm2 restart qlda-kenh
pm2 status qlda-kenh
```

Giữ DATA_DIR, cơ sở dữ liệu và khóa mã hóa hiện có. Không khởi chạy đồng thời phiên local và VPS cho cùng tài khoản Zalo.

Sau triển khai, tải lại trang, vào Cài đặt → kênh Zalo → Đồng bộ. Nếu phiên không còn hợp lệ, quét QR lại. Kiểm tra tiến độ danh bạ/lịch sử và mục Chat & chăm sóc. Cần một tin nhắn đến thật để xác nhận listener trên môi trường vận hành; không tự gửi tin thử cho khách hàng.
