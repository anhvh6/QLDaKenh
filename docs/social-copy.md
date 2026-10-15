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

Chủ hệ thống mở Cài đặt > Kênh kết nối > Google Drive, nhập OAuth Client ID, Client Secret
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

## Quản lý bài đã tải

Danh sách tải có tìm kiếm nội dung/link, lọc Đang tải, Chưa Reup, ZIP, Google Drive và sắp xếp ngày tải hai chiều. Trạng thái ZIP và Drive được lưu riêng; ZIP nội bộ của một lần tải Drive không được đánh dấu là người dùng đã chọn lưu ZIP. Chuyển một gói ZIP sang Drive tái sử dụng caption và media đã tải trên máy chủ, cập nhật chính dòng cũ. Reup từ dòng đã lưu Drive tạo bản nháp sử dụng media có sẵn; chỉ đánh dấu Reup thành công khi có publication `published` hoặc `manually_confirmed`, không tính đăng mẫu. Xóa dòng là ẩn khỏi danh sách, giữ tệp và bài đã đăng; không cho xóa khi tác vụ đang chạy.

Kết nối dùng scope `drive.file`. Dán ID không tự cấp quyền truy cập thư mục đã tạo ngoài ứng dụng. Trong Cài đặt > Kênh kết nối > Google Drive, dùng **Chọn thư mục từ Google Drive** (Google Picker) để chọn và cấp quyền cho thư mục. Bật Google Picker API trong cùng dự án OAuth; nếu dự án yêu cầu developer key, nhập Google Picker API key ở cấu hình. Hạn chế key cho Google Picker API và website của ứng dụng cùng `https://docs.google.com/*`.

Endpoint POST `/api/drive/picker` yêu cầu phiên đăng nhập, quyền Nội dung và CSRF; chỉ trả access token ngắn hạn của người gọi để mở bộ chọn. Không trả refresh token hay client secret, không lưu token trong trình duyệt. Lưu thư mục kiểm tra lại quyền ghi qua Drive API trước khi thay cấu hình. ID hoặc link `https://drive.google.com/drive/folders/...` đều được hỗ trợ; lỗi 404/403 được phân biệt với lỗi máy chủ.


## Nâng cấp Sao chép tự động (14/10/2026)

Ba tab dùng chung kho bài và luồng xuất bản hiện có:

1. **Thủ công:** link bài riêng → xem trước → ZIP/Drive/Reup, giữ bảng tải hiện có.
2. **Toàn bộ video:** link Reels/Video Facebook hoặc hồ sơ TikTok → lọc ngày đăng gốc → quét nền → chọn một/nhiều/toàn bộ → tải Drive hoặc tạo kế hoạch Reup. Video chưa xác định ngày đăng không được tự xếp lịch. Có thể chỉnh nội dung Reup mà giữ dữ liệu gốc.
3. **Video mới:** theo dõi nguồn có mốc từ ngày giờ, kiểm tra mặc định mỗi 15 phút (5–1440 phút), bổ sung video chưa có vào hàng chờ, ưu tiên video cũ nhất chưa đăng.

Kế hoạch thuộc chiến dịch có sẵn; chọn các kênh đã kết nối và hỗ trợ đăng video, giờ bắt đầu/kết thúc, một hoặc nhiều giờ trong ngày, các ngày trong tuần. Bulk cho chọn cũ/mới trước; video mới luôn cũ trước. Mỗi khung giờ dùng một video cho các kênh đã chọn. Xem trước lịch và cảnh báo nội dung không ghi tác vụ đăng. Kiểm tra lại metadata, quyền kênh và giới hạn nền tảng trước khi chuẩn bị/đăng; không tự cắt nội dung.

Tạo lịch theo cửa sổ 24 giờ sắp tới, tải về Drive từ T−30 phút. Hàng đợi tải giới hạn hai bài đồng thời, tối đa ba lần thử tổng cộng. Giữ thư mục và tệp đã tải thành công khi thử lại. Bỏ qua những kênh đã đăng video đó, kể cả bản sao thủ công cũ xác định được ID nguồn; chặn trùng giữa các kế hoạch. Lỗi một kênh có thể xếp lại riêng phần chưa thành công. Kết quả không xác định phải đối soát, không tự gửi lại. Lỡ giờ quá 60 giây thì dừng, không đăng dồn bù.

