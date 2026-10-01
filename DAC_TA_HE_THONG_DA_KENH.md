# ĐẶC TẢ HỆ THỐNG QUẢN LÝ NỘI DUNG, HỘI THOẠI VÀ BÁN HÀNG ĐA KÊNH

**Tên làm việc:** Creator Commerce Hub  
**Phiên bản:** 1.0 — 30/09/2026  
**Mục đích:** Tài liệu yêu cầu sản phẩm và thiết kế nền tảng để đội phát triển phân tích, báo giá, thiết kế giao diện, chia backlog và triển khai.  
**Đối tượng sử dụng:** Chủ thương hiệu/người sáng tạo nội dung, nhân viên nội dung, CSKH, bán hàng, kho, kế toán và quản trị hệ thống.

> Đây là hệ thống được đề xuất xây dựng, chưa phải phần mềm đã triển khai. Các thông số tải, thời gian và SLA dưới đây là mục tiêu thiết kế đề xuất, không phải kết quả đo thực tế. Khả năng của nền tảng bên ngoài được khảo sát từ tài liệu công khai; chưa thử nghiệm bằng tài khoản của chủ hệ thống. Việc được nền tảng cấp quyền phải được xác minh riêng trong giai đoạn khảo sát kỹ thuật.

## 1. Mục tiêu và phạm vi

Xây dựng một ứng dụng web hoạt động tốt trên trình duyệt máy tính và điện thoại, giúp người dùng tạo một nội dung gốc, chuyển thành các phiên bản phù hợp từng kênh, đăng ngay hoặc lên lịch, tiếp nhận tương tác, chăm sóc khách hàng, tạo đơn và theo dõi giao hàng trong cùng một hệ thống.

Chuỗi dữ liệu xuyên suốt:

```text
Chiến dịch → Nội dung gốc → Phiên bản từng kênh → Bài đã đăng
                                               ↓
                                      Bình luận / Tin nhắn
                                               ↓
                                  Khách hàng / Cơ hội bán hàng
                                               ↓
                                      Đơn hàng / Thanh toán
                                               ↓
                                  Vận chuyển / COD / Đổi trả
                                               ↓
                                  Báo cáo / Chăm sóc sau mua
```

### 1.1 Kết quả cần đạt

- Tải video/ảnh lên một lần; dùng lại cho nhiều tài khoản và nền tảng.
- Mỗi kênh có caption, hashtag, tiêu đề, định dạng và lịch đăng riêng khi cần.
- Lịch đã xác nhận chạy trên máy chủ kể cả khi người dùng tắt máy tính/điện thoại.
- Theo dõi rõ từng đích đăng thành công, đang xử lý, thất bại hoặc cần người dùng hoàn tất.
- Gom các tương tác mà API cho phép vào một hộp thư; trả lời đúng tài khoản và đúng ngữ cảnh.
- Nối hội thoại với thông tin khách hàng, sản phẩm, tồn kho, đơn hàng và vận đơn.
- AI giúp giảm thao tác nhưng mọi hành động phải tuân theo quyền, quy tắc nghiệp vụ và khả năng thực tế của kênh.
- Biết nội dung nào tạo hội thoại, đơn hàng và doanh thu thực thu; phân biệt dữ liệu chắc chắn với dữ liệu suy luận.

### 1.2 Giả định để dev lập phương án ban đầu

| Nội dung | Giả định thiết kế, có thể điều chỉnh |
|---|---|
| Mô hình sử dụng | Một chủ hệ thống, nhiều thương hiệu; dữ liệu có ranh giới workspace để có thể mở rộng |
| Quy mô thử tải ban đầu | 20 nhân viên đồng thời, 50 tài khoản/kênh kết nối, 1.000 đích đăng/ngày, 50.000 sự kiện tương tác/ngày |
| Nội dung chủ yếu | Video dưới 3 phút, ảnh đơn/album/carousel, caption và hashtag |
| Tiền tệ/giao diện | VND, tiếng Việt; cấu trúc hỗ trợ bổ sung tiền tệ/ngôn ngữ |
| Múi giờ mặc định | Asia/Ho_Chi_Minh; lưu thời gian thực thi bằng UTC |
| Bán hàng | Hàng vật lý, SKU và biến thể, COD/chuyển khoản; sản phẩm số là phần mở rộng |
| Kênh vận chuyển đầu tiên | Đề xuất GHN; GHTK tiếp theo, tùy tài khoản/hợp đồng thực tế |
| Nền tảng chạy | Web responsive + PWA; chưa cần ứng dụng native ở bản đầu |

Không coi các giả định này là giới hạn cứng. Dev phải đo tải media và số hội thoại thực tế trước khi chốt hạ tầng.

### 1.3 Phân biệt đầy đủ tính năng và khả thi tích hợp

Không cam kết mọi kênh có đủ đăng bài, bình luận và inbox. Phần mềm phải có ba chế độ:

1. **Tự động qua API:** thực thi trên máy chủ khi ứng dụng và tài khoản đủ quyền.
2. **Qua nhà cung cấp tích hợp:** dùng dịch vụ được cấp quyền phù hợp; phải có hợp đồng, khả năng xuất dữ liệu và thử nghiệm thật.
3. **Hỗ trợ thao tác:** chuẩn bị media/caption, nhắc giờ, mở ứng dụng gốc, người dùng hoàn tất và nhập đường dẫn bài đăng.

Chế độ 3 không được quảng cáo hoặc hiển thị là tự động đăng thành công. Không đưa việc thu thập cookie, lưu mật khẩu mạng xã hội, giả lập phiên cá nhân hay vượt CAPTCHA vào kiến trúc mặc định.

## 2. Bài học từ ba sản phẩm tham khảo

Đây là đối chiếu thông tin công khai, chưa phải kiểm thử hay khẳng định mọi tính năng hoạt động trên mọi loại tài khoản.

