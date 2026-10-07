# Hợp nhất luồng Social & Care với taophacdoT4 — giai đoạn 1

## Kết quả chạy được

Truy cập **http://localhost:4317/#phacdo**. Hệ thống hiện dùng chung một workspace cho:

**Bình luận / chat → tạo đơn → nhân viên xác nhận đã nhận đủ tiền → hồ sơ bàn giao → PlanEditor của taophacdo → lưu phác đồ → cập nhật hành trình và hội thoại.**

Không chỉ là liên kết mở trang khác: trình `PlanEditor.tsx` trong repo được build và chạy bên trong ứng dụng localhost, sử dụng phiên đăng nhập đang có. Các file giao diện/chức năng từ repo được tái sử dụng; lớp dữ liệu được thay bằng adapter localhost. Bản xem sau lưu cũng ở cùng workspace.

Theo yêu cầu “hoàn thiện CSDL ở bước sau”, giai đoạn này **lưu tại SQLite localhost**. Không chạy SQL, không POST dữ liệu lên Supabase production và không deploy thay đổi lên Vercel. Trang taophacdo đang chạy chưa tự nhận những thay đổi này. Nút mở trang taophacdo gốc là liên kết tham khảo, không phải bằng chứng đồng bộ production.

## Cách chạy quy trình

1. Trong chat, chọn **Tạo đơn**, thêm khóa học/dịch vụ/sản phẩm và lưu đơn.
2. Mở **Đơn hàng**, xác nhận đơn. Quản lý đối chiếu giao dịch thực tế rồi bấm **Ghi nhận tiền**, nhập số tiền và tham chiếu. Ứng dụng không tự suy đoán khách đã chuyển tiền từ câu chat hoặc ảnh gửi.
3. Khi đã thu đủ, hệ thống tự tạo một hồ sơ bàn giao duy nhất gắn với đơn. Có nút **Tạo / mở phác đồ** trong chi tiết đơn và mục **Tạo & quản lý phác đồ** ở menu. Hồ sơ khách trong chat cũng có nút **Tạo / xem phác đồ**.
4. Mở phác đồ: tự nhận tên, điện thoại, email, địa chỉ, sản phẩm/khóa học đã mua, số tiền đơn, mã học viên. Chọn ngày bắt đầu, thời hạn và nhóm video mẫu, hoặc chỉnh sửa bài tập riêng bằng trình taophacdo.
5. Nếu chưa có nhóm mẫu, nhập `master_video_tasks` tại **Tích hợp taophacdo**; hoặc tạo các bài riêng trong editor. Không có nội dung phác đồ chuyên môn giả được tự sinh làm dữ liệu thực.
6. Bấm **Lưu**: lưu phiên bản phác đồ, cập nhật thông tin liên hệ trong CRM, ngày học ở hành trình, ghi một note nội bộ vào hội thoại và mở bản xem. Không tự gửi nội dung riêng của học viên ra kênh chat.
7. Có thể quay lại chỉnh sửa hoặc xuất JSON hồ sơ bàn giao. JSON mang schema `taophacdo.social-handoff.v1`, giữ tên trường khách/phác đồ của hệ thống gốc. Đây là file bàn giao cho adapter bước 2, **không phải file có sẵn nút import tương ứng trên site production**.
8. Nếu hoàn tiền khiến đơn chưa thu đủ, hồ sơ chuyển **Cần kiểm tra thanh toán**; API chặn mở/lưu/xuất đến khi được đối soát thu đủ trở lại. Phác đồ không bị xóa.

Khách đã có `customer_id` từ taophacdo giữ nguyên mã. Khách local mới nhận một mã ổn định `C-HUB-...`, dùng thống nhất ở hồ sơ, phác đồ và payment payload. Không tự ghép khách chỉ dựa trên số điện thoại.

## Những gì kiểm tra được từ mã nguồn