Tạm dừng chiến dịch/kế hoạch sẽ hủy các publication chưa gửi và trả bài về hàng chờ. Bật lại sẽ xếp khung giờ tương lai. Không thu hồi cuộc gọi đăng đang chạy. Hủy hoặc hoàn tất không được bật lại; tạo kế hoạch mới nếu cần. Nhân viên bị khóa hoặc mất quyền kênh thì tác vụ dừng. Nguồn đang quét được tiếp tục theo offset sau restart; dữ liệu, lịch và nhật ký lưu bền vững.

Bảng kết quả có tìm kiếm, lọc chiến dịch/kế hoạch/trạng thái/nền tảng (OR), phạm vi 24 giờ hoặc toàn bộ, sắp xếp qua tiêu đề cột, ngày đăng gốc/ngày tải/lịch đăng/nội dung/trạng thái/hành động, icon kết quả từng kênh. Có lịch Sao chép trong Lịch đăng; kế hoạch được đếm ở Chiến dịch. Loại video khỏi kết quả quét sẽ hủy lịch chưa gửi của video trong các kế hoạch; khôi phục nguồn không tự bật lại các lịch đã loại. Tác vụ đang gửi/chờ đối soát không được loại. Bài đã xuất bản được giữ nguyên. Quản lý/xóa thư mục Drive tiếp tục dùng kho Các bài đã tải trong tab Thủ công.

### Nguồn công khai của bên khác

Hai URL mẫu:
- https://www.facebook.com/phuong.tran.53181/reels/
- https://www.tiktok.com/@faceyoga.megaphuong

Từ bản sửa 15/10/2026, nhận cả link trang Facebook gốc (ví dụ `https://www.facebook.com/phuong.tran.53181`) và `/reels/`; hai dạng cùng đọc kho Reels công khai của trang. Facebook đọc payload khởi tạo, xác minh chủ video, tìm truy vấn phân trang trong tài nguyên JavaScript do trang công khai cung cấp rồi đọc nối tiếp bằng cursor. Không cố định mã truy vấn theo một bản Facebook. Đọc toàn bộ JSON/NDJSON, ghép caption và ngày đăng từ các phần dữ liệu bổ sung. Không thực thi JavaScript tải từ nguồn.

TikTok xác minh mã định danh công khai của tác giả qua trang/khung nhúng, sau đó đọc từng trang danh sách video từ creator API bằng bộ tham số của phiên bản yt-dlp đã ghim. Giữ định danh thiết bị công khai nhất quán trong cùng lượt quét, kiểm tra tác giả, ngày đăng và cursor để phát hiện trang bị lặp. Đây là nguồn của người khác, không yêu cầu OAuth của chủ nguồn.

Mỗi lượt xử lý một trang, lưu cursor và metadata phân trang vào `copy_sources`, tiếp tục qua worker cho tới khi nguồn trả dấu kết thúc rõ ràng. Nút **Tiếp tục quét** giữ vị trí sau lỗi; kết quả đã đọc không bị xóa. Lỗi HTTP tạm thời được thử lại có giới hạn; trang rỗng, sai tác giả, lặp cursor hoặc thiếu dấu kết thúc không được ghi quét đầy đủ. Nút quét lại sau khi hoàn thành và mỗi chu kỳ theo dõi mới bắt đầu từ đầu để nhận video mới. Không suy ngày đăng từ ID và không vượt đăng nhập/CAPTCHA.

Nghiệm thu đọc trực tiếp trên VPS ngày 15/10: Facebook đã đọc tới cuối kho Reels sau 35 lượt phân trang, thu được 360 video riêng biệt, đủ ngày đăng; TikTok đọc tới cuối sau 43 trang, thu được 571 video riêng biệt, đủ ngày đăng cho cả 571 video. Số lượng là dữ liệu công khai nền tảng trả trong lần kiểm tra, không bao gồm nội dung bị ẩn/riêng tư/xóa và có thể thay đổi. Khoảng ngày của người dùng vẫn áp dụng khi hiển thị/lập lịch.

### Lưu trữ và khôi phục

