# evondevKit — cài đặt, phạm vi thiết kế và khôi phục

Trạng thái ngày 20/10/2026: theo phản hồi mới nhất, **toàn bộ phần Phác đồ đã trở về giao diện gốc** (quản lý, tạo/sửa, preview và trang học viên). Ứng dụng chính giữ giao diện mới; các bản sao lưu bên dưới vẫn được giữ.

## Khôi phục giao diện Phác đồ theo yêu cầu

- Gỡ toàn bộ import/token/font, đổi màu, bóng, bo góc và kiểu input của workspace khỏi `plan-design.css`. Các ứng dụng Phác đồ tiếp tục dùng chính các asset gốc trước redesign; không hoàn nguyên mã nghiệp vụ hay dữ liệu.
- Khôi phục font Plus Jakarta Sans của trang quản lý; helper build không còn loại bỏ font gốc. Các script build tiếp tục giữ tách biệt giao diện Phác đồ với workspace.
- Số lượng/giá trở lại input dạng dòng, không bị padding/chiều cao/viền hộp chung cắt nội dung. Đã thử nhập số lượng 2 và giá 2.300.000, xác nhận tổng đổi đúng, trả lại giá trị ban đầu và không lưu.
- Khối sidebar biên tập và lịch trình 30 ngày trở lại style gốc; preview và trang học viên không còn các quy tắc đổi nền/chữ của workspace.
- Chỉ giữ một chỉnh sửa đáp ứng: hai trường từ/đến ngày trên điện thoại ở chung một hàng. Đã đối chiếu ảnh 390px và kiểm tra tự động vị trí hai input.
- 45 lượt route/kích thước và kiểm tra khối thống kê gốc đạt. Không sửa DB, gửi thông báo hay thay đơn/sản phẩm của học viên.

## Bản dựng

- `public/workspace-design.css`: token màu, font Inter tự lưu, focus, điều khiển, bảng, popup, menu, lịch, chat, bình luận, thư viện và cài đặt. Giữ nhận diện xanh MeGa Phương và màu nghiệp vụ trạng thái.
- Tổng quan đưa số liệu vận hành lên đầu, thao tác tạo đơn/bài viết và lịch ba ngày. Sidebar và thanh đầu trang gọn hơn.
- Đơn hàng giữ bảng kéo độ rộng cột trên PC, ghim mã đơn khi cuộn; trên màn hình nhỏ chuyển sang thẻ có nhãn từng trường. Không thay đổi API chuyển trạng thái hay xử lý vận chuyển.
- `public/plan-design.css` áp dụng cùng token, font và điều khiển cho Phác đồ quản lý/biên tập/xem trước. Các script build Phác đồ tự gắn lại stylesheet sau mỗi lần build.
- Không đổi DB/schema, tài khoản, quyền, webhook hay cấu hình gửi tin/đơn hàng.

## Xác minh

### Điều chỉnh sau phản hồi về tương phản — 20/10/2026