Repo: [anhvh6/taophacdoT4](https://github.com/anhvh6/taophacdoT4), nhánh `main`, commit được kiểm tra và cố định:

`6190d99c2d4be9e40f1a19c53f1441d872e52bd2`

| Nguồn | Kết quả kiểm tra / cách tận dụng |
|---|---|
| `App.tsx` | App React có `#/plan-editor`, nhận `draftCustomer`, gọi `handleUpsertCustomer`; có Supabase Auth/RBAC riêng |
| `pages/PlanEditor.tsx` | Editor đầy đủ nhóm mẫu, bài riêng, thông tin học viên, thời hạn, sidebar blocks, sản phẩm; tái sử dụng chính component này |
| `services/api.ts` | Có `getPlanEditorData`, `getPlan`; adapter mới cung cấp cùng contract cho editor |
| `src/services/customerService.ts` | Upsert theo `customer_id`, giữ/generate token, merge dữ liệu khách và raw_backup, tính end_date, sau đó lưu tasks |
| `src/services/customPlanService.ts` | Truy vấn tasks theo customer_id; luồng học viên dùng RPC có token, không đưa vào adapter local |
| `types.ts` | Tên trường khớp phần lớn tài liệu Supabase: customer_name, sdt, dia_chi, san_pham, video_date, ma_vd… |

Các điểm cần lưu ý khi thực hiện bước CSDL:

- `customerService` có xử lý `is_deposit`, `deposit_amount`, `is_consultation` như cột ở cấp gốc, trong khi tài liệu đưa chúng trong `raw_backup`. Phải kiểm tra schema thật trước khi mở ghi; chưa kết luận schema production giống phiên bản nào.
- Code gốc lưu khách và custom tasks qua các lệnh riêng; bước 2 cần giao dịch/idempotency để không tạo khách xong nhưng tasks lưu thất bại.
- Editor gốc chỉ chỉnh nhóm bài trong 30 ngày đầu. Adapter local giữ các bài sau ngày 30 đã có trong bản phác đồ lưu; không kéo dài editor gốc bằng thay đổi tự suy đoán chuyên môn.
- Source editor gốc có cache khách ở localStorage và log payload. Bản build tích hợp bỏ đọc/ghi cache phác đồ và bỏ console output của bundle để không lưu ghi chú học viên ra cache/debug console. Phác đồ được tải qua API có scope.
- Cách nhận diện phác đồ riêng trong build được điều chỉnh theo `is_customized`, phù hợp tài liệu; không tự đổi sang phác đồ riêng chỉ vì có một mảng tasks.
- Không sử dụng file `.env` từ repo để chạy app tích hợp. Cấu hình build đặt `envDir:false`; không bundle Supabase/Gemini credentials và không khởi chạy server production trong repo.
- Chưa xác minh commit này đang được deploy trên `taophacdo.vercel.app`; metadata repo khai báo một homepage khác (`taophacdot4.vercel.app`). Bản tích hợp được kiểm chứng theo commit GitHub nêu trên.

## Kiến trúc kết nối hiện tại

```text
Đơn hàng + ghi nhận tiền (domain.mjs)
    ↓ syncPlanHandoff()
plan_handoffs: orderId ↔ customerId ↔ canonicalId
    ↓ API có session, CSRF, scope, kiểm tra tiền tại mỗi thao tác
/plan-editor/ → PlanEditor gốc + localServices adapter (từ chat)
/plan-ui/ → trang quản lý phác đồ tổng thể
    ↓ Lưu với version, giá/mã khách do server kiểm soát
study_plans + CRM + journeys + note hội thoại (một transaction)
```

`plan_handoffs` và `study_plans` là loại bản ghi trong kho SQLite hiện tại; **không phải bảng mới đã tạo trên Supabase**. `study_plans` không được đưa vào `/api/state` tổng quát. Nội dung phác đồ riêng chỉ đi qua API có quyền xem đúng khách. Nhật ký audit ghi ID/phiên bản, không ghi toàn bộ ghi chú.

API mới:

- POST `/api/plans/prepare`: nhận `orderId`, kiểm tra tiền và trả hồ sơ duy nhất.
- GET `/api/plans/:handoffId/editor`: hồ sơ canonical, danh mục, nhóm mẫu, phiên bản và chứng cứ xác nhận thu ở local.
- GET `/api/plans/:handoffId/master?date=...&group=...`: bài mẫu đã nhập.
- POST `/api/plans/:handoffId/save`: `{customer,tasks,version}`; kiểm tra ID, giá trị đơn, dates, link, scope và version trước khi lưu.
- GET `/api/plans/:handoffId/preview`: bản xem dành cho nhân viên.
- GET `/api/plans/:handoffId/export`: gói bàn giao JSON không chứa token/link truy cập học viên.

Các file chính:

- `server/plan-bridge.mjs`: điều kiện thanh toán, mapping, lưu và truy vết.
- `public/plans.js`, `public/plans.css`: màn hình hợp nhất và iframe nội bộ.
- `integrations/plan-workspace/*`: wrapper/adapter/config được duy trì trong workspace.
- `integrations/plan-workspace/SOURCE.json`: nguồn và revision.
- `integrations/taophacdoT4/`: checkout upstream đã tải, được ignore để không đưa các env trong repo vào mã bàn giao.
- `public/plan-editor/`: bundle trình soạn từ chat đã build sẵn. `npm start` không cần build lại hay cài React.

## Build lại editor khi phát triển

Yêu cầu Node 24, Git và dependency của repo ở checkout tương ứng.

```powershell
git clone https://github.com/anhvh6/taophacdoT4.git integrations/taophacdoT4
git -C integrations/taophacdoT4 checkout 6190d99c2d4be9e40f1a19c53f1441d872e52bd2
cd integrations/taophacdoT4
npm ci --ignore-scripts --no-audit --no-fund
cd ../..
npm run build:plan
```

Nếu checkout đã có thì bỏ qua clone; không reset một checkout có thay đổi chưa lưu. Script chỉ build khi revision khớp manifest, sao chép adapter vào thư mục `omni` trong checkout, rồi xuất đúng `public/plan-editor`. Không dùng `npm run build` của repo với env production.

## Bước 2 — sau khi thống nhất CSDL

Thay `localServices`/server bridge bằng adapter dùng phiên Supabase Auth của taophacdo và giao dịch lưu khách/tasks. Giữ `customer_id`, token và raw_backup đang có; không thay token hoặc gán quyền thiết bị từ hồ sơ chat. Thêm khóa idempotency theo order/handoff; map payment_orders và paid state; xử lý cập nhật/phác đồ mới/gia hạn theo quy tắc đã xác nhận. Dùng quyền/RLS thật, kiểm thử staging rồi mới deploy. Khi đó mới đánh dấu trạng thái `synced_production` và phát hành link học viên từ hệ thống gốc; hiện tại UI chỉ hiển thị `saved_local`.

## Kiểm thử

- 35 kiểm thử backend đã đạt: bao gồm đơn chưa trả/cọc bị chặn, hồ sơ không nhân đôi, canonical mapping, chỉnh giá/mã khách bị từ chối, optimistic version, preview/export không có token, refund khóa và thu lại mở đúng hồ sơ, staff ngoài phạm vi không đọc được.
- UI PC/mobile: chat → tạo khóa học/đơn → xác nhận thu → mở **PlanEditor gốc** → chọn nhóm → lưu → xem bài đã lưu. Đã kiểm tra không lỗi JavaScript, giao diện outer không tràn ngang và nút lưu sử dụng được trên mobile.
- Không gửi thông tin ra nền tảng xã hội, ngân hàng, đơn vị vận chuyển hoặc Supabase production trong các bài kiểm thử.
# Cập nhật thao tác từ chat

Trong **Chat & chăm sóc → Hồ sơ / Đơn → Thông tin khách**, nút **Tạo phác đồ** mở thẳng PlanEditor ở chế độ tạo mới nếu học viên chưa có phác đồ local. Điền sẵn thông tin khách và đơn; phác đồ đã lưu mở ở chế độ chỉnh sửa để tránh tạo trùng. Nút **Trở lại cuộc trò chuyện** quay về inbox.

Khách chưa xác nhận đủ tiền vẫn mở được biểu mẫu để soạn trước, nhưng chưa lưu/phát hành phác đồ. Bản soạn này chưa lưu trên máy chủ; cần xác nhận đủ tiền ở Đơn hàng rồi mở lại trình tạo phác đồ. Giao diện ghi rõ điều kiện này. API kiểm tra phạm vi khách cả khi mở bản soạn.

## Sửa dữ liệu trình tạo phác đồ từ chat (07/10/2026)
Trình soạn đọc danh mục sản phẩm và bài tập Supabase theo phiên đăng nhập máy chủ, phân trang và cache 60 giây. Nếu nguồn lỗi, hiển thị cảnh báo và bản sao nội bộ. PLAN_REMOTE_CATALOG=0 dùng danh mục nội bộ (cho kiểm thử). Nội dung học viên đã nhập được giữ lại; hồ sơ taophacdo đọc thêm note/chewing/sidebar của đúng customer_id khi chưa có bản lưu workspace. Giá trị mặc định của trình gốc chỉ áp dụng cho phác đồ mới; ưu tiên khóa học, không ghi đè sản phẩm đơn đã có. Master/preview/save dùng cùng nguồn danh mục. Vite adapter chuẩn hóa đường dẫn để tránh hai instance context trên Windows. Liên kết QL Phác đồ reset trình soạn về #phacdo; nút trên portal có CSS tương ứng ở trang cha.
Kiểm thử: node --test tests/plan-bridge.test.mjs và node scripts/test-plan-chat-ui.mjs. Đã đọc thử catalog production (chỉ đọc), không sửa bảng Supabase. Không cần SQL mới.
