# Thống kê tính sẵn trên máy chủ

## Thiết kế

Dữ liệu vận hành chính của hệ thống nằm ở SQLite trên VPS. Bảng dashboard_aggregates được tạo tự động khi backend khởi động; không cần tạo bảng hoặc sửa schema Supabase cho bản này.

- learners:v1: số liệu học viên/chu kỳ/lợi nhuận, lấy nguồn Supabase qua lớp xác thực server có sẵn, và danh mục sản phẩm chung của hệ thống. Worker kiểm tra mỗi 15 giây, chỉ tính lại sau ít nhất 60 giây. Đọc đủ các trang mới thay kết quả; lỗi không ghi đè bằng 0 hoặc tổng một phần.
- dashboard-counts:<user-id>:<role>: chỉ lưu số đếm vận hành và các tổng số Báo cáo. Worker kiểm tra mỗi 10 giây; dữ liệu hoặc quyền đổi sẽ tính lại, thời gian chuyển ngày/chu kỳ được kiểm tra lại tối đa 60 giây. Dùng các hàm giới hạn kênh/CSKH hiện có trước khi tính.
- GET /api/overview/learners chỉ đọc bảng, dành cho owner/manager. Chưa có kết quả trả 503 thay vì số 0 giả. Kết quả cũ báo stale/refreshFailed và giao diện hiển thị thời điểm cập nhật.
- /api/state chỉ gắn các tổng đã lưu nếu revision dữ liệu/quyền còn khớp, không cũ quá 120 giây. Không trả tổng từ phạm vi quyền cũ. Khi thiếu tổng hợp có thể dùng đường tính trực tiếp tương thích.
- Không lưu tên, số điện thoại, nội dung tin nhắn, token hoặc hồ sơ khách hàng vào bảng tổng hợp.
- Tiến trình nền khởi chạy ngay khi server chạy, không phụ thuộc việc có người mở app. Bảng và kết quả tồn tại qua lần khởi động lại.

Khối learner vẫn hỗ trợ backend cũ chỉ khi endpoint mới trả 404 trong lúc rollout. Khi backend mới hoạt động, trình duyệt gửi một yêu cầu nhỏ để lấy kết quả tổng hợp, không tải các trang khách hàng về để đếm. Bản này không giảm toàn bộ payload /api/state; danh sách chi tiết vẫn được tải theo luồng hiện có. Các truy vấn thống kê/lịch trên trình duyệt còn cần dùng khi mở chi tiết cũng đã bỏ vòng lặp bậc hai.

## Schema SQLite (backend tự chạy, không dán vào Supabase SQL Editor)

```sql
CREATE TABLE IF NOT EXISTS dashboard_aggregates (
  aggregate_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  computed_at INTEGER NOT NULL,
  source_revision TEXT NOT NULL,
  last_error TEXT,
  last_attempt_at INTEGER NOT NULL
);
```

## Triển khai

Vercel chỉ cập nhật public, không chạy worker và không tạo bảng SQLite trên VPS. Sau khi main được cập nhật, cần backend trên VPS chạy cùng commit:

```sh
cd /root/QLDaKenh
git pull --ff-only origin main
npm run check
pm2 restart qlda-kenh
```

Giữ nguyên DATA_DIR và hub.sqlite hiện tại; không xóa hoặc thay dữ liệu. Sau restart, chờ worker hoàn tất lượt đầu, kiểm tra endpoint có đăng nhập /api/overview/learners trả stats, updatedAt, stale và /api/state có dashboardCounts/operationalReportTotals. Nếu nguồn lỗi, kiểm tra nhật ký worker và quyền của tài khoản Supabase đã cấu hình; không mở RLS hoặc dùng anon để xem số liệu riêng.

Để kiểm tra số liệu đã được tính nền trên VPS:

```sh
node --input-type=module -e "const {db}=await import('./server/store.mjs');console.log(db.prepare('SELECT aggregate_key,computed_at,last_attempt_at,last_error FROM dashboard_aggregates').all());db.close();"
```

Không lấy benchmark cục bộ làm cam kết thời gian tải trên mạng di động.

## Kiểm chứng

- node --test tests/overview-cache.test.mjs tests/dashboard-aggregate.test.mjs tests/dashboard.test.mjs tests/dashboard-overview.test.mjs tests/report-model.test.mjs
- node scripts/benchmark-overview.mjs [baseline-commit] — cùng fixture 5.000 bài, so kết quả cũ/mới phải giống nhau; đo riêng đọc bảng và tính lại 5.000 học viên.
- node scripts/benchmark-pages.mjs — server QA riêng, không có dữ liệu thật, 15 route trên PC và Fold; kiểm tra endpoint owner/nhân viên, số liệu từ bảng, lỗi JS và tràn ngang.

Báo cáo JSON lưu trong test-results/overview-performance (không đưa cookie hoặc dữ liệu thật lên Git).


## Compact dashboard response (2026-10-23)

`/api/state?view=dashboard` now takes a dedicated early return. It reads the numeric aggregate and the materialized learner result, four recent content summaries, and publishing/reminder events for yesterday through tomorrow. It does not construct shipping/POS, bot, media-usage or full chat snapshots. Private details are not persisted in an additional cache; existing short-lived authorized state caching still applies. Calendar range/content lookup indexes are created in SQLite at startup; no Supabase migration is needed.

Dashboard navigation loads full authorized workspace data before opening a content editor; other routes show a loading state until their snapshot is ready. Chat notification badges retain the background aggregate unread count. Numeric aggregates refresh at most once per minute for ordinary data writes; permission/care-scope changes invalidate restricted-user results and trigger a refresh. Missing aggregates display a pending state rather than false zero counts. Administrators can continue seeing the last successful numeric result while it refreshes.

The authenticated first state response is sufficient to open the workspace: it no longer waits for a second bootstrap request. Learner numbers render independently from slow system-health metrics. Request errors retain HTTP status for backward-compatible 404 handling.

Validation: `node scripts/test-dashboard-light.mjs` seeds 5,000 historical content/publication pairs and 500 customers in an isolated database. One local run measured a 11,287,830-byte workspace response versus a 7,664-byte dashboard response (183 ms versus 20 ms). Fresh browser pages at phone/Fold/landscape/desktop sizes became usable in 166–309 ms. These are local QA results, not production WAN timings. Tests delay system metrics and verify that no workspace/bootstrap/Supabase source request blocks the dashboard, and that editing retrieves the complete caption first.