- Sửa nguyên nhân mất nền: các khối gradient có chữ trắng trong Phác đồ được gán nền xanh đặc tương ứng, bao gồm Ăn nhai cân bằng và Thông tin nhanh; không còn bỏ nền trong khi giữ chữ trắng. Nút phụ/khóa và chữ mờ trong khối tối có cặp màu rõ ràng.
- Từng thẻ học viên có nền trắng, viền và bóng hai lớp riêng theo yêu cầu nổi 3D. Bộ lọc ngày theo nhóm trạng thái và hàng tìm kiếm/ngày chu kỳ bỏ viền ngoài, giữ dấu focus bàn phím.
- Tổng quan thu gọn số liệu vận hành và học viên, giữ đủ chỉ số và liên kết; bỏ nút Tạo đơn, Tạo bài viết và tìm kiếm trên trang này. Nội dung PC bỏ tìm kiếm lặp bên dưới; mobile giữ ô tìm kiếm vì thanh tìm kiếm toàn hệ thống không hiển thị trên màn nhỏ.
- Rà màu trên 15 route, đo bổ sung Phác đồ quản lý/thống kê và xem trước thực tế. Chỉnh màu nhãn chat, thời gian, tag, trạng thái kết nối, cảnh báo, tồn kho thấp, nhãn lịch và báo cáo. Không thay dữ liệu/màu tag khách đã cấu hình; chỉ sửa cách ghép màu chữ theo nền.
- Probe có một số cảnh báo không áp dụng: bóng/nâng thẻ là yêu cầu trực tiếp; chuỗi ngày trong tên học viên không phải số thập phân; icon Zalo tròn được probe lấy nhầm nền avatar bên ngoài (computed style thực là chữ trắng trên #146bc3). Luật hover cũ của nút còn trong CSS nguồn nhưng computed transform đã được ghi đè `none`.
- Các lỗi tài nguyên Google/CSP của ứng dụng nhúng có sẵn được ghi nhận trong báo cáo probe, không đổi quyền hay CSP để xử lý giao diện.
- Bổ sung kiểm tra tự động: dashboard không còn điều khiển đã bỏ; không lặp tìm kiếm desktop; thẻ học viên có bóng; bộ lọc ngày không còn viền ngoài; Thông tin nhanh có chữ trắng/nền #28644c.

- Build frontend và `npm run check`: đạt; bundle khớp nguồn.
- 15 route × 390/768/1440px: 45/45 có nội dung, stylesheet chung, không tràn ngang toàn trang và không có lỗi JavaScript. Script: `scripts/test-workspace-design.mjs`, chỉ đăng nhập dữ liệu thử localhost từ biến môi trường.
- 27 kiểm thử mô hình đơn hàng, lịch, tổng quan, bộ lọc/đếm chưa đọc chat và nhóm nội dung: đạt.
- 18 kiểm thử HTTP/chăm sóc học viên/nén dữ liệu/OAuth: đạt khi chạy ngoài sandbox và không chiếm cổng thử. Lần chạy rộng ban đầu bị giới hạn khởi tạo server và xung đột cổng 4493 với bản xem trước; đã dừng và chạy lại các bài lỗi riêng. Không kết luận toàn bộ suite đã đạt.
- Probe evondevKit tại 375/768/1280/1920px cho dashboard, 375/768/1280px cho đơn hàng: không còn mục mức “Hỏng”. Đã sửa tương phản, vùng bấm, wrap, viền và các lỗi tràn thực tế. Bộ lọc trạng thái ngang có dấu mờ mép; bảng PC vẫn cuộn ngang theo cấu hình cột người dùng.
- Đã xem trực tiếp chat/bình luận, chi tiết trả lời, Phác đồ và bộ biên tập; kiểm tra nhập tiêu đề/nội dung trên mobile, đóng mà không đăng. Không gửi tin hay tạo đơn thật để thử giao diện.
- Font Inter: @fontsource-variable/inter 5.3.0, giấy phép và nguồn được lưu cùng tệp font.

## Cài đặt

- Nguồn: https://github.com/evondev/evondevKit
- Phiên bản cố định: `eb4eb45d38fc43412cd25ae41d25709cfca57900`.
- Kỹ năng: `.agents/skills/ui-ux/SKILL.md`; 51 tệp nguồn đã được đối chiếu checksum với bản tải bằng trình cài kỹ năng Codex.
- `UPSTREAM.json` ghi phiên bản và checksum; `LICENSE` giữ giấy phép MIT.
- Dùng từ lượt tiếp theo: `$ui-ux` cùng yêu cầu sửa giao diện trong dự án này. Không cần cài npm package hoặc đổi framework để sử dụng.
- Tài liệu kỹ năng nằm ở phía phát triển; không được thêm làm script chạy trong trình duyệt hoặc xử lý dữ liệu khách hàng.

## Audit

- Ứng dụng chính: JavaScript module, HTML template, CSS riêng, esbuild; server Node.js và SQLite. Không có Tailwind, shadcn hoặc MUI trong ứng dụng chính.
- Có sẵn `btn`, `field`, `avatar`, `empty`, modal trong `public/app.js`; icon dùng `public/icons.js`. Có các bộ điều khiển riêng cho chat, bình luận, bảng đơn và popup.
- Token chính ở `public/style.css`: nền sáng, panel trắng, xanh lá `--green`, chữ `--text`, đường phân cách `--line`. CSS hiện có kết hợp bóng, blur và gradient; không có dark mode chung.
- Phác đồ có các ứng dụng/build riêng trong `public/plan-ui`, `public/plan-editor`, `public/plan-preview`, với nguồn build ở `integrations/taophacdoT4`. Cần thống nhất token và control giữa các phần này, không chỉ đổi CSS của vỏ ứng dụng.
- Ngôn ngữ hiện tại: tiếng Việt. PC và điện thoại đều nằm trong phạm vi.

## U1 — Brief đề xuất

1. **Sản phẩm:** MeGa Phương — quản lý nội dung đa nền tảng, hội thoại, bán hàng và hành trình học viên. Nguồn: README, route và yêu cầu trước đây.
2. **Người dùng:** chủ hệ thống, quản lý, nhân viên nội dung/chăm sóc/kho; học viên xem nội dung phác đồ được cấp quyền. Nguồn: role và màn hình hiện có.
3. **Ba việc chính:** đăng/lên lịch nội dung; trả lời và chăm sóc khách; tạo/xử lý đơn, vận chuyển và quản lý phác đồ. Nguồn: code và yêu cầu người dùng.
4. **Thiết bị:** PC cho bảng dữ liệu và thao tác nhiều; điện thoại cho hội thoại, nhắc hẹn và xử lý nhanh. Nguồn: người dùng đã yêu cầu cả hai; cách ưu tiên thao tác là đề xuất thiết kế.
5. **Điểm xuyên suốt:** bình luận/tin nhắn → hồ sơ khách → đơn/thanh toán/vận chuyển → học viên/phác đồ trong một hệ thống. Nguồn: luồng nghiệp vụ hiện có.

Phạm vi người dùng đã chọn: **thiết kế lại toàn bộ giao diện**. Đề xuất giữ tên/logo và màu xanh lá nhận diện, thiết kế lại bố cục và control; không suy diễn yêu cầu đổi tên sản phẩm hoặc viết lại nghiệp vụ. Dùng nền sáng, chữ dễ đọc, một hệ nút/ô nhập/tag/modal thống nhất. Chưa bổ sung dark mode trong đợt này.

## U2 — Việc chính của từng màn

| Màn/nhóm màn | Đến để làm gì | Thông tin để quyết định | Hành động cuối | Quy ước bố cục đề xuất |
| --- | --- | --- | --- | --- |
| Tổng quan và các danh sách từ chỉ số | Biết việc cần làm ngay | Chưa đọc, chưa trả lời, việc quá hạn, lỗi đăng, đơn cần xử lý, lịch N−1/N/N+1 | Mở đúng việc/hội thoại | Ưu tiên việc cần xử lý; số liệu có đường dẫn; lịch ba ngày rõ trạng thái |
| Nội dung, Sao chép, biên tập và kết quả đăng | Soạn, reup và đăng đúng kênh | Kênh, nội dung/media, lịch, lỗi và cảnh báo | Lưu, đăng hoặc lên lịch | Thanh lọc cố định, danh sách gọn; biên tập và xem trước; cảnh báo không lặp |
| Lịch | Xem lịch đăng và nhắc hẹn | Loại lịch, giờ, người được gán, quá hạn/đã hoàn thành | Mở hoặc sửa lịch, vào hội thoại | Lịch có nhãn loại và màu trạng thái riêng; dùng được trên màn hẹp |
| Thư viện | Tìm, xem và chọn media | Thumbnail, loại, tên, kích thước | Chọn hoặc tải tệp | Tìm/lọc cùng hàng; lưới có trạng thái tải/rỗng/lỗi |
| Yêu cầu xử lý | Xử lý việc được giao | Mức chờ, người phụ trách, khách, thời hạn | Nhận và xử lý yêu cầu | Danh sách ưu tiên quá hạn, chi tiết theo ngữ cảnh |
| Chiến dịch và truyền thông | Theo dõi kế hoạch và nội dung gửi | Tiến độ, phạm vi kênh/khách, lịch, kết quả | Mở, chỉnh hoặc chạy kế hoạch | Tách kế hoạch và kết quả rõ ràng; hành động chính theo trạng thái |
| Bình luận | Tìm bình luận cần trả lời | Chưa đọc/đang chờ, kênh, tag, bài nguồn, lịch sử | Trả lời, gán tag hoặc mở chat riêng | Danh sách–chi tiết trên PC; từng màn trên mobile; ô soạn không bị che |
| Chat và công cụ chăm sóc | Trả lời nhanh, theo dõi khách | Tin mới, người/kênh, tag, nhắc hẹn, sản phẩm/đơn liên quan | Gửi tin, tạo nhắc hoặc đơn | Bộ lọc giữ vị trí; danh sách giữ cuộn; nội dung nhập không mất khi cập nhật |
| Khách hàng, hồ sơ và hành trình | Xem tình trạng học viên/khách | Thông tin liên hệ, đơn, thanh toán, giai đoạn, lịch sử | Cập nhật hồ sơ hoặc chuyển bước | Phần tóm tắt cố định, chi tiết theo nhóm; hành động có ngữ cảnh |
| QL Phác đồ, học viên, trình biên tập và trang xem | Tạo, quản lý và xem phác đồ | Học viên, thời hạn, tiến trình, video, sản phẩm, bảo mật | Lưu, cấp/xem phác đồ | Đồng nhất shell và control; giữ chức năng của các ứng dụng nhúng |
| Sản phẩm và các bộ chọn sản phẩm | Chọn đúng hàng, giá và tồn | Tên/SKU, loại hàng, giá, có thể bán | Sửa sản phẩm hoặc thêm vào đơn/phác đồ | Một danh mục thống nhất; tìm/lọc nhanh; số liệu giá/tồn dễ so sánh |
| Đơn hàng, tạo đơn nhanh và chi tiết | Tạo, theo dõi và xử lý đơn | Khách, sản phẩm, đã thanh toán, trạng thái POS, mã vận đơn, lỗi | Lưu, xác nhận, cập nhật đơn | Bảng là trọng tâm; lọc cố định; giữ chỉnh cột, đổi trạng thái và chọn địa chỉ đã có |
| Vận chuyển | Theo dõi và đối soát giao hàng | Hãng, tracking, COD/cước, lịch sử, kết quả đồng bộ | Xử lý vận đơn hoặc đối soát | Trạng thái dễ quét, lịch sử có thứ tự, hành động không lẫn với thanh toán |
| Tự động hóa và Chatbot AI | Quản lý quy tắc đang chạy | Điều kiện, phạm vi kênh, trạng thái, lỗi | Chỉnh hoặc bật/tắt quy tắc | Phân biệt cấu hình và kết quả; trạng thái đang lưu/thất bại rõ ràng |
| Báo cáo | Đọc số liệu đúng kỳ | Khoảng ngày, nguồn số liệu, nhóm so sánh | Lọc, xem chi tiết hoặc xuất | Bộ lọc chung ở đầu; nhãn số liệu và đơn vị rõ |
| Cài đặt, tài khoản, thành viên và phân quyền | Cấu hình hệ thống | Kênh/POS/hãng, quyền, thiết bị thông báo, kết nối lỗi | Lưu hoặc kiểm tra cấu hình | Nhóm cài đặt có tên rõ; lỗi nằm gần kết nối tương ứng |
| Đăng nhập/thiết lập, điều hướng, thông báo và mọi modal | Vào hệ thống và hoàn tất tác vụ phụ | Trạng thái phiên, trường bắt buộc, tác vụ đang thực hiện | Đăng nhập, lưu, đóng hoặc mở đúng mục | Cùng bộ control; bàn phím và điện thoại thao tác được; không che nút gửi/lưu |

Đối chiếu quy ước: [Pancake — bộ lọc hội thoại](https://pancake-crm.gitbook.io/pancakecrm/ii.-pancake/2.4.-quan-ly-binh-luan-tin-nhan/2.4.2.-bo-loc-hoi-thoai) và [Hootsuite — lịch nội dung](https://help.hootsuite.com/s/article/create-and-schedule). Đây là tài liệu tham khảo bố cục/tác vụ, không phải phụ thuộc mới của ứng dụng.

## Cách triển khai sau khi duyệt thiết kế

1. Duyệt brief U1/U2 và các giả định về thương hiệu/phạm vi.
2. Vẽ 2–3 hướng bố cục khác nhau, có PC/mobile và trạng thái dữ liệu, tải, rỗng, lỗi. Chọn hướng chung trước khi thay giao diện production.
3. Chuẩn hóa token và thành phần dùng chung, sau đó áp dụng lần lượt vào toàn bộ nhóm màn ở bảng trên.
4. Đối chiếu trước/sau; kiểm thử kích thước 375–1920px, bàn phím, cuộn, modal và các luồng quan trọng đã có. Không thay handler thật bằng handler mẫu của kỹ năng.
5. Build, kiểm thử, rồi triển khai từng phiên bản có commit để có thể quay lại.

## Bản sao lưu trước khi cài

Mốc mã nguồn: `73b96518db52cb7c0c0600adf6487882728b737c`.

### Máy Windows

`D:\QLDaKenh-Backups\pre-evondevkit-20261020-164357`

- `workspace.tar.gz`: 5.411 tệp của mã nguồn, cấu hình, Git và dữ liệu thực của workspace; giữ cả thay đổi chưa commit có trong thời điểm sao lưu.
- `hub.sqlite`: bản SQLite nhất quán tạo bằng backup API, kiểm tra integrity trả `ok`.
- `manifest.json`: từng đường dẫn, kích thước, SHA-256 và checksum cả archive. Đã đọc kiểm tra từng tệp trong archive; đã đối chiếu checksum lại sau khi chuyển sang ổ D.
- Không đóng gói các thư mục `node_modules`, `test-data`, `test-results`, `local-backups`, `outputs`, `__pycache__`. Các thư mục thử nghiệm/bản sao lưu cũ không bị sửa hoặc xóa; dependencies có thể cài lại theo lockfile.

### Máy chủ đang chạy

`/root/qlda-backups/pre-evondevkit-20261020T094534Z`

- `workspace.tar.gz`: mã nguồn, Git, cấu hình và tệp dữ liệu của máy chủ. Không đóng gói dependencies, tệp SQLite đang mở, dữ liệu kiểm thử, outputs, log và lịch sử backup cũ.
- `hub.sqlite`: snapshot DB dùng Node SQLite backup API, integrity `ok`.
- `SHA256SUMS`: archive và DB đều đã kiểm tra `OK`; archive đã đọc kiểm tra danh sách thành công.
- `source-commit.txt` và `database-check.json`: mốc mã nguồn và kết quả kiểm tra.
- Thư mục được tạo với quyền riêng cho tài khoản quản trị. Bản backup không đưa vào Git hoặc thư mục web công khai.

## Khôi phục khi cần

**Quay lại giao diện cũ — ưu tiên:** dùng mốc `73b9651` để phục hồi các tệp giao diện/build và cấu hình phụ thuộc liên quan, kiểm tra build rồi triển khai lại. Giữ DB, uploads và các đơn/tin nhắn phát sinh sau thời điểm backup. Khi thực hiện, lưu tiếp một bản của phiên bản đang chạy trước khi chuyển.

**Khôi phục toàn bộ:** kiểm tra SHA-256; giải nén archive vào một thư mục trống khác; phục hồi `hub.sqlite` snapshot vào `data/hub.sqlite`; giữ cặp DB và `data/encryption.key` từ cùng bản sao lưu; cài lại dependencies theo lockfile. Kiểm tra integrity và mở thử ở cổng riêng với worker/kết nối gửi thật được vô hiệu hóa. Sau khi kiểm chứng, mới dừng dịch vụ hiện tại, chuyển sang bản phục hồi và kiểm tra health/đăng nhập/tệp tải lên. Không chạy đồng thời hai worker thật từ DB gốc và DB phục hồi.

Chỉ phục hồi DB khi thực sự cần quay lại dữ liệu cũ: việc này đưa dữ liệu nội bộ về mốc backup; không tự đảo ngược đơn, tin nhắn hoặc vận đơn đã phát sinh trên các nền tảng bên ngoài. Thực hiện đối soát trước khi bật lại tác vụ gửi/đồng bộ.

**Gỡ riêng kỹ năng:** xóa đúng `.agents/skills/ui-ux` khi được yêu cầu. Không cần đổi mã nguồn chạy của ứng dụng để gỡ bộ hướng dẫn này.