Các loại records mới: `copy_sources`, `copy_videos`, `copy_plans`, `copy_plan_items`, `copy_plan_events`. Dùng bảng records SQLite hiện có; không có migration Supabase. API trạng thái kế hoạch chỉ trả dữ liệu của người gọi, token Drive vẫn mã hóa. Sao lưu đầy đủ cần database SQLite, `uploads`, kho `social-copy`, và `encryption.key`; xuất JSON có cả các bản ghi kế hoạch nhưng không thay thế bản sao đầy đủ.

### Kiểm thử có thể chạy lại

- `node --test tests/*.test.mjs`: toàn bộ hồi quy.
- `node --test tests/copy-automation.test.mjs tests/social-source-parser.test.mjs tests/social-copy.test.mjs tests/copy-job-table.test.mjs tests/publish-preflight.test.mjs`: kiểm thử chuyên biệt.
- `node scripts/test-copy-automation-ui.mjs`: Edge headless, dữ liệu và server riêng, không gửi lên kênh thật. Xuất báo cáo JSON và ảnh desktop/mobile tại `test-results/`.

Ma trận gồm: hai dạng URL, GMT+7/ngày biên, nguồn trả một phần/lỗi/dừng/restart, loại video sai chủ/thiếu ngày, chống trùng qua lần quét và kế hoạch, thứ tự cũ/mới, chọn nhiều/hủy chọn, lọc OR/tất cả/không chọn, lịch 24 giờ, T−30, giới hạn ba lần thử, preflight Threads 500 ký tự, pause/resume/cancel, quyền nhân viên, Drive → publication → thành công, lỗi từng kênh và đối soát kết quả chưa rõ. Drive/đăng bài trong test tự động dùng adapter giả lập; không coi đó là bằng chứng đã đăng thật lên các tài khoản kết nối.

Kết quả kiểm thử 14/10/2026: 430/430 kiểm thử hồi quy đạt, kiểm tra cú pháp đạt; 11 nhóm thao tác giao diện Edge headless đạt, không có lỗi JavaScript. Ảnh desktop/mobile và báo cáo JSON nằm trong `test-results/`. Kết quả công khai thực tế như giới hạn nêu trên, chưa thực hiện đăng bài thử lên tài khoản thật.

Bản dự phòng trước triển khai trên VPS: `/root/backups/copy-automation-20261014/` gồm lịch sử code Git, bản sao SQLite bằng backup API, encryption.key, cấu hình và gói tệp dữ liệu. Trước khi hạ về code cũ cần tạm dừng tất cả kế hoạch Sao chép và hủy publication Sao chép chưa gửi, vì worker cũ không hiểu trạng thái kế hoạch mới. Ưu tiên khôi phục code, giữ database hiện tại để không mất tin nhắn mới. Chỉ khôi phục toàn bộ database/tệp từ bản dự phòng khi đã xác nhận chấp nhận quay dữ liệu về thời điểm sao lưu. Bản dự phòng tại máy: `test-results/before-copy-automation-20261014.bundle` và `.patch` (patch giữ cả thay đổi cục bộ trước triển khai).

### Kiểm thử bản sửa phân trang 15/10/2026

434/434 kiểm thử hồi quy đạt; chạy tuần tự với `TEST_API_PORT=4519` vì cổng mặc định 4399 đang có tiến trình kiểm thử cũ. Bộ integration cho phép cấu hình cổng qua biến này. 42 kiểm thử chuyên biệt nguồn/lịch và 11 nhóm giao diện Sao chép đạt; kiểm tra cú pháp JavaScript đạt. Bao gồm ba URL mẫu, xác minh chủ video, phản hồi GraphQL nhiều dòng, cursor nối tiếp/kết thúc/lặp, lỗi giữa lượt quét, dừng khi request đang chạy và giữ dữ liệu khi thử lại. Kiểm thử trực tiếp chỉ đọc nguồn, không đăng thử lên kênh thật.

Bản dự phòng trước sửa: `/root/backups/source-pagination-20261015/` gồm Git bundle, SQLite snapshot và encryption.key. Khi cần hoàn tác code dùng phiên bản `3013757`, giữ database hiện hành để không mất dữ liệu mới; bản sửa không yêu cầu migration Supabase. Bản dự phòng đầy đủ tệp dữ liệu trước nâng cấp vẫn ở `/root/backups/copy-automation-20261014/`.