| Nguồn | Điểm nổi bật quan sát được | Yêu cầu áp dụng vào sản phẩm mới |
|---|---|---|
| [Pancake](https://pancake.vn/) | Tập trung hội thoại doanh nghiệp và hệ sinh thái POS, CRM, chatbot | Đưa thông tin khách, sản phẩm, đơn hàng vào ngay cạnh hội thoại; chia module nhưng dùng chung định danh |
| [SO9](https://so9.vn/danh-muc/cong-cu) | Công bố các nhóm hẹn lịch/xuất bản, theo dõi hiệu quả, tin nhắn/bình luận, công việc, khách hàng và tự động hóa | Lấy lịch nội dung, biên tập theo kênh và phối hợp nội bộ làm trung tâm vận hành nội dung |
| [TrolyPage](https://trolypage.com/) | Kết nối nội dung, hội thoại, chuyển đổi; AI theo ngữ cảnh và chuyển người; công bố phạm vi khác nhau giữa đăng bài, bình luận, inbox | AI dùng chung ngữ cảnh sản phẩm/nội dung/khách hàng; có bảng khả năng theo kênh và báo cáo đến kết quả bán hàng |

Khác biệt đề xuất: mọi bài đăng, hội thoại và đơn hàng có quan hệ dữ liệu truy vết; người dùng biết rõ tự động hóa nào đã chạy, vì sao, với phiên bản nội dung/quy tắc nào và kết quả ra sao. Đây là thiết kế riêng cho nhu cầu của chủ hệ thống, không phải danh sách tính năng sao chép nguyên trạng từ ba sản phẩm.

## 3. Ma trận tích hợp theo nền tảng

### 3.1 Quy ước

- **API***: Có cơ sở tài liệu về chức năng; chỉ bật khi quyền ứng dụng, loại tài khoản, gói dịch vụ và phép thử thực tế đạt yêu cầu.
- **Điều kiện**: Cần khảo sát riêng, xét duyệt, đối tác hoặc quyền sản phẩm bổ sung; chưa đưa vào cam kết bản đầu.
- **Hỗ trợ**: Chuẩn bị và mở nền tảng gốc để người dùng thực hiện.
- **Không trong phạm vi API đã xác minh**: Không hiển thị là tích hợp tự động; có thể khảo sát lại sau.

| Kênh | Đăng ngay/lên lịch | Đọc bình luận | Trả lời bình luận | Nhận/gửi tin nhắn | Quyết định triển khai |
|---|---|---|---|---|---|
| Facebook cá nhân | Hỗ trợ | Chưa cam kết | Hỗ trợ | Chưa cam kết inbox cá nhân | Tạo gói đăng, nhắc giờ, mở ứng dụng; không suy quyền Page sang tài khoản cá nhân |
| Facebook Page | API* theo loại bài | API* theo quyền | API* theo quyền | Messenger API*, tuân thủ điều kiện gửi | Ưu tiên khảo sát/triển khai đầu tiên |
| Zalo cá nhân | Hỗ trợ | Chưa cam kết | Hỗ trợ | Chưa cam kết | Phạm vi OpenAPI khảo sát tập trung OA; không coi đăng nhập Zalo là quyền đọc chat cá nhân |
| Zalo OA | API* cho nội dung OA phù hợp | Điều kiện theo nội dung/endpoint | Điều kiện | API* theo loại tin và điều kiện tài khoản | Tách bài OA, broadcast và tin mẫu thành ba nghiệp vụ |
| TikTok | Direct Post có điều kiện; đối tác hoặc hỗ trợ | Điều kiện qua sản phẩm/quyền phù hợp | Điều kiện | Business Messaging có điều kiện | Không suy quyền inbox/bình luận từ quyền đăng video |
| Instagram Professional | API*: ảnh, video/Reels, carousel theo điều kiện | API* | API* | API* theo điều kiện hội thoại | Kết nối Business/Creator; tài khoản cá nhân cần chuyển loại hoặc hỗ trợ |
| Threads | API*: văn bản, ảnh, video, carousel | API* cho replies trong phạm vi | API* | Chưa xác minh DM API phù hợp | Inbox công khai riêng; không hứa gom tin nhắn riêng |
| X | API* theo quyền/hạn mức | Replies/mentions qua API* | API* | API* theo quyền endpoint | Có đo chi phí đọc/ghi và giới hạn ngân sách |
| Reddit | Điều kiện: loại bài/subreddit/quyền ứng dụng | Điều kiện | Điều kiện | PM/Chat phải xác minh riêng | Khảo sát quyền sử dụng trước; không coi Reddit Chat tương đương PM |
| Blogger | API*: bài HTML, ảnh/nhúng media phù hợp | API* | Hỗ trợ trong thiết kế ban đầu | Không trong phạm vi API đã xác minh | API comments có đọc/kiểm duyệt, không thấy phương thức tạo reply trong danh mục đã khảo sát |
| YouTube | API*: upload video; lịch theo cơ chế phù hợp | API* | API* | Không đưa vào phạm vi | Không mặc định có API đăng ảnh Community; Shorts phải đạt tiêu chí nền tảng |
| DEV.to | API*: bài Markdown, ảnh bìa, nhúng phù hợp | API* | Hỗ trợ trong thiết kế ban đầu | Không trong phạm vi API đã xác minh | Tài liệu đã khảo sát có đọc comments; chưa xác minh endpoint viết comment cho người dùng |
| Live chat website | Toàn quyền với hệ thống tự xây | Không áp dụng | Không áp dụng | Tự xây | Kênh bổ sung để nhận tư vấn khi social không cho phép nhắn tiếp |

### 3.2 Căn cứ kỹ thuật và ràng buộc cần đưa vào hợp đồng

- **Meta:** Tài liệu Meta trên [Postman Instagram](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00) mô tả đăng nội dung, quản lý comments và messaging cho tài khoản chuyên nghiệp. [Threads API của Meta](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api) có publishing/replies. Một số trang Facebook Developers không đọc được trong lần khảo sát này; Facebook Page và Facebook cá nhân phải được dev kiểm chứng lại qua developer console và tài liệu hiện hành trước khi ký cam kết. Tham chiếu khởi đầu: [Pages posts](https://developers.facebook.com/docs/pages-api/posts/) và [Messenger](https://developers.facebook.com/docs/messenger-platform/).
- **Zalo:** [OA OpenAPI](https://oa.zalo.me/home/function/extension) công bố nhóm quyền nội dung, nhắn tin UID và webhook. [Danh mục Zalo Developers](https://developers.zalo.me/docs) tách OA và tin mẫu ZBS. Không có bằng chứng trong các nguồn đã đọc để cam kết quản lý tự động nhật ký/inbox Zalo cá nhân. Không giữ tên ZNS hoặc chính sách cũ làm hằng số nghiệp vụ; adapter theo sản phẩm hiện hành.
- **TikTok:** [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines) giới hạn ứng dụng chưa audit ở chế độ riêng tư và nêu công cụ chỉ phục vụ tài khoản do cá nhân/đội nhóm quản lý là trường hợp sử dụng không được chấp nhận. Vì nhu cầu hiện tại mang tính nội bộ, cần khảo sát đối tác phù hợp hoặc dùng hỗ trợ đăng; không coi hoàn thành code là bảo đảm được Direct Post. [Business Messaging API](https://business-api.tiktok.com/portal/bm-api/education-hub) là sản phẩm riêng cho Business Accounts được ủy quyền.
- **X:** [Tài liệu X API](https://docs.x.com/x-api/introduction) mô tả posts và direct messages, đồng thời công bố tính phí theo mức sử dụng. Không chốt mức giá cố định trong code hoặc báo giá vận hành dài hạn.
- **Reddit:** [Data API Terms](https://redditinc.com/policies/data-api-terms) yêu cầu thỏa thuận riêng cho sử dụng thương mại. Kiểm tra loại ứng dụng được duyệt và [API reference](https://www.reddit.com/dev/api/) trước khi triển khai; phạm vi tùy từng subreddit.
- **YouTube:** [Videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) lưu ý dự án chưa xác minh thuộc diện áp dụng bị giới hạn upload riêng tư. [Videos](https://developers.google.com/youtube/v3/docs/videos) mô tả publishAt; [Comments guide](https://developers.google.com/youtube/v3/guides/implementation/comments) mô tả thêm và phản hồi bình luận. Quota, audit và OAuth là các điều kiện độc lập.
- **Blogger:** [API reference](https://developers.google.com/blogger/docs/3.0/reference/) cho phép CRUD bài và đọc/kiểm duyệt comments; không lấy khả năng đọc comments để cam kết reply qua API.
- **DEV.to:** [Forem API V1](https://developers.forem.com/api/v1) mô tả bài Markdown, canonical URL và đọc comments. Phải phân biệt endpoint dành cho admin của một Forem với quyền tài khoản DEV.to thông thường.

### 3.3 Hồ sơ khả năng cho từng kết nối

Mỗi tài khoản đã kết nối phải có một hồ sơ máy đọc được:

```json
{
  "connection_id": "conn_001",
  "provider": "instagram",
  "account_type": "professional",
  "status": "connected",
  "capabilities": {
    "publish_video": "enabled",
    "publish_carousel": "enabled",
    "read_comments": "enabled",
    "reply_comments": "enabled",
    "read_messages": "needs_permission",
    "send_messages": "needs_permission"
  },
  "api_version": "verified-at-implementation",
  "verified_at": null,
  "limits_source": "provider_or_versioned_config"
}
```

Đây là mẫu cấu trúc, không phải trạng thái tài khoản thực tế. Bổ sung scopes, ngày hết hạn token, lý do bị chặn, đường dẫn kết nối lại, hạn mức, chi phí, ngày kiểm tra và bằng chứng test. Trạng thái chức năng gồm enabled / disabled / needs_permission / needs_review / unsupported / degraded / manual.

Giao diện lấy nút chức năng từ hồ sơ này. Một tài khoản đăng được video nhưng chưa có quyền inbox vẫn hiện kết nối thành công cho đăng bài và hiện thiếu quyền cho inbox.

## 4. Vai trò và phân quyền

| Vai trò | Quyền mặc định |
|---|---|
| Chủ hệ thống | Quản lý workspace, kết nối, thành viên, ngân sách, duyệt quyền và xem toàn bộ báo cáo |
| Quản lý nội dung | Lập chiến dịch, phân công, duyệt và xuất bản các kênh được giao |
| Biên tập viên | Tạo/sửa bản nháp, media, gửi duyệt; không tự đăng nếu chính sách yêu cầu duyệt |
| CSKH | Đọc/trả lời hội thoại được giao, xem thông tin khách phù hợp, tạo yêu cầu hỗ trợ |
| Bán hàng | Tạo báo giá và đơn, áp ưu đãi trong ngưỡng, xem tồn khả dụng |
| Kho | Xem đơn cần đóng, xuất hàng, in nhãn, cập nhật kiểm hàng/hoàn hàng |
| Kế toán | Đối soát tiền, COD, phí và hoàn tiền theo phân quyền |
| Người xem | Chỉ đọc dashboard/phạm vi được cấp |

Quyền có phạm vi workspace, thương hiệu, kênh, nhóm và trường dữ liệu. Tách quyền export khách hàng, xem số điện thoại đầy đủ, sửa giá, giảm giá, hoàn tiền, tạo vận đơn và kết nối nhà cung cấp. Cho phép một người có nhiều vai trò. Chủ hệ thống dùng chế độ cá nhân để bỏ bước phân công không cần thiết.

## 5. Cấu trúc màn hình

Menu chính: Tổng quan · Nội dung · Lịch đăng · Thư viện · Hộp thư · Khách hàng · Sản phẩm · Đơn hàng · Vận chuyển · Tự động hóa · Báo cáo · Cài đặt.

### 5.1 Dashboard

- Hôm nay: bài sắp đăng, bài lỗi, kết nối cần xử lý, hội thoại chưa trả lời, đơn chờ xác nhận, kiện giao lỗi.
- Thẻ ưu tiên có nút hành động trực tiếp: thử lại đích lỗi, kết nối lại, nhận hội thoại, in nhãn.
- Bộ lọc thương hiệu, kênh, nhân viên và khoảng thời gian.
- Dashboard tách mục nội dung, CSKH và kinh doanh; chế độ cá nhân hiển thị bản gọn.
- Không hiển thị chỉ số không thu được như số 0; dùng “Chưa có dữ liệu”, “Không được API hỗ trợ” hoặc “Đồng bộ trễ”.

### 5.2 Màn hình tạo nội dung trên máy tính

```text
[Chiến dịch / Loại nội dung / Lưu nháp / Gửi duyệt / Đăng hoặc lên lịch]
[Media + nội dung gốc] [Phiên bản theo kênh] [Xem trước + lỗi cần sửa]
[Sản phẩm liên quan]   [Caption/hashtag]     [Ngày giờ / quyền riêng tư]
```

### 5.3 Màn hình hộp thư trên máy tính

```text
[Bộ lọc + danh sách] [Hội thoại / cây bình luận + ô trả lời] [Khách hàng]
                                                           [Sản phẩm]
                                                           [Đơn hàng]
                                                           [AI gợi ý]
```

Ô soạn trả lời phải chỉ rõ “Bình luận công khai” hoặc “Tin nhắn riêng”, tài khoản gửi và người nhận. Ghi chú nội bộ có hình thức khác để tránh gửi nhầm.

### 5.4 Trên điện thoại

- Thanh dưới: Tổng quan, Lịch, Tạo, Hộp thư, Thêm.
- Hội thoại mở toàn màn hình; thông tin khách/đơn mở bằng bảng trượt.
- Nhập media từ thư viện/camera theo quyền trình duyệt, có upload tiếp tục sau mất kết nối nếu khả thi.
- Vùng bấm ít nhất 44px, chữ dễ đọc, thao tác một tay, không phụ thuộc hover.
- Bản nháp lưu trên máy chủ; khi offline chỉ cho soạn nháp an toàn, hiện trạng thái chưa gửi.
- Không xếp hàng tự động gửi tin hoặc tạo đơn khi offline nếu người dùng chưa xác nhận sau khi kết nối lại.
- PWA có thể cài ra màn hình chính; push phụ thuộc trình duyệt/hệ điều hành và quyền thông báo. Phải kiểm thử Android Chrome và iOS Safari thực tế.
- Không trông chờ trình duyệt chạy nền để đăng bài; scheduler luôn ở máy chủ.

## 6. Phân hệ nội dung và xuất bản

### 6.1 Kho nội dung gốc

**PUB-01 — Nội dung gốc:** tên nội bộ, mục tiêu, chiến dịch, thương hiệu, ngôn ngữ, người phụ trách, ngày dự kiến, sản phẩm liên quan, CTA, media, transcript và trạng thái.

**PUB-02 — Thư viện media:** upload kéo thả, nhiều file, thanh tiến độ, tải tiếp phần chưa xong; checksum chống upload trùng; thư mục/thẻ; tìm theo tên, loại, chiến dịch. Lưu chủ sở hữu, nguồn và phạm vi quyền sử dụng media khi người dùng cung cấp.

**PUB-03 — Xử lý media:** đọc codec, kích thước, thời lượng, dung lượng; tạo thumbnail, proxy xem trước; chuyển mã theo cấu hình đích. Gợi ý 9:16, 1:1, 4:5 khi phù hợp, nhưng không áp một cấu hình cho mọi nền tảng.

**PUB-04 — Chỉnh sửa cơ bản:** cắt đầu/cuối, chọn ảnh bìa, crop có xem trước, chọn vùng chủ thể, thêm phụ đề từ transcript và chỉnh lại. Không ghi đè media gốc. Watermark/nhạc chỉ áp dụng khi phù hợp quyền sử dụng và quy tắc kênh; không mặc định quyền nhạc trong app gốc áp dụng cho file tải qua API.

### 6.2 Biến thể theo kênh

**PUB-05:** chọn nhiều tài khoản, không chỉ chọn tên nền tảng. Một nội dung có thể tới nhiều Page hoặc nhiều kênh YouTube.

**PUB-06:** mỗi đích có title, caption/body, hashtag, media, thumbnail, alt text nếu hỗ trợ, link, lịch, quyền riêng tư và metadata riêng. Có “áp dụng cho tất cả” và “ghi đè riêng”. Không tự ghi đè phiên bản đã sửa thủ công khi cập nhật bản gốc.

**PUB-07:** AI đề xuất chuyển đổi: caption ngắn, caption giải thích dài, chuỗi bài, bài blog từ transcript, tiêu đề YouTube, nội dung thảo luận Reddit hoặc bài DEV.to phù hợp chủ đề. Không ép mọi video thành bài kỹ thuật hoặc tự bịa nội dung chưa có trong tài liệu.

**PUB-08:** quản lý bộ hashtag theo chủ đề/chiến dịch; loại trùng; cảnh báo số lượng/giới hạn theo đích; cho phép không dùng hashtag. Không hứa hashtag giúp tăng reach nếu không có dữ liệu.

**PUB-09:** blog có title, đoạn mô tả, body, ảnh, nhúng video, nhãn/tag và canonical URL nếu nền tảng hỗ trợ. Media cần URL bền vững cho bài đã đăng; không chèn đường dẫn ký tạm sắp hết hạn vào bài blog lâu dài.

**PUB-10:** preview theo kênh, hiển thị rõ chỉ là mô phỏng; bộ kiểm tra trước đăng phát hiện quá dài, sai định dạng, thiếu media/tiêu đề, sai quyền riêng tư, hết token và vượt khả năng tài khoản.

### 6.3 Lịch và quy trình duyệt

**PUB-11:** đăng ngay; một giờ chung; giờ riêng từng đích; lịch ngày/tuần/tháng; kéo thả dời lịch; nhân bản; lên lịch theo hàng đợi khung giờ. Kéo thả cần kiểm tra lại múi giờ/quyền và cập nhật phiên bản lịch nguyên tử.

**PUB-12:** kiểm tra xung đột, tần suất và nội dung gần giống trên cùng tài khoản; nội dung lặp lại phải có số lần kết thúc và điều kiện phù hợp, tránh vòng lặp vô hạn.

**PUB-13:** lịch gợi ý dựa trên hiệu suất của chính tài khoản, nêu cỡ mẫu/độ tin cậy. Khi ít dữ liệu dùng khung giờ người dùng chọn và gắn nhãn “chưa đủ dữ liệu”.

**PUB-14:** nháp → chờ duyệt → yêu cầu sửa/đã duyệt → lên lịch. Ghi người duyệt, thời điểm, revision. Sửa caption, media, tài khoản hoặc quyền riêng tư sau duyệt làm mất duyệt theo chính sách; không xuất bản phiên bản khác với phiên bản đã duyệt.

**PUB-15:** đăng đồng thời nghĩa là cùng thời điểm mục tiêu; không bảo đảm xuất hiện công khai cùng một giây do API và xử lý video khác nhau. Upload/chuẩn bị trước khi phù hợp; chỉ đặt lịch native nếu endpoint xác minh hỗ trợ. Nếu không, máy chủ gọi publish đúng giờ.

**PUB-16:** bình luận đầu tiên sau đăng, gắn link hoặc CTA chỉ bật ở kênh có API tương ứng, có độ trễ cấu hình; không thực hiện nếu bài cha chưa xác nhận thành công.

### 6.4 Theo dõi sau đăng

**PUB-17:** mỗi đích lưu external ID, permalink, thời gian yêu cầu/thành công, trạng thái xử lý, lỗi và lịch sử thử. Không đánh dấu thành công chỉ vì nhận HTTP 200 của bước tạo container/upload.

**PUB-18:** hỗ trợ cập nhật/gỡ bài khi kênh cho phép; nêu rõ trường nào sửa được. Nếu phải xóa và đăng lại thì cần thao tác riêng có giải thích mất tương tác; không tự xóa các bài đã đăng thành công để “đồng bộ”.

**PUB-19:** thất bại một đích không kéo theo đăng lại các đích thành công. Nút “Thử lại đích lỗi” và “Hủy các đích chưa gửi” tách biệt.

**PUB-20:** nội dung đăng trực tiếp ngoài hệ thống được nhập/đồng bộ khi API cho phép, lưu origin=external và liên kết nội dung gốc thủ công nếu cần; không tạo quan hệ chiến dịch giả định.

### 6.5 Kênh hỗ trợ đăng

**PUB-21:** trước giờ đăng gửi thông báo mở trang “Hoàn tất đăng”: tải/chia sẻ media, sao chép caption/hashtag, mở nền tảng gốc. Dùng share sheet/deep link nơi trình duyệt cho phép, có phương án sao chép/tải xuống.

**PUB-22:** người dùng điền URL bài đã đăng và xác nhận. Trạng thái “Người dùng xác nhận đã đăng” khác “API xác minh đã đăng”. Quá hạn hiển thị “Chưa hoàn tất”, không hiển thị “Thất bại API”.

## 7. Hộp thư hợp nhất và CSKH

### 7.1 Thu thập và tổ chức

**INB-01:** gom sự kiện comments, replies, mentions và DMs được cấp quyền; webhook là lựa chọn đầu tiên, polling theo ngân sách API ở kênh thiếu webhook.

**INB-02:** đồng bộ lịch sử theo giới hạn thật của nhà cung cấp; hiển thị ngày bắt đầu/phạm vi đã đồng bộ. Không hứa lấy toàn bộ lịch sử của mọi kênh.

**INB-03:** mỗi hội thoại giữ platform, tài khoản nhận, định danh khách trên kênh, bài gốc, cây trả lời, thời gian, nội dung, tệp và đường dẫn về ứng dụng gốc.

**INB-04:** bộ lọc chưa đọc, chưa trả lời, chưa phân công, quá SLA, có ý định mua, khiếu nại, VIP, spam, kênh, nhãn và nhân viên; tìm kiếm theo nội dung được phép lưu.

**INB-05:** hiển thị chuỗi bình luận theo thread; không trộn nhiều người bình luận công khai thành một cuộc chat riêng. Hồ sơ khách có timeline liên kết nhiều hội thoại nhưng từng hội thoại vẫn giữ ngữ cảnh gốc.

### 7.2 Trả lời và phối hợp

**INB-06:** trả lời văn bản, ảnh/tệp, mẫu, emoji theo khả năng kênh; trình soạn tự giới hạn attachment và độ dài; có preview trước gửi.

**INB-07:** mẫu trả lời dùng biến tên khách, sản phẩm, mã đơn, vận đơn, link tra cứu. Biến thiếu phải hiển thị cảnh báo; không gửi nguyên placeholder.

**INB-08:** gán thủ công, chia đều, theo ca, kỹ năng, thương hiệu hoặc khách quen. Có hàng chờ chung khi không có người trực; quản lý nhận cảnh báo SLA.

**INB-09:** trạng thái mới → đang xử lý → chờ khách/chờ nội bộ → đã giải quyết; khách nhắn lại mở lại hội thoại theo quy tắc. Có snooze và nhắc việc.

**INB-10:** khóa mềm người đang trả lời, hiển thị ai đang soạn, version check trước gửi, khóa cứng tác vụ gửi ở máy chủ để giảm trả lời trùng. Khi nhân viên tiếp quản, AI dừng trên hội thoại đó.

**INB-11:** ghi chú nội bộ, @nhắc đồng nghiệp, lịch sử chuyển người; có lý do đóng hội thoại, đánh giá CSAT khi kênh cho phép.

**INB-12:** policy engine kiểm tra cửa sổ gửi, loại tin, mẫu đã duyệt, quyền người nhận và số dư trước mỗi lần gửi. Ngoài cửa sổ chỉ cho cách gửi hợp lệ; không dùng tag/template sai mục đích để tiếp thị.

**INB-13:** tạo ticket từ chat; loại yêu cầu, mức ưu tiên, SLA, người phụ trách, liên quan đơn; xem toàn bộ lịch sử xử lý.

### 7.3 Kiểm duyệt và chống bỏ sót

**INB-14:** phát hiện spam, từ khóa nhạy cảm trong dịch vụ, số điện thoại/địa chỉ công khai; đề xuất ẩn khi API hỗ trợ. Tự động ẩn chỉ áp dụng quy tắc đã bật; không tự xóa khiếu nại hợp lệ.

**INB-15:** chuyển từ comment sang private reply chỉ ở kênh có chức năng và đúng điều kiện; nếu không thì gợi ý khách chủ động inbox hoặc dùng live chat.

**INB-16:** kiểm tra webhook mất kết nối, khoảng trống cursor, sự kiện trùng, sự kiện sửa/xóa/thu hồi. Đồng bộ bổ sung theo khả năng API và lưu tombstone thay vì tiếp tục hiện nội dung đã bị xóa.

**INB-17:** trạng thái gửi gồm queued, sending, accepted, delivered/read nếu được cung cấp, failed, unknown. Không suy ra delivered/read từ việc API nhận yêu cầu.

### 7.4 SLA đề xuất

Trong giờ làm việc: hội thoại mới ưu tiên có người nhận trong 5 phút, phản hồi đầu tiên trong 15 phút; ngoài giờ gửi thông báo lịch làm việc nếu được phép. Đây là cấu hình nghiệp vụ, khác độ trễ kỹ thuật của webhook. Báo cáo tách phản hồi AI và phản hồi người thật để không làm đẹp SLA bằng tin tự động.

## 8. AI cho nội dung, tư vấn và vận hành

### 8.1 Nguồn tri thức

Brand voice, danh mục sản phẩm, hướng dẫn sử dụng, chính sách giao/đổi trả, FAQ, nội dung đã được duyệt, thông tin chiến dịch. Mỗi nguồn có owner, phiên bản, ngày hiệu lực, trạng thái duyệt và phạm vi thương hiệu.

Giá, tồn kho và tình trạng đơn lấy từ công cụ truy vấn dữ liệu sống. Không dùng dữ liệu tìm kiếm ngữ nghĩa cũ để khẳng định giá/tồn. Tài liệu ngoài và tin khách chỉ là dữ liệu, không được ghi đè quy tắc hệ thống hoặc quyền truy cập.

### 8.2 Ba chế độ tự động hóa AI

| Chế độ | Hành vi |
|---|---|
| Gợi ý | AI soạn nháp, tóm tắt và gợi ý; người dùng quyết định gửi |
| Có điều kiện | Tự trả lời FAQ nằm trong danh mục cho phép khi đủ bằng chứng, đúng cửa sổ và không có người tiếp quản |
| Quy trình được ủy quyền | Thu thập thông tin, tạo giỏ/bản nháp đơn, nhắc việc và cập nhật trường cho phép; hành động tài chính/giao vận theo ngưỡng và bước duyệt riêng |

Mặc định bản đầu dùng Gợi ý. Chỉ tăng mức tự động sau khi đạt bộ đánh giá và được chủ hệ thống bật cho kênh/nhóm câu hỏi cụ thể.

### 8.3 Chức năng chi tiết

- **AI-01:** tạo ý tưởng/kịch bản/caption theo mục tiêu, persona thương hiệu, sản phẩm; gợi ý hook và CTA; không cam kết viral.
- **AI-02:** transcript/phụ đề, sửa câu, chuyển ngôn ngữ, chuyển video thành bài viết có đánh dấu đoạn chưa chắc chắn.
- **AI-03:** tóm tắt hội thoại và lịch sử mua; phát hiện nhu cầu mua, hỏi giá, tra đơn, đổi trả, khiếu nại.
- **AI-04:** gợi ý câu trả lời kèm nguồn nội bộ cho nhân viên kiểm tra; không cần gửi trích dẫn nội bộ cho khách.
- **AI-05:** nhận diện sản phẩm từ bài gốc và hội thoại; nếu nhiều SKU phù hợp thì hỏi lại màu/size/số lượng.
- **AI-06:** thu thập tên, số điện thoại, địa chỉ, sản phẩm và tạo bản nháp đơn. Luôn đọc lại tóm tắt giá, phí, COD để khách xác nhận; thông tin trích xuất chưa xác nhận có nhãn rõ.
- **AI-07:** tra vận đơn đúng khách đã xác thực; không cung cấp địa chỉ/số điện thoại đầy đủ chỉ vì ai đó đưa một mã đơn.
- **AI-08:** đề xuất nội dung mới từ câu hỏi thường gặp; dữ liệu khách được loại bỏ/ẩn danh khi đưa vào brief.
- **AI-09:** gợi ý khách cần chăm sóc, đơn có dấu hiệu giao chậm, nội dung tạo nhiều yêu cầu nhưng ít đơn; mọi suy luận có căn cứ và khả năng chỉnh lại.
- **AI-10:** thống kê số gợi ý được dùng/sửa, tỷ lệ chuyển người, chi phí, lỗi trả lời và mức độ đúng nguồn.

### 8.4 Giới hạn hành động và chuyển người

Chuyển người khi khách yêu cầu, không tìm thấy bằng chứng, thông tin mâu thuẫn, có khiếu nại/hoàn tiền, cần ngoại lệ giá, vấn đề nhạy cảm, lặp lại không giải quyết được hoặc kênh không cho phép gửi. Tạm ngừng bot ngay khi nhân viên nhận xử lý; chỉ bật lại có chủ đích.

AI không tự tạo giảm giá ngoài bảng giá, đổi tài khoản nhận tiền, xác nhận đã thanh toán, hoàn tiền hoặc tạo vận đơn khi chưa đủ điều kiện. Các công cụ ghi dữ liệu phải kiểm tra quyền ở backend, không dựa vào lời nhắc cho mô hình. Dùng idempotency key, audit log, ngân sách theo ngày và nút dừng AI theo workspace/kênh/hội thoại.

### 8.5 Bộ đánh giá trước khi bật tự động

Tạo tối thiểu 100 tình huống từ dữ liệu được phép sử dụng: hỏi giá/size, hết hàng, chính sách cũ, khách đổi địa chỉ, nhiều SKU giống nhau, người lạ tra đơn, lệnh dụ bot bỏ quy tắc, nhân viên tiếp quản và API lỗi. Mục tiêu: ít nhất 95% câu FAQ trong phạm vi trả lời đúng theo bộ chấm đã thống nhất; không có lỗi nghiêm trọng về lộ dữ liệu, giá hoặc hành động tài chính. Nếu không đạt thì giữ chế độ gợi ý. Đánh giá lại khi đổi model, prompt hoặc nguồn tri thức quan trọng.

## 9. Quản lý khách hàng và cơ hội bán hàng

**CRM-01 — Hồ sơ khách:** mã nội bộ, tên, điện thoại/email đã chuẩn hóa, nhiều địa chỉ, công ty, nguồn, nhãn, người phụ trách, ghi chú, lịch sử đơn, công nợ nếu có, consent theo mục đích/kênh.

**CRM-02 — Định danh đa kênh:** bảng liên kết external identity theo provider + connection/account scope + external user ID. Không đồng nhất hai người chỉ dựa tên/avatar. Số điện thoại giống nhau chỉ tạo đề xuất gộp; cần xác minh hoặc duyệt vì có số dùng chung/tái cấp.

**CRM-03 — Gộp/tách:** trước gộp hiển thị trường mâu thuẫn và ảnh hưởng; lưu ai gộp, nguồn và snapshot để hoàn tác hợp lý. Không gộp xuyên workspace.

**CRM-04 — Phễu:** khách mới → đủ điều kiện → đang tư vấn → báo giá → chờ xác nhận → đã mua/không thành công. Lưu lý do mất cơ hội, sản phẩm quan tâm, giá trị dự kiến, lịch hẹn.

**CRM-05 — Phân khúc:** mới/cũ, mua nhiều lần, chưa mua, bỏ dở tư vấn, theo giá trị giao dịch và hoạt động; quy tắc minh bạch, không suy thuộc tính nhạy cảm không liên quan.

**CRM-06 — Chăm sóc:** nhắc nhân viên gọi/nhắn, chiến dịch sau mua, hỏi trải nghiệm, nhắc mua lại. Chỉ gửi marketing khi đủ điều kiện consent và nền tảng; có dừng nhận và danh sách loại trừ.

**CRM-07 — Import/export:** ánh xạ trường, kiểm tra trùng, preview thay đổi, kết quả từng dòng, phân quyền export và log. Import không mặc định khách đã đồng ý marketing.

**CRM-08 — Timeline:** nội dung đã tương tác nếu biết, hội thoại, ghi chú, đơn, thanh toán, giao vận, đổi trả và nhiệm vụ. Dữ liệu không xác định nguồn ghi “Chưa xác định”.

## 10. Sản phẩm, giá và kho

- **CAT-01:** sản phẩm, SKU/biến thể màu/size, barcode, ảnh/video, mô tả, đơn vị, trọng lượng/kích thước, giá vốn/giá bán, trạng thái đang bán, quy tắc bảo hành.
- **CAT-02:** bảng giá theo kênh/nhóm khách, khuyến mãi có ngày hiệu lực, coupon, combo; mức giảm tối đa theo vai trò. Không bắt buộc đồng bộ catalog lên mạng xã hội ở bản đầu.
- **CAT-03:** một hoặc nhiều kho; sổ giao dịch nhập/xuất/chuyển/điều chỉnh; lý do và chứng từ; kiểm kê không sửa trực tiếp số dư không truy vết.
- **CAT-04:** tồn khả dụng = tồn thực tế − đã giữ − tồn không bán được. Giữ hàng khi xác nhận đơn; giải phóng khi hủy/hết hạn. Phải xử lý nguyên tử khi hai nhân viên chốt SKU cuối cùng.
- **CAT-05:** đặt ngưỡng tồn thấp; chính sách cho phép bán trước/backorder chỉ bật rõ theo SKU; mặc định không cho tồn khả dụng âm.
- **CAT-06:** combo trừ tồn thành phần; hàng hoàn chỉ nhập lại sau kiểm tra chất lượng; hàng lỗi vào khu không bán.
- **CAT-07:** lưu thông tin sản phẩm snapshot trên đơn để sửa tên/giá sản phẩm sau này không thay đổi lịch sử giao dịch.
- **CAT-08:** lô/hạn dùng/serial và mua hàng từ nhà cung cấp là tùy chọn giai đoạn sau nếu ngành hàng yêu cầu.

## 11. Đơn hàng và thanh toán

### 11.1 Tạo đơn ngay trong hội thoại

Chọn hoặc tạo khách → thêm SKU/số lượng → xác nhận địa chỉ → tính giá/ưu đãi/thuế nếu cấu hình → báo phí vận chuyển → chọn thanh toán → gửi tóm tắt → khách xác nhận → giữ hàng → chuyển đóng gói.

Cho phép lưu báo giá và bản nháp; chưa tạo vận đơn khi chỉ mới có bản nháp. AI có thể điền nhưng người dùng/khách phải xác nhận các trường có ảnh hưởng giao dịch.

### 11.2 Trường bắt buộc

order_id, workspace, customer, channel/source, conversation/post/campaign nếu biết, người tạo, items/SKU/snapshot giá, địa chỉ giao, giảm giá và lý do, phí ship khách trả, tổng tiền, đã trả, COD dự kiến, trạng thái và lịch sử.

Tiền dùng số nguyên theo đơn vị nhỏ nhất phù hợp; VND lưu số nguyên đồng. Mọi tổng được backend tính lại, không tin số tiền gửi từ giao diện hoặc AI.

```text
Tiền hàng = tổng(số lượng × đơn giá chốt)
Khách cần trả = tiền hàng − giảm giá + thuế áp dụng + phí ship khách chịu
Còn phải thu = khách cần trả − tiền đã nhận được xác minh
COD hàng hóa/chuyển hãng = giá trị ánh xạ theo quy tắc phí và thu hộ của từng hãng
```

Tách phí ship khách trả với phí thực tế nhà vận chuyển thu. Không đồng nhất COD với doanh thu hoặc lợi nhuận.

### 11.3 Nghiệp vụ

- **ORD-01:** danh sách, tìm kiếm, lọc trạng thái/kênh/nhân viên, thao tác hàng loạt có preview.
- **ORD-02:** tạo/sửa nháp, xác nhận, hủy có lý do; đơn đã giao phải dùng nghiệp vụ đổi trả/hoàn thay vì sửa lùi lịch sử.
- **ORD-03:** chống trùng từ cùng phiên chốt/hội thoại; double click không tạo hai đơn. Trùng khách và số tiền chỉ cảnh báo, không tự xóa vì có thể là hai lần mua thật.
- **ORD-04:** in phiếu đóng gói, tách kiện, giao một phần và theo dõi phần còn thiếu ở giai đoạn mở rộng.
- **ORD-05:** chuyển khoản/QR theo nhà cung cấp đã chọn; ảnh biên lai chỉ là bằng chứng cần kiểm tra. Chỉ đánh dấu đã trả bằng webhook ngân hàng/cổng thanh toán hoặc thao tác người có quyền.
- **ORD-06:** giao dịch tiền riêng biệt gồm payment, refund, adjustment; giữ tham chiếu nhà cung cấp và chống sự kiện trùng.
- **ORD-07:** COD có trạng thái dự kiến → hãng đã thu → chờ chuyển → đã đối soát → chênh lệch. Giao thành công không có nghĩa tiền đã về shop.
- **ORD-08:** yêu cầu đổi trả, lý do, ảnh, kiểm hàng, hàng nhập lại, đơn thay thế, phí và quyết định hoàn tiền; mọi bước có audit.
- **ORD-09:** xuất dữ liệu cho kế toán; tích hợp hóa đơn điện tử là module riêng nếu cần, không mặc định bản đầu thay thế phần mềm kế toán.

## 12. Vận chuyển và đối soát

### 12.1 Phạm vi nhà vận chuyển

Đề xuất adapter GHN đầu tiên, GHTK tiếp theo. [Tài liệu GHN webhook](https://api.ghn.vn/home/docs/detail?id=84) và [GHTK OpenAPI](https://api.ghtk.vn/) cung cấp cơ sở tích hợp trạng thái và nghiệp vụ giao hàng. Viettel Post, VNPost, J&T, SPX hoặc hãng khác vào backlog khi có tài liệu, tài khoản và quyền thực tế. Danh sách này là mục tiêu mở rộng, không phải xác nhận tất cả đã tích hợp.

### 12.2 Tính năng

- **SHP-01:** nhiều tài khoản hãng và điểm lấy hàng; token mã hóa; test kết nối; cấu hình phí/người trả theo hợp đồng.
- **SHP-02:** chuẩn hóa địa chỉ, lưu nguyên văn và cấu trúc; dùng mã địa bàn của từng hãng. Không ép một danh mục tỉnh/huyện/xã cũ cho tất cả; hỗ trợ phiên bản danh mục và ánh xạ khi hãng cập nhật.
- **SHP-03:** lấy báo giá theo tuyến, dịch vụ, trọng lượng/kích thước, khai giá, COD; lưu thời điểm báo giá. Phí dự kiến có thể khác quyết toán và phải thể hiện chênh lệch.
- **SHP-04:** so sánh dịch vụ đủ điều kiện theo giá, thời gian dự kiến và hiệu suất thực tế của shop; chủ hệ thống chọn ưu tiên. Không gọi dịch vụ rẻ nhất là tốt nhất mặc định.
- **SHP-05:** tạo vận đơn, in nhãn, yêu cầu lấy, hủy/sửa theo khả năng trạng thái; khóa chống tạo trùng. Một đơn có thể có nhiều kiện và lần giao.
- **SHP-06:** webhook cập nhật; polling bù khi cần; giữ mã trạng thái gốc và mapping chuẩn. Lưu lịch sử sự kiện đến muộn, không cho sự kiện cũ làm lùi trạng thái hiện tại sai.
- **SHP-07:** cảnh báo quá lâu chưa lấy, giao thất bại, khách hẹn lại, hoàn về; tạo nhiệm vụ cho CSKH và thông báo khách qua kênh hợp lệ.
- **SHP-08:** đối soát COD, cước, phụ phí, phí hoàn và tiền chuyển; import file quyết toán khi hãng không có API phù hợp; khớp từng vận đơn và đưa chênh lệch vào hàng chờ.
- **SHP-09:** cổng tra cứu đơn công khai bằng token khó đoán, thông tin tối thiểu; dữ liệu nhạy cảm yêu cầu xác thực bổ sung.

### 12.3 Quy tắc lỗi quan trọng

Nếu API tạo vận đơn timeout, không tạo lại ngay. Tra cứu theo mã tham chiếu của shop; nếu chưa xác định được thì chuyển “Chưa rõ kết quả” và yêu cầu đối soát. Đổi hãng sau khi đã tạo vận đơn phải kiểm tra hủy vận đơn cũ để tránh hai hãng cùng lấy hàng. Giao thất bại không tự nhập tồn về kho; chỉ nhập lại khi kiện đã về và kiểm hàng.

## 13. Quy trình tự động hóa

Mô hình trigger → điều kiện → hành động → kết quả; mỗi workflow có phiên bản, owner, trạng thái, giới hạn chạy, chế độ thử và lịch sử. Mỗi hành động phải kiểm tra khả năng API và quyền gửi tại thời điểm thực thi.

| Mã | Kích hoạt | Điều kiện | Hành động |
|---|---|---|---|
| AUT-01 | Bài có comment hỏi giá | Có sản phẩm gắn bài, kênh cho phép | Gắn nhãn mua hàng, đề xuất trả lời hoặc private reply hợp lệ |
| AUT-02 | Hội thoại mới ngoài giờ | Được phép gửi, chưa gửi trong khoảng giới hạn | Thông báo giờ làm việc, tạo nhiệm vụ |
| AUT-03 | Khách cung cấp đủ thông tin mua | Xác định đúng SKU và giá | Tạo bản nháp đơn, yêu cầu xác nhận |
| AUT-04 | Đơn được xác nhận | Còn hàng, thanh toán/điều kiện COD đạt | Giữ tồn, tạo nhiệm vụ đóng gói; tạo vận đơn nếu chính sách cho phép |
| AUT-05 | Hãng báo giao thất bại | Sự kiện mới, chưa có ticket tương ứng | Mở ticket, phân công và soạn tin hỏi khách |
| AUT-06 | Đơn giao thành công | Đúng consent/cửa sổ/template | Hẹn chăm sóc sau mua, không tự gửi marketing trái điều kiện |
| AUT-07 | Token hết hiệu lực | Có lịch tương lai liên quan | Chặn tác vụ bị ảnh hưởng, thông báo kết nối lại |
| AUT-08 | AI thiếu thông tin | Không có nguồn đáng tin | Chuyển người cùng tóm tắt hội thoại |
| AUT-09 | Nội dung nhiều câu hỏi giống nhau | Đủ dữ liệu và đã loại thông tin khách | Tạo đề xuất FAQ/nội dung mới chờ duyệt |

Chống vòng lặp bằng event origin, causation ID, khóa workflow + entity + event, giới hạn độ sâu và số lần. Một tin bot gửi không được tự kích hoạt lại bot vô hạn. Có dry-run xem trước đối tượng và hành động, nút dừng toàn bộ workflow, lịch sử lỗi và thử lại có kiểm soát.

## 14. Báo cáo và đo hiệu quả

### 14.1 Nội dung

Số nội dung gốc, số đích đăng, tỷ lệ thành công, lỗi theo nguyên nhân; hiệu suất theo kênh/định dạng/chủ đề; views, reach, tương tác và tăng follower khi API có dữ liệu. Lưu định nghĩa chỉ số gốc và phiên bản; không cộng “reach” của các kênh rồi gọi là số người duy nhất.

### 14.2 CSKH

Hội thoại mới/tồn, thời gian phân công, phản hồi đầu, giải quyết; số lần mở lại, khiếu nại, CSAT; AI so với người, thời gian tiết kiệm ước tính có phương pháp đo. Không dùng một chỉ số tốc độ để đánh giá chất lượng nhân viên.

### 14.3 Kinh doanh

Cơ hội, tỷ lệ chốt, giá trị đơn, khách mới/quay lại, tỷ lệ hủy/hoàn; doanh số đặt hàng, doanh thu theo quy tắc ghi nhận đã cấu hình, tiền thực thu và COD chưa về; lợi nhuận ước tính chỉ khi có đủ giá vốn/phí.

### 14.4 Truy nguồn nội dung đến đơn

Lưu content_id, publication_id, conversation_id, campaign_id và UTM/landing session khi thu được. Cho phép nhân viên chọn nguồn và đánh dấu manual. Dùng mô hình first-touch/last-touch có mô tả; nếu khách chuyển kênh không có dữ liệu định danh thì ghi unknown. Không suy quan hệ nhân quả chỉ vì đơn và bài cùng thời điểm.

### 14.5 Chi phí

Dashboard media lưu trữ/egress, chuyển mã, API mạng xã hội, AI, tin mẫu và vận hành. Có ngân sách, cảnh báo và ưu tiên tác vụ khi sắp hết hạn mức; tạm dừng tự động hóa phụ không làm mất dữ liệu đơn hoặc hội thoại.

## 15. Kiến trúc triển khai đề xuất

### 15.1 Cách tổ chức

Bắt đầu bằng backend chia module trong cùng một codebase, chạy web/API và background workers thành tiến trình riêng. Chưa cần tách quá nhiều microservice. Tách worker media, publishing và inbox để việc encode video không làm chậm chat.

```text
Web / PWA
    │ HTTPS + phiên đăng nhập
    ▼
Backend API ───────── PostgreSQL (dữ liệu chuẩn, lịch, outbox)
    │                 Object storage (media riêng tư + bản phân phối)
    │                 Redis (cache, khóa có hạn, rate limit)
    ▼
Outbox dispatcher → Hàng đợi bền vững → Workers theo nhóm nghiệp vụ
                                         ├─ Media
                                         ├─ Scheduler / Publishing
                                         ├─ Inbox / AI / Automation
                                         └─ Orders / Shipping / Reconciliation
Webhook ingress → Xác minh → Lưu bền vững → Queue → Chuẩn hóa / chống trùng
                                          │
                         Connector mạng xã hội / hãng vận chuyển / AI
```

### 15.2 Công nghệ tham chiếu

TypeScript cho web và backend, React/Next.js cho giao diện, NestJS hoặc framework tương đương cho API, PostgreSQL, object storage tương thích S3, FFmpeg cho media, queue được quản lý hoặc Redis-backed queue có cấu hình bền vững và phục hồi. Đây là lựa chọn kiến trúc đề xuất, không ràng buộc dev phải dùng một phiên bản thư viện cụ thể. Dev chốt phiên bản còn được hỗ trợ, ghi lockfile và phương án nâng cấp.

Scheduler lấy lịch từ PostgreSQL; queue chỉ là phương tiện thực thi. Nếu queue mất, hệ thống tái tạo được tác vụ từ lịch/outbox. Có monitor phát hiện lịch đến hạn nhưng chưa phát lệnh.

### 15.3 Giao diện chuẩn của connector

```text
connect / refreshAuth / disconnect / inspectCapabilities
validatePublication / prepareMedia / publish / getPublishStatus
updatePublication / deletePublication        [optional]
syncComments / replyComment / moderateComment [optional]
syncMessages / sendMessage / verifyWebhook    [optional]
fetchMetrics / estimateCost                   [optional]
```

Từng method trả normalized result, external IDs, raw status, retry-after, error category và billable usage nếu biết. Optional không đồng nghĩa giả thành công; trả unsupported rõ ràng. Cấu hình limits theo tài khoản/loại bài/API version, không đặt một giới hạn chung cho mọi nền tảng.

### 15.4 Lỗi chuẩn hóa

validation_error, auth_expired, permission_missing, review_required, rate_limited, insufficient_credit, provider_outage, media_processing_failed, policy_blocked, unsupported_capability, unknown_outcome.

Chỉ lỗi tạm thời được retry tự động, có backoff + jitter và hạn cuối. Lỗi auth/quyền cần người xử lý; quá giờ cho phép thì missed/needs_action, không đăng bù nội dung hết hiệu lực mà không có quy tắc được chủ hệ thống chọn.

### 15.5 Tính nhất quán

- Transaction ghi nghiệp vụ và outbox cùng một lần commit.
- Job xử lý ít nhất một lần; chống trùng tại nghiệp vụ bằng unique key/idempotency. Không tuyên bố exactly-once end-to-end với API không hỗ trợ.
- Lease/lock có hạn và heartbeat cho worker; version check cho thay lịch/hủy lịch.
- Khi kết quả publish chưa rõ, ưu tiên đối soát external object/status trước khi gọi lại; nếu không tra được thì needs_reconciliation.
- Kết quả một đích độc lập với các đích khác; trạng thái nội dung gốc là tổng hợp.
- Webhook chỉ ACK sau khi đã lưu bền vững; lưu event ID/hash để dedupe, xử lý ngoài request nhanh.
- Polling có cursor, watermark, khoảng lùi chống mất sự kiện và lịch bù có rate limit.
- Ngắt kết nối hủy/chặn các tác vụ chưa bắt đầu, thu hồi bí mật và thực thi chính sách xóa dữ liệu; không chỉ ẩn tài khoản khỏi giao diện.

## 16. Mô hình dữ liệu tối thiểu

Mọi bảng nghiệp vụ có id, workspace_id, created_at, updated_at và version khi có cập nhật cạnh tranh. External ID lưu dạng chuỗi; không ép sang integer dễ mất chính xác.

| Nhóm | Thực thể và trường trọng tâm |
|---|---|
| Tổ chức | Workspace, Brand, User, Membership, Role, Permission |
| Kết nối | Connection(provider, account_id, type, secret_ref, scopes, expiry, status), Capability, SyncCursor |
| Nội dung | Campaign, ContentItem, ContentRevision, ContentVariant, Asset, AssetDerivative, Approval |
| Xuất bản | Publication(connection, revision, target, schedule_at_utc, timezone, state, external_id, permalink), PublishAttempt, ManualPublishTask |
| Tương tác | Conversation(connection, external_thread, customer_identity, kind, status, assignee, policy_state), Message, Comment(parent_id, publication_id), Attachment |
| CSKH | Assignment, InternalNote, Tag, Ticket, SLAEvent, ReplyTemplate |
| Khách | Customer, CustomerIdentity, Address, Consent, MergeAudit, Opportunity, Activity |
| Hàng hóa | Product, ProductVariant/SKU, PriceList, Promotion, Warehouse, StockLedger, StockReservation |
| Đơn | Order, OrderItem, OrderStatusEvent, Payment, Refund, Return, ReturnItem |
| Giao vận | CarrierConnection, Shipment, ShipmentItem, ShippingQuote, TrackingEvent, CODSettlement, SettlementLine |
| AI | KnowledgeDocument, KnowledgeVersion, AIPolicy, AIRun, ToolCall, EvaluationCase, EvaluationResult |
| Tự động | Workflow, WorkflowVersion, WorkflowRun, WorkflowStepRun |
| Hạ tầng | WebhookEvent, OutboxEvent, IdempotencyRecord, AuditLog, Notification, UsageLedger |
| Báo cáo | MetricDefinition, MetricSnapshot, AttributionTouch, OrderAttribution |

### 16.1 Quan hệ bắt buộc

- ContentItem có nhiều revisions/variants; Publication trỏ tới revision đã khóa và một Connection.
- Một Publication có nhiều comments/metrics; một Conversation có thể liên quan Publication nhưng cho phép null nếu không biết nguồn.
- Customer có nhiều CustomerIdentity; identity được scope theo nhà cung cấp/tài khoản đúng quy tắc của provider.
- Order có nhiều items, payments, refunds và shipments; không gắn cứng một đơn = một vận đơn = một thanh toán.
- StockLedger chỉ ghi bổ sung/đảo giao dịch; StockReservation giữ hàng có thời hạn và liên quan đơn.
- Attribution lưu nguồn trực tiếp, thủ công hoặc suy luận cùng độ tin cậy; không ghi đè bằng suy luận yếu hơn.

### 16.2 Ràng buộc và index

Unique external event theo workspace + provider + connection + external_event_id; unique message/comment theo scope thực tế. Unique idempotency key theo workspace + operation; lưu request hash để cùng key khác payload trả conflict. Index lịch theo state + schedule_at; inbox theo workspace + assignee + status + last_activity; stock theo warehouse + SKU. Mọi join/query kiểm tra workspace, kể cả export, tìm kiếm ngữ nghĩa và background job.

## 17. Trạng thái nghiệp vụ

### 17.1 Publication

```text
DRAFT → PENDING_APPROVAL → APPROVED → SCHEDULED → PREPARING
                                                    ↓
                                         READY → DISPATCHING
                                                    ↓
                                    PROCESSING → PUBLISHED

Các nhánh: VALIDATION_FAILED / BLOCKED_AUTH / RETRY_WAIT /
FAILED / UNKNOWN_OUTCOME / NEEDS_RECONCILIATION / CANCELLED / MISSED
Nhánh hỗ trợ: AWAITING_MANUAL → MANUALLY_CONFIRMED
```

ContentItem tổng hợp có scheduled, in_progress, published_all, partially_published, failed_all. “All” chỉ tính tập đích được chọn hiện tại; hiển thị cả đích hỗ trợ chưa hoàn tất. Hủy trước dispatch có thể bảo đảm tại hệ thống; hủy sau khi nhà cung cấp đã nhận phải kiểm tra trạng thái và không hứa thu hồi tức thì.

### 17.2 Đơn, tiền, kho và vận chuyển

```text
Order: DRAFT → PENDING_CONFIRMATION → CONFIRMED → FULFILLING
       → COMPLETED; nhánh CANCELLED / RETURN_REQUESTED / RETURNED
Payment: UNPAID / PARTIALLY_PAID / PAID / PARTIALLY_REFUNDED / REFUNDED
Shipment: CREATED → PICKUP_PENDING → IN_TRANSIT → DELIVERED
          nhánh DELIVERY_FAILED / RETURNING / RETURNED / CANCELLED
COD: EXPECTED → COLLECTED_BY_CARRIER → PENDING_SETTLEMENT
     → SETTLED hoặc DISCREPANCY
```

Đây là các trục độc lập. Một đơn giao xong có thể chưa đối soát COD; một đơn giao một phần có nhiều trạng thái kiện. Backend phải kiểm tra chuyển trạng thái hợp lệ và ghi lịch sử, không cho người dùng tùy ý sửa một chuỗi status để bỏ qua nghiệp vụ tồn/tiền.

## 18. API nội bộ để đội dev triển khai

Các endpoint sau là hợp đồng sơ bộ; dev hoàn thiện OpenAPI và schema validation. Tất cả kiểm tra phiên đăng nhập, workspace, quyền và phiên bản tài nguyên. Thao tác bất đồng bộ trả 202 + operation_id, không trả “thành công xuất bản” trước khi có kết quả.

| Method và path | Chức năng |
|---|---|
| GET /v1/connections | Danh sách kết nối và trạng thái |
| POST /v1/connections/{provider}/authorize | Khởi tạo OAuth/kết nối phù hợp |
| GET /v1/connections/{id}/capabilities | Khả năng thực tế theo tài khoản |
| POST /v1/assets/uploads | Tạo phiên upload multipart/resumable |
| POST /v1/assets/{id}/complete | Xác nhận upload và bắt đầu kiểm tra/xử lý |
| POST /v1/contents | Tạo nội dung gốc |
| PATCH /v1/contents/{id} | Sửa bằng expected_version/If-Match |
| POST /v1/contents/{id}/variants | Tạo phiên bản cho đích |
| POST /v1/contents/{id}/validate | Kiểm tra tất cả đích |
| POST /v1/contents/{id}/approvals | Duyệt revision cụ thể |
| POST /v1/publication-batches | Đăng ngay/lên lịch một tập đích |
| POST /v1/publications/{id}/retry | Thử lại một đích khi an toàn |
| POST /v1/publications/{id}/cancel | Hủy tác vụ hoặc yêu cầu hủy theo trạng thái |
| POST /v1/publications/{id}/manual-confirmation | Ghi URL và xác nhận thủ công |
| GET /v1/calendar | Lịch theo tài khoản/múi giờ |
| GET /v1/conversations | Hộp thư, lọc và cursor pagination |
| POST /v1/conversations/{id}/assign | Phân công/tiếp quản |
| POST /v1/conversations/{id}/messages | Gửi tin theo policy |
| POST /v1/comments/{id}/replies | Trả lời công khai |
| POST /v1/conversations/{id}/ai-drafts | Tạo gợi ý, chưa gửi |
| POST /v1/customers | Tạo khách |
| POST /v1/customers/merge-preview | Xem trước gộp |
| POST /v1/customers/merge | Gộp theo quyền và version |
| GET /v1/products; GET /v1/inventory/availability | Danh mục và tồn khả dụng |
| POST /v1/orders; POST /v1/orders/{id}/confirm | Tạo/xác nhận đơn và giữ tồn |
| POST /v1/shipping-quotes | Lấy phí/dịch vụ đủ điều kiện |
| POST /v1/orders/{id}/shipments | Tạo kiện/vận đơn |
| POST /v1/orders/{id}/returns | Tạo yêu cầu hoàn |
| POST /v1/payments/reconcile | Đối soát có quyền |
| POST /v1/workflows/{id}/dry-run | Thử quy tắc không thực hiện ghi ngoài |
| GET /v1/reports/{report} | Báo cáo theo định nghĩa metric |
| POST /v1/webhooks/{provider} | Webhook xác minh theo provider; không dùng phiên người dùng |

Mẫu yêu cầu lên lịch:

```json
{
  "content_id": "content_001",
  "expected_version": 3,
  "targets": [
    {
      "connection_id": "page_001",
      "variant_revision_id": "revision_007",
      "schedule_at": "2026-10-05T20:00:00+07:00",
      "timezone": "Asia/Ho_Chi_Minh",
      "mode": "api"
    },
    {
      "connection_id": "personal_manual_001",
      "variant_revision_id": "revision_008",
      "schedule_at": "2026-10-05T20:00:00+07:00",
      "timezone": "Asia/Ho_Chi_Minh",
      "mode": "assisted"
    }
  ]
}
```

Header Idempotency-Key bắt buộc cho publish, gửi tin, xác nhận đơn, tạo vận đơn, payment/refund. Response lỗi có code, message tiếng Việt, field_errors, retryable, correlation_id và next_action. Không trả token/bí mật trong lỗi.

## 19. Bảo mật, riêng tư và vận hành

### 19.1 Bảo mật

- OAuth qua backend, state/PKCE nơi áp dụng; scopes tối thiểu, refresh token xử lý an toàn khi xoay vòng.
- Token lưu trong secret manager hoặc mã hóa bằng khóa ngoài database; không đưa access token vào localStorage, log hoặc prompt AI.
- RBAC và kiểm tra tenant ở mọi request/job/query; test truy cập chéo workspace.
- MFA cho chủ hệ thống/quản trị; thu hồi phiên, quản lý thiết bị; tài khoản nhân viên rời nhóm mất quyền ngay.
- TLS, mã hóa backup, signed URL ngắn hạn cho file riêng; media cấp cho provider tách khỏi tệp khách.
- Kiểm tra MIME thực, quét file theo rủi ro, giới hạn dung lượng, chống SSRF khi tải URL; lọc HTML blog và nội dung chat để tránh XSS.
- Webhook xác minh chữ ký/cơ chế chính thức, timestamp/replay nếu provider có; không coi một IP hoặc URL khó đoán là đủ xác thực.
- Audit ai đọc/xuất dữ liệu nhạy cảm, ai sửa quy tắc/giá, ai gửi tin/xác nhận đơn, kết quả và correlation ID.

### 19.2 Vòng đời dữ liệu

Có chính sách lưu theo loại: nội dung, media, raw webhook, hội thoại, đơn, audit và backup. Raw payload nên ngắn hạn; thời hạn cụ thể chốt theo nhu cầu, hợp đồng API và rà soát pháp lý trước vận hành. Có yêu cầu export/xóa/ẩn danh, xóa cache/vector index và không phục hồi dữ liệu đã yêu cầu xóa khi restore backup mà thiếu bước áp lại deletion log.

Consent lưu nguồn, mục đích, kênh, thời gian và rút lại. Xử lý yêu cầu xóa theo quy định áp dụng và nghĩa vụ giữ chứng từ; tài liệu này không chốt thời hạn pháp lý. Kết nối AI phải công khai phạm vi dữ liệu gửi nhà cung cấp và cấu hình hạn chế lưu/huấn luyện theo hợp đồng có sẵn.

### 19.3 Theo dõi vận hành

Dashboard queue lag, lịch trễ, webhook lỗi, auth hết hạn, provider rate limits, inbox lag, worker crash, tỷ lệ unknown outcome, media backlog, AI cost và COD mismatch. Có alert đến quản trị, trace xuyên publication/conversation/order, và runbook khôi phục từng nhóm lỗi.

### 19.4 Mục tiêu phi chức năng để nghiệm thu

| Chỉ tiêu | Mục tiêu đề xuất và điều kiện đo |
|---|---|
| Uptime ứng dụng | 99,9%/tháng cho phần hệ thống kiểm soát; báo riêng sự cố API ngoài |
| API tương tác | p95 < 800ms cho CRUD/tìm kiếm phân trang ở tải nền đã thống nhất, không gồm upload/AI/provider |
| Màn hình chính | Nội dung chính hiển thị trong khoảng 3 giây trên thiết bị/mạng thử nghiệm thống nhất |
| Lịch đăng | p95 phát lệnh trong 30 giây quanh giờ mục tiêu, khi job ready, đủ quota và provider khả dụng; báo riêng thời gian công khai thực tế |
| Inbox webhook | p95 hiển thị trong 10 giây tính từ lúc hệ thống nhận webhook hợp lệ, không từ lúc khách bấm gửi |
| Kênh polling | Hiển thị lịch đồng bộ 1–5 phút mục tiêu khi quota cho phép; cho phép giảm tần suất có thông báo |
| Backup | Mục tiêu RPO ≤ 15 phút, RTO ≤ 4 giờ; cấu hình backup/PITR phù hợp và diễn tập phục hồi |
| Tính đúng | Không nhân đôi đơn/vận đơn trong test retry; dữ liệu tiền/tồn phải qua kiểm tra bất biến |
| Trình duyệt | Chrome/Edge/Safari ở các phiên bản được chọn trong ma trận QA; Android Chrome và iOS Safari thực tế |
| Khả năng truy cập | Bàn phím, focus rõ, label, tương phản và trình đọc màn hình ở luồng chính |

Tất cả SLO cần báo cáo cả phần đạt mục tiêu và phần bị loại trừ với lý do; không che mất lịch trễ do provider.

## 20. Luồng end-to-end để thiết kế và demo

### Luồng A — Một video đăng nhiều kênh

Người dùng upload video 90 giây → hệ thống kiểm tra và tạo thumbnail → nhập caption gốc → chọn Page, Instagram, YouTube, Threads, TikTok và Facebook cá nhân → AI tạo biến thể chờ sửa → kiểm tra khả năng từng tài khoản → đặt 20:00 → duyệt → máy chủ thực thi các đích API đủ quyền; đích hỗ trợ gửi nhắc → trả về kết quả từng đích và permalink.

Ví dụ Page và Threads thành công, Instagram lỗi token: trạng thái tổng “Thành công một phần”; kết nối lại Instagram rồi chỉ thử lại Instagram. Không đăng trùng Page/Threads. TikTok đi theo đường đã được xác minh trong giai đoạn 0.

### Luồng B — Bình luận thành đơn

Khách bình luận hỏi giá trên bài gắn SKU → sự kiện về inbox → hiện bài/video gốc và sản phẩm → AI gợi ý trả lời đúng giá/tồn → nhân viên gửi → mở DM/private reply khi đủ điều kiện hoặc mời khách chủ động nhắn → khách xác nhận SKU và địa chỉ → tạo đơn, chốt tổng/COD → giữ tồn → chọn hãng và tạo vận đơn → giao hàng → đối soát tiền → chăm sóc sau mua hợp lệ.

### Luồng C — Hai nhân viên cùng chốt một sản phẩm cuối

Cả hai nhìn thấy còn 1 → người A xác nhận trước, giao dịch giữ tồn thành công → người B nhận lỗi insufficient_stock và gợi ý đổi SKU/đặt trước nếu được phép. Không tạo hai đơn đã xác nhận có hàng.

### Luồng D — Hãng báo giao thất bại

Webhook hợp lệ → dedupe → cập nhật kiện → tạo ticket và gợi ý liên hệ → nhân viên xác minh địa chỉ/thời gian → yêu cầu giao lại theo khả năng hãng → ghi lịch sử. Nếu hoàn về, chỉ nhập tồn sau kho nhận và kiểm hàng.

### Luồng E — Kênh thiếu API

Nội dung vẫn nằm trong lịch → đến giờ gửi nhắc → người dùng mở gói đăng, copy caption, tải/chia sẻ media và hoàn tất ở app gốc → dán URL → hệ thống ghi xác nhận thủ công. Bình luận/tin nhắn không được đọc bởi API thì chỉ có lối mở app gốc, không tạo inbox giả.

## 21. Backlog và ưu tiên

P0 = nền tảng bắt buộc để vận hành đúng; P1 = mở rộng quan trọng; P2 = nâng cao. P0 không có nghĩa mọi tích hợp ngoài đều được duyệt ngay.

| Epic | Ưu tiên | Phạm vi bàn giao | Phụ thuộc |
|---|---|---|---|
| E00 Khảo sát tích hợp | P0 | Ma trận quyền và phép thử mỗi nhóm ưu tiên; quyết định TikTok/cá nhân | Tài khoản và quyền chủ hệ thống |
| E01 Tài khoản và tổ chức | P0 | Workspace, vai trò, kết nối, audit, secret store | Không |
| E02 Media và soạn nội dung | P0 | Upload, bản gốc/biến thể, kiểm tra và preview | E01 |
| E03 Scheduler | P0 | Lịch bền vững, từng đích, retry/đối soát, nhắc thủ công | E02 |
| E04 Connector ưu tiên | P0 | Page/Instagram; YouTube/Threads khi điều kiện đạt; không khóa kiến trúc vào một kênh | E00–E03 |
| E05 Inbox nền tảng | P0 | Page/Instagram; OA theo quyền; phân công và phản hồi | E00–E01 |
| E06 CRM cơ bản | P0 | Khách, identity, consent, timeline, gộp có kiểm soát | E05 |
| E07 Sản phẩm và đơn | P0 | SKU, giá, một kho, giữ tồn, đơn từ hội thoại, payment thủ công có audit | E06 |
| E08 Giao vận đầu tiên | P0 | Một hãng, nhãn, tracking, COD, hàng hoàn cơ bản | E07 và quyền hãng |
| E09 AI gợi ý | P1 | Tri thức, tóm tắt, draft reply/content, đánh giá | E02/E05–E07 |
| E10 Kênh mở rộng | P1 | OA publishing, X, Blogger, DEV.to; Reddit/TikTok theo cổng duyệt | E00, E03/E05 |
| E11 Automation | P1 | Rule builder, dry-run, chống lặp, SLA | E05–E09 |
| E12 Báo cáo đầy đủ | P1 | Nội dung → hội thoại → đơn, chi phí và COD | Dữ liệu từ các epic |
| E13 Bán hàng nâng cao | P2 | Nhiều kho/hãng, split shipment, serial/lô, cổng thanh toán, hóa đơn | E07–E08 |
| E14 AI tự động có điều kiện | P2 | FAQ auto, quy trình được ủy quyền, giám sát chất lượng | E09/E11 và đạt bộ eval |
| E15 Mở rộng hệ sinh thái | P2 | API đối tác, webhook ra, landing/live chat nâng cao, MCP nếu có nhu cầu | Quyền và mô hình vận hành ổn định |

## 22. Lộ trình triển khai và cổng quyết định

### Giai đoạn 0 — Khảo sát, thử quyền và chốt thiết kế: 2–3 tuần dự kiến

Liệt kê tài khoản thực, loại tài khoản, ngành hàng, quy mô media, số nhân viên/kho. Tạo app developer cần thiết và kiểm tra từng quyền; gửi hồ sơ xét duyệt phù hợp. Làm prototype UX các màn hình chính, ERD và đặc tả API. Thử ít nhất một bài, một comment/reply và một hội thoại nhận/gửi cho mỗi kênh định đưa vào bản đầu.

**Cổng quyết định:** tài liệu bằng chứng chỉ rõ chức năng đã thử được, đang chờ duyệt, phải qua đối tác hoặc chỉ hỗ trợ. Nếu TikTok không phù hợp ứng dụng nội bộ, chốt đối tác hoặc chế độ hỗ trợ ngay; không chờ cuối dự án.

### Giai đoạn 1 — Nội dung và inbox: khoảng 6–8 tuần sau nền tảng thiết kế

E01–E06, scheduler, media, Page/Instagram và kênh đủ quyền tiếp theo, mobile responsive, manual publishing. AI chưa tự gửi. Pilot bằng tài khoản thật trong phạm vi chủ hệ thống cho phép.

### Giai đoạn 2 — Bán hàng và giao vận: khoảng 4–6 tuần

SKU, một kho, đơn từ chat, một hãng vận chuyển, trạng thái COD, đổi trả cơ bản và đối soát. Bổ sung QA cạnh tranh tồn kho và retry tạo vận đơn.

### Giai đoạn 3 — AI, tự động hóa và mở rộng: khoảng 6–10 tuần

AI gợi ý, tri thức, đánh giá, automation, các kênh còn lại đủ quyền, thêm hãng, báo cáo attribution và chi phí. Tự động trả lời chỉ bật sau pilot đạt yêu cầu.

Đây là khung ước lượng để dev lập kế hoạch, không phải cam kết giao hàng. Các giai đoạn có thể chồng một phần; thời gian xét duyệt API nằm ngoài kiểm soát đội dev. Đội tham chiếu: người phụ trách sản phẩm/BA, thiết kế UX bán thời gian, 2 backend, 1 frontend và QA; DevOps hỗ trợ. Đội ít người hơn cần giảm phạm vi hoặc tăng lịch.

### Nguyên tắc báo giá

Báo riêng: core platform, từng connector với từng capability, media, inbox, commerce, AI, vận hành và bảo trì API. Chi phí tháng gồm compute/database/backup, storage/egress, queue, chuyển mã, AI, API nền tảng, tin mẫu, đối tác và hỗ trợ. Chưa chốt con số khi chưa biết quy mô và quyền; yêu cầu ba kịch bản tải và bảng đơn giá nhà cung cấp có ngày hiệu lực.

## 23. Tiêu chí nghiệm thu bắt buộc

| Mã | Tình huống kiểm thử | Kết quả phải đạt |
|---|---|---|
| AC-01 | Một video, nhiều tài khoản đủ quyền | Tạo đúng số đích, đúng media/caption/account; có ID/URL thực |
| AC-02 | Lên lịch rồi tắt trình duyệt | Máy chủ vẫn chạy lịch; có thời gian yêu cầu và kết quả |
| AC-03 | Video sai cấu hình ở một đích | Chặn đích đó trước đăng, chỉ rõ lỗi; không sửa âm thầm |
| AC-04 | Một trong nhiều đích lỗi | Hiện thành công một phần; retry không nhân đôi đích đã thành công |
| AC-05 | API timeout sau khi có thể đã nhận bài | Vào unknown/đối soát, không retry mù |
| AC-06 | Hủy/dời lịch cùng lúc worker lấy job | Version/lock ngăn job cũ chạy sai; trạng thái kết quả rõ |
| AC-07 | Token hết hạn trước giờ đăng | Cảnh báo, chặn đúng đích, có luồng kết nối lại |
| AC-08 | Sửa nội dung đã duyệt | Xuất bản chỉ revision hợp lệ; yêu cầu duyệt lại theo chính sách |
| AC-09 | Đích hỗ trợ như Facebook cá nhân | Nhắc + gói đăng; không tự báo API thành công |
| AC-10 | Múi giờ +07:00 | Lưu UTC đúng, hiển thị đúng giờ; kiểm tra đổi timezone và DST nếu dùng vùng có DST |
| AC-11 | Webhook gửi lại nhiều lần | Một message/comment và một tác vụ nghiệp vụ |
| AC-12 | Webhook tới sai thứ tự | Lịch sử đầy đủ, trạng thái hiện tại không lùi sai |
| AC-13 | Người dùng chỉ có quyền một Page | Không đọc/gửi/xuất dữ liệu Page khác |
| AC-14 | Hai nhân viên gửi trả lời cùng lúc | Có cảnh báo/kiểm soát xung đột; đúng người nhận và kênh |
| AC-15 | AI đang trả lời thì người tiếp quản | Chặn AI chưa gửi; không gửi thêm sau tiếp quản |
| AC-16 | Ngoài cửa sổ gửi | Backend chặn hoặc chọn cách hợp lệ; UI giải thích |
| AC-17 | Hai khách cùng tên/avatar | Không tự gộp; lịch sử khách vẫn tách |
| AC-18 | Gộp khách sai | Có audit và quy trình tách/khôi phục quan hệ |
| AC-19 | Hai đơn tranh SKU cuối | Chỉ một lần giữ tồn thành công, không oversell |
| AC-20 | Double click xác nhận đơn | Một giao dịch xác nhận, một lần giữ tồn |
| AC-21 | Sửa giá sản phẩm sau bán | Giá trên đơn cũ không đổi |
| AC-22 | Hủy đơn đã giữ hàng | Giải phóng đúng một lần; không âm hoặc tăng thừa tồn |
| AC-23 | Timeout tạo vận đơn | Tra cứu tham chiếu trước khi tạo lại; không hai vận đơn vô ý |
| AC-24 | Webhook giao thành công | Chỉ cập nhật giao hàng; không tự ghi COD đã về shop |
| AC-25 | Đổi/hoàn một phần | Đúng tiền, số lượng và hàng nhập lại; có lịch sử |
| AC-26 | File quyết toán trùng | Không ghi nhận tiền hai lần; hiện chênh lệch từng vận đơn |
| AC-27 | AI hỏi giá/tồn khi vừa thay đổi | Truy vấn dữ liệu sống; không trả giá/tồn cũ như sự thật |
| AC-28 | Khách yêu cầu vượt quyền hoặc lấy dữ liệu người khác | AI/backend không làm; chuyển người khi cần |
| AC-29 | Automation tự kích hoạt lại | Giới hạn vòng lặp hoạt động, không spam tin/đơn |
| AC-30 | Ngắt kết nối một tài khoản | Job chưa chạy bị chặn, secret được xử lý, trạng thái rõ |
| AC-31 | Truy cập chéo workspace qua API/job/vector search | Bị chặn; không rò dữ liệu |
| AC-32 | Mất queue/worker restart | Khôi phục tác vụ từ DB/outbox, không mất lịch hoặc làm trùng |
| AC-33 | Backup restore | Đạt RPO/RTO đã chốt, kiểm tra toàn vẹn và deletion log |
| AC-34 | Điện thoại mất mạng khi soạn | Giữ nháp và trạng thái; không báo đã gửi hoặc tự gửi giao dịch cũ |
| AC-35 | Metric không hỗ trợ/đồng bộ trễ | Hiển thị thiếu dữ liệu và thời điểm cập nhật, không giả bằng 0 |
| AC-36 | API rate limit/hết credit | Backoff/ngân sách đúng, cảnh báo; không retry liên tục |
| AC-37 | Import khách không có consent | Không đưa vào chiến dịch marketing tự động |
| AC-38 | Bài hoặc comment bị xóa ở nguồn | Cập nhật trạng thái trong phạm vi đồng bộ, không giữ hiển thị sai vô hạn |

Nghiệm thu phải có cả test tự động và end-to-end trên tài khoản thật được phép thử. Mỗi connector lưu ảnh/video demo, request ID đã ẩn bí mật, scope, API version và ngày test. Mock giúp test lỗi nhưng không thay thế bằng chứng tích hợp thật. Nếu chưa được duyệt, ghi “chưa nghiệm thu tự động”, không tính là hoàn thành bằng mock.

## 24. Bộ tài liệu và tài sản dev phải bàn giao

1. Source code và quyền sở hữu repository, tên miền, cloud, app developer thuộc chủ hệ thống.
2. Wireframe/prototype desktop và mobile; design system, trạng thái rỗng/lỗi/loading/thiếu quyền.
3. ERD, migration, data dictionary, OpenAPI và event contracts.
4. Ma trận từng nền tảng: chức năng, account type, scopes, review, quota/chi phí, webhook/polling, giới hạn lịch sử, trạng thái test.
5. Bộ test và báo cáo AC-01 đến AC-38, kiểm thử tải theo giả định, đánh giá AI nếu có.
6. CI/CD, staging/production tách biệt, quản lý secrets, backup, cảnh báo và runbook.
7. Tài liệu kết nối lại token, xử lý unknown publish, webhook mất, đơn/vận đơn trùng nghi ngờ, lệch COD và restore.
8. Hướng dẫn sử dụng cho chủ hệ thống, nội dung, CSKH, kho và kế toán.
9. Bảng chi phí vận hành, phụ thuộc trả phí và chính sách bảo trì khi API đổi.
10. Kế hoạch xuất dữ liệu/chuyển nhà cung cấp và kiểm tra khôi phục; không giữ dữ liệu/tài khoản trong tài khoản cá nhân của đơn vị dev.

## 25. Thông tin cần chủ hệ thống chốt trước khi ký phạm vi phát triển

Các điểm này không cản việc dùng tài liệu để mời dev phân tích và báo giá; chúng quyết định cấu hình và thứ tự ưu tiên cuối cùng.

- Kênh nào đem lại nhiều khách/doanh thu nhất; số tài khoản thực tế và loại tài khoản từng kênh.
- Hệ thống chỉ dùng nội bộ hay dự định cung cấp cho bên khác; không mô tả sai use case để xin quyền API.
- Số nhân viên, thương hiệu, kho; vai trò nào được đăng không cần duyệt.
- Ngành hàng, số SKU, combo/serial/lô/hạn dùng; có cần hàng số hoặc dịch vụ không.
- Hãng vận chuyển và tài khoản/hợp đồng đang có; quy tắc phí, COD, đổi trả.
- Ngân hàng/cổng thanh toán, nhu cầu hóa đơn và phần mềm kế toán hiện tại.
- Dữ liệu cần nhập ban đầu, lượng media/ngày và thời gian lưu mong muốn.
- AI chỉ gợi ý hay được tự trả lời nhóm FAQ nào; ngưỡng giảm giá/hành động cần quản lý duyệt.
- Ngân sách xây dựng, ngân sách vận hành tháng và hạn mức phí API/AI.

**Phạm vi nên chốt cho bản chạy thật đầu tiên:** nội dung gốc + biến thể + lịch máy chủ + đăng ở các kênh đã xác minh + hỗ trợ đăng cá nhân + inbox Page/Instagram/OA khi đủ quyền + CRM + SKU/một kho + tạo đơn từ chat + một hãng vận chuyển + COD và báo cáo cơ bản. Sau đó mở rộng AI và kênh theo bằng chứng tích hợp, giữ cùng mô hình dữ liệu xuyên suốt.