Xác nhận sau triển khai `7945856`: hai nguồn đã lưu trong dữ liệu thật đều `complete`, không có lỗi; Facebook 360/360 video có ngày, TikTok 571/571 video có ngày. Link Facebook trang gốc thử riêng trả 20 video ở lượt đầu và cursor trang tiếp theo. 69/69 kiểm thử chuyên biệt trên Linux VPS đạt; health công khai HTTP 200, hai module giao diện trả về trùng SHA-256 với bản triển khai.

### Giao diện Sao chép gọn và hàng đợi chiến dịch — 15/10/2026

Hai tab Toàn bộ video và Video mới dùng bốn vùng độc lập: quét nguồn, kết quả nguồn, chọn chiến dịch/kế hoạch và kết quả kế hoạch. Bỏ lời dẫn dài; Từ ngày, Đến ngày và Quét chung một dòng. Danh sách nguồn có URL, trạng thái và thời điểm chạy lệnh (lastCommandAt, tương thích nguồn cũ bằng createdAt). Nút Quét lại/Dừng theo trạng thái; Tải GG Drive, Lên lịch RP và Loại chỉ hiện khi đã chọn video. Số video hiển thị là số bản ghi riêng biệt, tránh nhầm với số lượt đọc có trùng qua các trang nguồn.

Mỗi bảng tối đa 10 dòng/trang. Giữ một dòng hoặc nhấn Space khi dòng được focus để bật chọn; nút Hủy ẩn checkbox. Checkbox đầu bảng chọn/bỏ toàn bộ kết quả phù hợp qua các trang, có trạng thái chọn một phần. Nội dung nguồn hiện trực tiếp, liên kết mở bài gốc. Ngày gốc dùng HH:MM và dd/MM/YY trên hai dòng. Tìm kiếm nguồn và kết quả kế hoạch độc lập.

Biểu mẫu lên lịch có Tên kế hoạch/Chiến dịch cùng hàng trên PC. Mục đầu trong danh sách chiến dịch tạo nhanh chiến dịch mới. Kênh đăng và ngày lặp dùng dropdown nhiều lựa chọn/tất cả, đóng khi bấm ngoài. Chỉ đưa vào lựa chọn kênh đã kết nối và hỗ trợ đăng video. Ngày giờ nhập HH:MM DD/MM/YY, có nút chọn lịch; kiểm tra ngày thực tế và GMT+7. Giờ đăng dùng các ô HH:MM riêng, dấu cộng thêm giờ và dấu × bỏ giờ. Video mới có chu kỳ quét và cố định cũ nhất trước.

Chọn chiến dịch đang chạy sẽ nạp kế hoạch cùng loại gần nhất, ưu tiên cùng nguồn. Nếu cùng nguồn, thao tác bổ sung trực tiếp vào kế hoạch đang chạy, giữ tên/cấu hình/lịch đã có; các trường kế thừa được khóa và có lời giải thích. Dùng Sửa ở vùng quản lý để thay đổi cấu hình. Nếu khác nguồn thì tạo kế hoạch cho nguồn hiện tại bằng cấu hình kế thừa. Bỏ qua bài đã có trong hàng đợi hoặc đã đăng thành công theo từng kênh; chỉ giữ các đích chưa gửi. Việc bổ sung có transaction và kiểm tra người sở hữu, nguồn, loại sao chép, chiến dịch, trạng thái và hạn kết thúc. Không tái tạo lịch cũ. Hàng đợi trùng từ bản cũ có thứ tự ưu tiên xác định, tránh hai dòng chặn nhau.

Vùng quản lý chọn chiến dịch và kế hoạch, mặc định kế hoạch mới nhất của loại đang mở. Sửa/Tạm dừng/Tiếp tục/Hủy áp dụng đúng kế hoạch được chọn. Kết quả chỉ thuộc chiến dịch/kế hoạch đó; lọc nền tảng mặc định tất cả, chọn một/nhiều/tất cả hoặc bỏ hết. Giữ dropdown mở qua các lần làm mới dữ liệu. Trên điện thoại, các điều khiển xếp gọn; bảng cuộn ngang trong vùng riêng, ưu tiên hiển thị nội dung trong kết quả, đầy đủ mốc thời gian ở Chi tiết.

Nghiệm thu: 440 kiểm thử hồi quy, 14 nhóm kiểm thử Edge headless, ảnh desktop và 390px mobile trong test-results/copy-automation-*.png và copy-layout-form-*.png. Kịch bản có 23 video, phân trang 10/10/3, chọn toàn bộ qua trang, tạo nhanh chiến dịch, dropdown all/none/partial, ngày giờ, thêm giờ, xem trước không ghi lịch, tạo kế hoạch, bổ sung 20 vào 3 video không trùng, sửa, pause/reload/resume/cancel, bộ lọc và cấu hình Video mới. Kiểm thử tạo lịch/đăng dùng dữ liệu riêng và kênh demo, không đăng thử lên tài khoản thật.

Dự phòng VPS: /root/backups/copy-layout-20261015/ gồm Git bundle, SQLite backup, encryption.key và cấu hình hiện có. Phiên bản trước thay đổi giao diện: 3036d42. Không có migration Supabase.

### Sửa giờ đăng gần, chọn kết quả và nhãn task — 15/10/2026

Bỏ khoảng đệm 30 phút khi tìm khung giờ đăng: chỉ lấy giờ tương lai sau thời điểm hiện tại và không trước ngày bắt đầu. Ca kiểm thử bắt đầu 15:42 15/10/2026 với các giờ 15:45, 15:46 phải ra cùng ngày 15/10. Mốc T−30 chỉ quyết định lúc chuẩn bị Drive; lịch tạo sát giờ được tải ngay. Nếu không chuẩn bị kịp thì vẫn báo lỗi và không tự đăng muộn. Khung giờ đã thất bại vẫn được giữ chỗ cho video đó; không tự lấy video khác đăng vào cùng khung giờ, trừ thao tác xếp lại lịch của người dùng.

Chính sách slotPolicy=2 lưu trên kế hoạch mới/sửa. Khi khởi động bản sửa, các kế hoạch cũ được đánh dấu phiên bản mới; chỉ lịch tương lai chưa có content, chưa có job tải và chưa có publication được trả về pending để tính lại theo giờ gần nhất. Không thay đổi tác vụ đã tải/đang gửi hay bài đã xuất bản. Cần bản sao SQLite trước khởi động nếu muốn quay lại chính xác các mốc lịch cũ.

Bổ sung nút thu gọn/mở rộng cạnh tiêu đề quét và Video đã quét, cùng icon chuyển trang đồng bộ với phân trang cuối bảng. Bảng kết quả nhấn giữ/Space để chọn, checkbox đầu bảng chọn/bỏ tất cả các kết quả phù hợp qua nhiều trang và có trạng thái chọn một phần. Nhập bốn chữ số giờ, ví dụ 1545 hoặc 0930, tự thành 15:45 hoặc 09:30, hỗ trợ cả gõ lẫn dán.

Thẻ yêu cầu xử lý dùng một hàng Logo + Tên khách hàng + chữ nhỏ “- tên người giao”; bỏ dòng Người giao riêng và nhãn Người tạo task. Tin nhắn đang có nhắc việc hiển thị chữ nhỏ không nền “- tên người được giao”, gồm các nhân viên còn task mở của tin đó. Backend cung cấp tên người nhận trong phạm vi hội thoại được phép đọc. Khi task được xử lý, nhãn biến mất; tên người nhận là một phần khóa đối chiếu DOM để không bị giữ tên cũ khi phân công thay đổi.

Kiểm thử: 448 kiểm thử hồi quy; 16 nhóm giao diện Sao chép và 5 nhóm thẻ task/hội thoại trên Edge, PC và 390px mobile. Có trường hợp lịch sát 3 phút tải ngay, chuyển chính sách lịch cũ chỉ với tác vụ chưa chạy, bốn chữ số giờ, thu gọn/mở rộng, phân trang đầu/cuối, nhấn giữ kết quả, chọn tất cả qua trang, tên người giao/người nhận và gỡ nhãn sau hoàn tất. Không đăng thử lên các kênh thật. Bản dự phòng: /root/backups/schedule-task-followup-20261015/.
