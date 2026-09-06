# Ứng phó nhanh — Hướng dẫn dành cho Ban giám khảo

**Nền tảng đánh giá mức sẵn sàng kho và điều phối vật tư cứu hộ cho cấp xã.**
Địa bàn mẫu: xã Đồng Xuân — 1 kho cứu trợ trung tâm và 17 kho thôn.

Tài liệu này là **một file tự đủ**: đường dẫn truy cập, tài khoản dùng thử, hướng dẫn
sử dụng từng ứng dụng, và các bước cài đặt đầy đủ để Ban giám khảo tự dựng hệ thống
trên máy của mình. Mọi thông tin dưới đây đã được kiểm chứng trực tiếp trên hệ thống
đang chạy, không chép lại từ tài liệu cũ.

---

## Mục lục

| Phần | Nội dung |
|---|---|
| [1](#1-truy-cập-nhanh--đường-dẫn-và-tài-nguyên) | Truy cập nhanh — đường dẫn và tài nguyên |
| [2](#2-hệ-thống-gồm-những-gì) | Hệ thống gồm những gì |
| [3](#3-tài-khoản-dùng-thử) | Tài khoản dùng thử (đầy đủ 21 tài khoản) |
| [4](#4-dùng-thử-nhanh-trên-bản-demo-online-15-phút) | Dùng thử nhanh trên bản demo online (15 phút) |
| [5](#5-hướng-dẫn-sử-dụng-web-vận-hành) | Hướng dẫn sử dụng web vận hành |
| [6](#6-ứng-dụng-điện-thoại-android-apk) | Ứng dụng điện thoại Android (APK) |
| [7](#7-ứng-dụng-desktop--giả-lập-cảm-biến-kho) | Ứng dụng desktop — giả lập cảm biến kho |
| [8](#8-cài-đặt-đầy-đủ-trên-máy-của-ban-giám-khảo) | **Cài đặt đầy đủ trên máy của Ban giám khảo** |
| [9](#9-kịch-bản-chấm-đề-xuất) | Kịch bản chấm đề xuất (15 · 45 · 90 phút) |
| [10](#10-chạy-bộ-kiểm-thử-tự-động) | Chạy bộ kiểm thử tự động |
| [11](#11-đặt-lại-dữ-liệu-về-trạng-thái-ban-đầu) | Đặt lại dữ liệu về trạng thái ban đầu |
| [12](#12-lỗi-thường-gặp-và-cách-xử-lý) | Lỗi thường gặp và cách xử lý |
| [13](#13-phạm-vi-và-giới-hạn-đã-biết) | Phạm vi và giới hạn đã biết |
| [14](#14-tài-liệu-tham-chiếu-trong-repository) | Tài liệu tham chiếu trong repository |

---

## 1. Truy cập nhanh — đường dẫn và tài nguyên

| Hạng mục | Đường dẫn | Ghi chú |
|---|---|---|
| **Web vận hành (demo online)** | <https://ungphonhanh.life> | Đăng nhập bằng tài khoản ở §3 |
| Kiểm tra máy chủ demo còn sống | <https://ungphonhanh.life/api/health> | Phải trả `{"status":"ok"}` |
| **Ứng dụng Android (APK)** | <https://github.com/khoidev2001/safestock-x/releases> — tải `app-release.apk` | Phiên bản `0.5.0`, 84 MB |
| **Mã nguồn** | <https://github.com/khoidev2001/safestock-x> | Monorepo pnpm, cài theo §8 |
| Ứng dụng desktop | Không có bản tải sẵn — chạy từ mã nguồn: `pnpm desktop:dev` (§7) | Electron |
| Web khi tự cài trên máy | <http://localhost:3200> | Sau khi làm §8 |

### 1.1. Điều quan trọng nhất cần biết về bản demo online

Máy chủ ứng dụng (`NestJS` + `PostgreSQL` + `Redis` + AI chạy cục bộ) đặt **trên một
máy vật lý tại chỗ**, không phải trên cloud. Giao diện web nằm trên Vercel nên **trang
web luôn mở được**, nhưng phần API chỉ hoạt động khi máy chủ đó đang bật.

**Vì vậy, trước khi đăng nhập, hãy mở trước đường dẫn này:**

<https://ungphonhanh.life/api/health>

| Kết quả | Ý nghĩa | Việc cần làm |
|---|---|---|
| `{"status":"ok","services":{"database":"up","redis":"up"}}` | Máy chủ đang chạy | Đăng nhập bình thường theo §4 |
| Không phản hồi / lỗi 5xx | Máy chủ đang tắt | Liên hệ nhóm để bật, **hoặc** tự cài theo §8 — bản tự cài đầy đủ tính năng hơn bản online |

Trạng thái đã kiểm chứng lúc viết tài liệu (07/08/2026): web trả `200`,
`/api/health` trả `ok` với `database: up`, `redis: up`, và đăng nhập tài khoản
`admin` trả `201` thành công.

> **Khuyến nghị:** bản demo online dùng để xem nhanh giao diện và luồng nghiệp vụ.
> Để chấm đầy đủ — gồm trợ lý AI chạy cục bộ, giả lập cảm biến, chế độ mất mạng và
> bộ kiểm thử tự động — nên **tự cài theo §8**. Toàn bộ quá trình mất khoảng 30–45
> phút, phần lớn là thời gian tải dependency và model AI.

### 1.2. Kiến trúc "một tên miền, hai đường đi"

Đây là điểm thiết kế cần nắm để hiểu vì sao chỉ có một địa chỉ:

```
                         https://ungphonhanh.life
                                    │
              ┌─────────────────────┴─────────────────────┐
     CÒN INTERNET                                  MẤT INTERNET (chỉ còn mạng nội bộ)
              │                                            │
   DNS công cộng → Vercel (giao diện web)      DNS nội bộ → máy chủ kho
   /api, /socket.io → Cloudflare Worker        Caddy phục vụ cả web lẫn API
     → tunnel → máy chủ kho                    ngay tại chỗ
```

Người dùng **luôn gõ cùng một địa chỉ**. Bão làm mất Internet thì hệ thống vẫn chạy
trong phạm vi xã, không phải đổi URL, không phải đổi tài khoản, không có "cơ sở dữ
liệu offline" riêng. Chi tiết: [docs/HYBRID-DOMAIN-RUNBOOK.md](docs/HYBRID-DOMAIN-RUNBOOK.md).

---

## 2. Hệ thống gồm những gì

Monorepo `pnpm`, 5 ứng dụng và 2 gói dùng chung:

| Thành phần | Thư mục | Công nghệ | Cổng khi chạy local |
|---|---|---|---|
| **Máy chủ API** | `apps/backend` | NestJS · Prisma · PostgreSQL · Redis · Socket.IO | **3100** |
| **Web vận hành** | `apps/frontend` | Next.js | **3200** |
| **Dịch vụ AI** | `apps/ai-service` | FastAPI · Ollama (chạy cục bộ) | **8000** |
| **App điện thoại** | `apps/mobile` | React Native · Expo · APK Android | — |
| **App desktop** | `apps/desktop` | Electron (giả lập cảm biến kho) | — |
| Kiểu dữ liệu dùng chung | `packages/shared-types` | TypeScript contract | — |
| Hạ tầng | `infrastructure` | Docker · Caddy · Cloudflare · OSRM · Windows | — |

Ngoài ra khi chạy local còn có PostgreSQL cổng `55433`, Redis cổng `16379` (trong
Docker), Ollama cổng `11434`, và tùy chọn OSRM định tuyến offline cổng `5000`.

### Năng lực chính

- **Đánh giá mức sẵn sàng (Readiness)** theo 6 mặt, có blocker chặn điều phối — điểm
  cao nhưng còn vướng mắc nghiêm trọng thì hệ thống vẫn **không cho điều phối**.
- **Điều phối cứu hộ (Mission-to-Kit)**: từ mô tả tình huống → hệ thống tính nhu cầu
  vật tư → phân bổ theo kho gần điểm sự cố → phát hành nhiệm vụ → kho chuẩn bị theo
  từng mã → đội hiện trường giao hàng → đóng nhiệm vụ. Số liệu do **máy chủ tính**,
  AI chỉ diễn giải bằng lời.
- **Nghiệp vụ kho ngày thường**: nhập, xuất, chuyển kệ, quét QR theo lô, kiểm kê,
  điều chỉnh, mượn–trả (hoàn tốt/hỏng/mất), báo cáo tháng có duyệt.
- **Cảm biến và cảnh báo**: nhiệt độ, độ ẩm, khói, loadcell; vượt ngưỡng → sự cố →
  chuông tại chỗ + email cảnh báo có hàng chờ bền vững (mất SMTP vẫn không mất cảnh báo).
- **Trí tuệ nhân tạo chạy cục bộ (Ollama)**: trợ lý hỏi–đáp bám dữ liệu thật, bản tin
  đầu ngày, dự báo cạn kho, bóc tách mô tả tình huống bằng giọng nói (PhoWhisper).
- **Hoạt động khi mất mạng**: điện thoại giữ bản lưu đã mã hóa; desktop giữ hàng chờ
  và gửi lại idempotent khi có kết nối; định tuyến OSRM chạy trong mạng nội bộ.

---

## 3. Tài khoản dùng thử

> Đây là tài khoản **dữ liệu mẫu**, mật khẩu cố tình đơn giản để trình diễn. Toàn bộ
> do lệnh seed tạo ra và **mọi mật khẩu đã được kiểm chứng bằng đăng nhập thật** qua
> `POST /api/auth/login`.

Hệ thống chỉ có **ba vai**: quản trị xã · phụ trách kho · đội cứu hộ.
Người giữ kho thôn kiêm luôn việc báo tình huống của thôn mình.

### 3.1. Bốn tài khoản chính để trình diễn

| Tài khoản | Mật khẩu | Vai | Phạm vi |
|---|---|---|---|
| `admin` | `admin123@` | Quản trị xã | Toàn xã |
| `staff` | `staff123` | Phụ trách kho | Kho xã Đồng Xuân |
| `rescue` | `rescue123` | Đội cứu hộ | Toàn xã |
| `iot` | `iot123456` | Thiết bị IoT (app desktop) | Kho trung tâm |

**Lưu ý:** mọi tài khoản đều đăng nhập bằng **tên đăng nhập trần**, không phải một
địa chỉ email — `admin`, `staff`, `longchau`, không kèm hậu tố tên miền.

### 3.2. Mười bảy tài khoản phụ trách kho thôn

Tất cả cùng vai **phụ trách kho**, mật khẩu chung `truongthon123`. Tên đăng nhập là
tên thôn bỏ dấu viết liền, nên nhìn là biết ai giữ kho nào.

| Tài khoản | Kho phụ trách | | Tài khoản | Kho phụ trách |
|---|---|---|---|---|
| `kydu` | Kho thôn Kỳ Đu | | `phuson` | Kho thôn Phú Sơn |
| `longbinh` | Kho thôn Long Bình | | `tanan` | Kho thôn Tân An |
| `longchau` | Kho thôn Long Châu | | `tanbinh` | Kho thôn Tân Bình |
| `longha` | Kho thôn Long Hà | | `tanhoa` | Kho thôn Tân Hòa |
| `longhoa` | Kho thôn Long Hòa | | `tanphu` | Kho thôn Tân Phú |
| `longmy` | Kho thôn Long Mỹ | | `tanphuoc` | Kho thôn Tân Phước |
| `longthach` | Kho thôn Long Thạch | | `tanvinh` | Kho thôn Tân Vinh |
| `longthang` | Kho thôn Long Thăng | | `triemduc` | Kho thôn Triêm Đức |
| `phuochue` | Kho thôn Phước Huệ | | | |

Tổng cộng **21 tài khoản**: 1 quản trị + 1 hiện trường + 18 phụ trách kho (1 kho
trung tâm + 17 kho thôn) + 1 tài khoản thiết bị IoT.

### 3.3. Dùng tài khoản nào ở đâu

| Nơi làm việc | Thiết bị | Tài khoản |
|---|---|---|
| Quản trị xã | Máy tính (web) | `admin` |
| **Kho trung tâm** | Máy tính riêng: web **và** app IoT | `staff@` cho web · `iot@` cho app desktop |
| **Kho thôn** (17 kho) | Điện thoại (APK) | `<tênthôn>@` |
| Đội cứu hộ | Điện thoại (APK) | `rescue@` |

**Vì sao kho trung tâm cần hai tài khoản trên cùng một máy:** mỗi lượt đăng nhập xoay
khóa phiên của tài khoản đó. Web và app IoT dùng chung một tài khoản sẽ đá nhau — web
đăng nhập là app IoT rớt phiên, số liệu đã chỉnh nằm lại hàng chờ và không bao giờ
gửi đi. App IoT là một **thiết bị**, cho nó danh tính riêng vừa tránh va chạm vừa
giúp nhật ký phân biệt số liệu do thiết bị bơm với thao tác do người làm.

### 3.4. Ba điều dễ vấp khi trình diễn

**① Một nhiệm vụ thường cần hai tài khoản kho.** Hệ thống phân bổ vật tư theo kho gần
điểm sự cố, nên một nhiệm vụ hay trải trên cả kho trung tâm lẫn kho thôn. Nếu chỉ
đăng nhập `staff@`, nhiệm vụ sẽ dừng ở *Chờ kho chuẩn bị* và **không bao giờ tới
trạng thái Sẵn sàng**.
*Ví dụ đã kiểm chứng:* một báo cáo ngập tại thôn Phú Hòa chia 5 loại vật tư thành
**1 ở kho trung tâm** và **4 ở Kho thôn Long Châu** — phải đăng nhập thêm
`longchau` mới hoàn tất được.

**② Lần gọi AI đầu tiên có thể lỗi.** Mô hình chạy ngay trên máy; lần nạp đầu (khi mô
hình còn "nguội") mất hơn 15 giây, vượt thời gian chờ của máy chủ nên trả lỗi `503`
hoặc rơi về bản mẫu. **Hãy hỏi trợ lý một câu bất kỳ trước buổi chấm để làm nóng.**
Từ lần thứ hai chỉ khoảng 6 giây.

**③ Đăng xuất trên điện thoại xóa sạch bản lưu ngoại tuyến.** Nếu định xem chế độ mất
mạng, đừng đăng xuất trước đó.

---

## 4. Dùng thử nhanh trên bản demo online (15 phút)

Không cần cài gì. Chỉ cần trình duyệt.

**Bước 0 — Kiểm tra máy chủ còn sống.** Mở <https://ungphonhanh.life/api/health>,
phải thấy `"status":"ok"`. Nếu không, xem §1.1.

**Bước 1 — Đăng nhập.** Mở <https://ungphonhanh.life>, đăng nhập:

```
Tài khoản: admin
Mật khẩu:  admin123@
```

**Bước 2 — Đi lần lượt 10 màn hình sau.** Đây là bộ smoke test nhóm dùng trước mỗi
buổi trình diễn; nếu S01–S05 chạy đúng thì hệ thống đang khỏe.

| # | Mở màn hình | Phải thấy |
|---|---|---|
| S01 | Đăng nhập `admin` | Vào dashboard, kho mặc định **Kho xã Đồng Xuân** |
| S02 | **Tổng quan** | Trạng thái vận hành + 6 mặt đánh giá + lý do + việc cần làm |
| S03 | **Vật tư** | Danh sách lô, vị trí kệ, số lượng, tình trạng, hạn dùng |
| S04 | **Theo dõi, dự báo** | Dự báo cho 17 mặt hàng + cảnh báo hạn dùng |
| S05 | **Trợ lý AI** → hỏi `Kho sẵn sàng đáp ứng được chưa?` | Trả lời dựa trên dữ liệu thật, **không** báo `Failed to fetch` |
| S06 | **Sự cố** | 1 lỗi cảm biến đang mở + 1 sự cố bảo quản đã xử lý |
| S07 | **Mượn, trả** | 2 phiếu đang mở: áo phao và bộ đàm |
| S08 | **Bản đồ kho** | 18 kho; 12 kho thôn hiển thị `chưa ghim` tọa độ |
| S09 | **Báo cáo tháng** | Báo cáo kho thôn Long Hà đang chờ duyệt |
| S10 | **Tài khoản** | 21 tài khoản; chỉ quản trị xã thấy được mục này |

**Bước 3 — Thử phân quyền (điểm đáng chấm).** Đăng xuất, đăng nhập lại bằng
`rescue` / `rescue123`. Mục **Tài khoản** và **Nhật ký** biến mất.
Quan trọng hơn: đây không phải chỉ ẩn nút — gọi thẳng API tương ứng cũng bị **chặn
403** ở máy chủ.

---

## 5. Hướng dẫn sử dụng web vận hành

### 5.1. Bản đồ giao diện

Thanh điều hướng chia ba nhóm; mục nào hiện ra phụ thuộc vai của tài khoản đang đăng nhập.

**Nhóm Điều hành**

| Mục | Đường dẫn | Làm gì ở đây |
|---|---|---|
| Tổng quan | `/readiness` | Mức sẵn sàng vận hành, các vướng mắc và việc cần xử lý |
| Điều phối cứu hộ | `/mission` | Ghi nhận tình huống, chỉ chỗ xảy ra sự việc để hệ thống tính nhu cầu |
| Nhiệm vụ | `/missions` | Theo dõi nhiệm vụ đang chạy, mở chi tiết từng nhiệm vụ |
| Theo dõi, dự báo | `/insights` | Nguy cơ thiếu hàng, hết hạn, nhu cầu điều chuyển giữa các kho |

**Nhóm Nghiệp vụ kho**

| Mục | Đường dẫn | Làm gì ở đây |
|---|---|---|
| Vật tư | `/inventory` | Tra cứu từng lô, vị trí lưu trữ, số lượng hiện có |
| Kiểm kê | `/stocktake` | Đối chiếu số đếm thực tế với số đang ghi nhận |
| Mượn, trả | `/loan` | Vật tư đã cho mượn và số lượng được hoàn trả |
| Sự cố | `/incident` | Ghi nhận và xử lý vấn đề ảnh hưởng vật tư/hoạt động kho |
| Báo cáo tháng | `/report` | Tiếp nhận báo cáo từ thôn, kiểm tra, cập nhật tồn kho |
| Bản đồ kho | `/map` | Vị trí kho xã, kho thôn; ghim tọa độ khi cần |

**Nhóm Quản trị** (chỉ quản trị xã)

| Mục | Đường dẫn | Làm gì ở đây |
|---|---|---|
| Cảm biến thử nghiệm | `/simulator` | Theo dõi dữ liệu mô phỏng trước khi nối thiết bị thật |
| Tài khoản | `/users` | Cấp quyền cho phụ trách kho, đội cứu hộ, quản trị |
| Nhật ký | `/audit` | Tra cứu những thay đổi quan trọng đã thực hiện |

Ngoài ra có **trợ lý AI dạng nút nổi** ở góc màn hình, dùng được ở mọi trang.

### 5.2. Luồng chính: từ tình huống đến giao hàng

Đây là luồng đáng xem nhất, đi qua cả ba vai. **Cần mở ít nhất hai cửa sổ trình duyệt**
(một cửa sổ ẩn danh) để đăng nhập hai tài khoản song song.

**① Báo tình huống** — vai *phụ trách kho thôn* hoặc *quản trị*
Vào **Điều phối cứu hộ**, mô tả tình huống bằng lời thường, ví dụ:
> *"Ngập tại thôn Phú Sơn, khoảng 40 hộ bị cô lập, cần nước uống và áo phao."*

Hệ thống bóc tách loại tình huống, số người ảnh hưởng và địa điểm, rồi ghim lên bản đồ.

**② Lập và phát hành phương án** — vai *quản trị xã*
Hệ thống tính nhu cầu vật tư theo số người và loại tình huống, đối chiếu tồn kho thực
tế, phân bổ theo kho gần điểm sự cố. Xem lại từng dòng, chỉnh nếu cần, rồi **Điều phối**.

> **Điểm cần chấm:** số lượng vật tư do **máy chủ tính từ dữ liệu tồn kho thật**, AI
> chỉ diễn giải bằng lời. Nếu tồn kho không đủ, hệ thống nói rõ thiếu bao nhiêu chứ
> không làm tròn cho đẹp.

**③ Kho chuẩn bị theo từng mã vật tư** — vai `staff@` và/hoặc kho thôn liên quan
Phiếu yêu cầu hiện **ngay lập tức** qua WebSocket (không cần tải lại trang) ở đúng kho
được phân bổ. Mỗi mã vật tư đi qua bốn mốc riêng: *tiếp nhận* → *đã soạn xong* → *người
đi lấy ký nhận*; nếu không đủ thì kho **báo chênh lệch** và quản trị duyệt hoặc bác.
Chỉ khi **tất cả** kho liên quan ký nhận xong, nhiệm vụ mới chuyển sang *Sẵn sàng*.
→ Nhớ mục §3.4 ①: thường phải đăng nhập thêm tài khoản kho thôn.

> **Điểm cần chấm:** "kho đã soạn" và "hàng đã rời kho" là **hai mốc tách bạch**, vì
> khoảng giữa hai mốc đó chính là nơi hàng bị thiếu. Bảng tiến độ tách theo từng kho
> chứ không gộp một con số, để điều phối biết phải gọi điện nhắc kho nào.

**④ Giao hàng và đóng nhiệm vụ** — vai `rescue@`
Người đi giao báo **kết quả thực tế**, một trong ba: giao đủ, giao một phần, hoặc không
giao được. Giao thất bại thì vật tư **tự hoàn về kho trong cùng một giao dịch** chứ
không biến mất.

> **Vì sao bắt buộc có bước này:** không có nó thì nhiệm vụ nằm mãi ở *Sẵn sàng* — vật
> tư đã trừ khỏi kho mà không ai biết hàng tới nơi hay chưa.

Vòng đời trạng thái: `DRAFT → PENDING_WAREHOUSE → READY → COMPLETED`, cộng nhánh
`CANCELLED` khi quản trị huỷ trước lúc có kho nào xuất vật tư. Gọi sai vai hoặc sai
trạng thái đều bị máy chủ trả **403**.

> Đội cứu hộ **không** tham gia bước phát hành: xã gửi phương án thẳng tới
> kho. Các trạng thái `PENDING_RESCUE` / `REJECTED` còn trong schema là dấu vết của
> phiên bản trước và không còn được tạo mới.

### 5.3. Bộ câu hỏi thử trợ lý AI

Hỏi lần lượt 10 câu sau. Chín câu đầu phải trả lời **dựa trên dữ liệu thật trong kho**;
câu thứ mười **phải bị từ chối** vì nằm ngoài phạm vi.

```
1.  Kho sẵn sàng đáp ứng được chưa?
2.  Còn bao nhiêu áo phao người lớn có thể cấp ngay?
3.  Còn bao nhiêu áo phao trẻ em có thể cấp ngay?
4.  Kho còn bao nhiêu nước uống đóng chai?
5.  Còn bao nhiêu gạo cứu trợ?
6.  Còn bao nhiêu bộ sơ cứu có thể cấp ngay?
7.  Vật tư nào có hạn dùng gần nhất?
8.  Kho đang có sự cố gì?
9.  Ba ngày tới có cảnh báo mưa lớn không?
10. Thủ đô nước Pháp là gì?     ← phải từ chối / báo ngoài phạm vi
```

> Trợ lý **không được phép bịa số**. Có thể đối chiếu con số nó trả lời với màn hình
> **Vật tư** để kiểm chứng.

### 5.4. Mười một ca kiểm thử tính năng

Bộ đầy đủ nằm trong [docs/HUONG-DAN-TEST.md §6](docs/HUONG-DAN-TEST.md). Tóm tắt để
Ban giám khảo chọn nhanh cái muốn xem:

| ID | Tính năng | Điểm cần chứng minh |
|---|---|---|
| T01 | Đăng nhập và phân quyền | Sai vai → API trả **403**, không chỉ ẩn nút |
| T02 | 17 thôn và ghim tọa độ | Ghim xong tải lại trang vẫn còn; đủ 17 tên thôn |
| T03 | Mức sẵn sàng vận hành | Có vướng mắc nghiêm trọng thì **chặn điều phối** dù điểm cao |
| T04 | Kho vật tư và kiểm kê | Ghi đè chênh lệch → tồn đổi và có hậu kiểm |
| T05 | Mượn, trả | Tổng hoàn/hỏng/mất ≤ số nợ; mất làm giảm tồn thực |
| T06 | Sự cố kho | Vòng đời Tiếp nhận → Xử lý xong, có hậu kiểm |
| T07 | Dự báo ngày thường | Dự báo cạn kho từ lịch sử; lỗi thời tiết không làm sập trang |
| T08 | Trợ lý AI | Chín câu bám dữ liệu thật, câu ngoài phạm vi bị từ chối |
| T09 | Điều phối vật tư | Số liệu do **máy chủ** tính, AI chỉ diễn giải |
| T10 | Luồng liên vai trò | Kho chuẩn bị theo từng vật tư; sai vai → 403 |
| T11 | Báo cáo tháng | Duyệt/từ chối cập nhật trạng thái và tồn kho sau duyệt |

Kịch bản chi tiết theo từng luồng nghiệp vụ (có phần "vì sao hệ thống phải xử sự như
vậy" và các ca biên để thử phá): thư mục [Cachtest/](Cachtest/), 17 file.

---

## 6. Ứng dụng điện thoại Android (APK)

### 6.1. Tải và cài

| Thông tin | Giá trị |
|---|---|
| Tải về | <https://github.com/khoidev2001/safestock-x/releases> → file `app-release.apk` |
| Phiên bản | `0.5.0` (`versionCode = 5`) |
| Định danh gói | `vn.ungphonhanh.safestock` |
| Kích thước | ~84 MB |
| Android tối thiểu | 7.0 (API 24) |
| SHA-256 | `EC415126E26B4FC4F80B7A8825C5792B8DDCEE5F5A0EEFBE67960C33DA817CA2` |
| Chữ ký | APK Signature Scheme v2, RSA 4096-bit |
| Quyền xin | Camera (quét QR) và micro (ghi âm báo cáo). Không có quyền vẽ đè, lưu trữ hay sinh trắc học |

Kiểm tra file sau khi tải (PowerShell):

```powershell
Get-FileHash .\app-release.apk -Algorithm SHA256
```

Cài trên máy: bật **Cài đặt từ nguồn không xác định** cho trình duyệt/trình quản lý
file, rồi mở file APK. Hoặc cài qua cáp:

```powershell
adb install -r app-release.apk
```

### 6.2. Sử dụng

App **luôn gọi `https://ungphonhanh.life`** — không có ô nhập địa chỉ máy chủ. Đây là
chủ ý: cùng một địa chỉ chạy được cả qua Internet lẫn qua mạng nội bộ của xã khi mất
Internet (§1.2). Vì vậy app chỉ dùng được khi máy chủ demo đang bật.

Đăng nhập bằng tài khoản ở §3. App tự đổi giao diện theo vai:

| Vai | Giao diện |
|---|---|
| Đội cứu hộ (`rescue@`) | Lệnh · Báo cáo · Cảnh báo — **không có** nghiệp vụ kho |
| Phụ trách kho (`staff@`, `<tênthôn>@`) | Nghiệp vụ kho đầy đủ, kiêm việc báo tình huống của thôn |

Các việc đáng thử:

1. **Nhận lệnh realtime** — để app mở ở tab *Lệnh*, trên web bấm phát hành một nhiệm
   vụ. Thông báo hiện **ngay**, không cần tải lại, kèm nhãn **MỚI**. Bấm vào để xem
   danh sách vật tư cần/cấp/thiếu. Sau khi kho chuẩn bị xong, chính màn hình này là
   nơi đội **đóng nhiệm vụ** bằng cách báo kết quả giao (đủ · một phần · không giao được).
2. **Báo cáo bằng giọng nói** — bấm nút ghi âm, nói mô tả tình huống bằng tiếng Việt.
   App ghi âm bằng mã native Android (WAV PCM 16-bit, 16 kHz, tối đa 60 giây), gửi lên
   PhoWhisper, rồi **điền chữ nhận dạng vào ô mô tả**. App **không tự gửi báo cáo** —
   người dùng luôn đọc lại, sửa hoặc gõ tay được trước khi gửi.
3. **Quét QR theo lô** — quét nhãn dán trên thùng hàng để tra lô, nhập, xuất, chuyển kệ.
4. **Chế độ mất mạng** — đang đăng nhập thì bật chế độ máy bay. App hiển thị dữ liệu
   đã lưu kèm **dấu thời gian cũ**, và **khóa toàn bộ thao tác ghi**. Đây là chủ ý:
   thà nói thẳng "số liệu này cũ" còn hơn báo thành công giả trên một thao tác chưa
   tới được máy chủ.
   → Nhớ §3.4 ③: đăng xuất sẽ xóa sạch bản lưu này.

Bản lưu ngoại tuyến trên APK được **mã hóa AES-256-GCM**, khóa nằm trong Android
Keystore và không xuất ra JavaScript.

### 6.3. Tự build APK từ mã nguồn (tùy chọn)

Cần JDK 17 và Android SDK:

```powershell
# Đặt endpoint trước khi build
"EXPO_PUBLIC_API_BASE_URL=https://ungphonhanh.life" | Out-File apps/mobile/.env.local -Encoding utf8

$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

pnpm --filter @safestock/mobile android:keystore   # chỉ chạy một lần nếu chưa có khóa
pnpm --filter @safestock/mobile android:release
```

Kết quả: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

Nếu chỉ muốn xem giao diện mà không build APK, có bản chạy trên trình duyệt (chỉ dùng
để phát triển, không thay thế APK):

```powershell
pnpm --filter @safestock/mobile web
```

---

## 7. Ứng dụng desktop — giả lập cảm biến kho

App Electron này đóng vai **thiết bị IoT đặt tại kho trung tâm**: người vận hành xem
số đọc nhiệt độ, độ ẩm, khói, loadcell và xác nhận gửi về máy chủ.

Chỉ chạy được từ mã nguồn (chưa có bản tải sẵn), và **cần bật một cờ an toàn trước**:

```powershell
# Trong .env ở thư mục gốc, đặt:
SIMULATION_MUTATION_ENABLED=true
# rồi khởi động lại backend, sau đó:
pnpm desktop:dev
```

> Mặc định cờ này là `false`. Nó **chỉ chi phối luồng mô phỏng** — thiết bị phần cứng
> đã xác thực không bao giờ bị nó làm câm. Bật lên nghĩa là dữ liệu mô phỏng sẽ **thay
> đổi thật** cơ sở dữ liệu đang dùng: mức sẵn sàng, sự cố và email cảnh báo đều bị
> ảnh hưởng. Đặt lại `false` và khởi động lại backend khi xem xong.

**Kịch bản đáng xem:**

1. **Đăng nhập** — Host: `localhost:3100` (khi tự cài) hoặc `ungphonhanh.life`.
   Tài khoản: `iot` / `iot123456`.
2. Kéo thanh trượt **Nhiệt độ** vượt `35°C`, ví dụ `46°C`.
   → Kỳ vọng: chỉ hiện nhãn *"đã chỉnh, chưa gửi"*. **Web và cơ sở dữ liệu chưa có gì
   thay đổi** — kéo thanh trượt chỉ sửa bản nháp cục bộ.
3. Bấm **Xác nhận và gửi**.
   → App lưu vào hàng chờ **trước** khi gọi API. Web cập nhật trong vòng 10 giây: số
   đọc mới, dòng thời gian, mức sẵn sàng đổi, sự cố mới được tạo.
   → **Chuông tại chỗ kêu ngay** theo ngưỡng đã lưu sẵn, kể cả khi việc gửi còn đang
   chờ. Chuông chỉ dừng khi bấm **Tắt chuông**; thao tác tắt được ghi vào lịch sử sự cố.
4. **Thử mất mạng** — ngắt đường tới máy chủ, đổi một thanh trượt, bấm **Xác nhận và
   gửi**. Thao tác hiện *"chờ gửi"*, chuông vẫn kêu nếu vượt ngưỡng. Nối lại mạng →
   **đúng một** bản ghi xuất hiện (idempotent, không nhân đôi).
5. **Thử mất email** — tắt SMTP/Internet nhưng giữ backend chạy, xác nhận một giá trị
   vượt ngưỡng. Sự cố vẫn được tạo, email nằm ở hàng chờ trạng thái *chờ/thử lại*.
   Khôi phục SMTP → email được gửi, và trong nội dung ghi rõ **ba mốc thời gian khác
   nhau**: lúc người vận hành phát hiện, lúc máy chủ nhận, lúc email được gửi.

> Mốc thứ ③ là điểm thiết kế quan trọng: một email cảnh báo đến muộn 2 giờ mà không
> ghi giờ phát hiện thì rất dễ bị hiểu nhầm là sự cố vừa mới xảy ra.

Đóng gói bản chạy độc lập (tùy chọn): `pnpm --filter @safestock/desktop package`
→ `apps/desktop/dist`.

---

## 8. Cài đặt đầy đủ trên máy của Ban giám khảo

Hướng dẫn cho **Windows + PowerShell**. Toàn bộ lệnh copy-paste chạy được, chạy từ
thư mục gốc repository trừ khi ghi rõ thư mục khác.

### 8.1. Cần cài trước

| Công cụ | Phiên bản | Bắt buộc? |
|---|---|---|
| Git | bất kỳ | ✅ |
| Node.js | **20 trở lên** | ✅ |
| pnpm | **10 trở lên** | ✅ |
| Docker Desktop | Linux containers | ✅ (chạy PostgreSQL + Redis) |
| Python | **3.11 trở lên** | ⬜ chỉ khi chấm phần AI |
| Ollama + 2 model | `qwen3.5:4b`, `nomic-embed-text` | ⬜ chỉ khi chấm phần AI |

Kiểm tra nhanh:

```powershell
git --version; node --version; pnpm --version; docker version; python --version; ollama --version
```

Nếu máy chưa có pnpm, bật Corepack đi kèm Node.js:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
```

> Không cài AI vẫn chạy được toàn bộ phần web và nghiệp vụ kho — chỉ các tính năng AI
> báo *"tạm thời không phản hồi"*.

### 8.2. Tải mã nguồn và cài dependency

```powershell
git clone https://github.com/khoidev2001/safestock-x.git
cd safestock-x
pnpm install
```

`pnpm install` mất khoảng 5–10 phút lần đầu.

### 8.3. Tạo file cấu hình

```powershell
Copy-Item .env.example .env
notepad .env
```

Trong `.env`, **bắt buộc đổi ba giá trị sau** trước khi chạy:

| Biến | Đổi thành gì |
|---|---|
| `POSTGRES_PASSWORD` | Một mật khẩu bất kỳ — và sửa **cùng mật khẩu đó** trong `DATABASE_URL` |
| `JWT_ACCESS_SECRET` | Một chuỗi ngẫu nhiên dài |
| `JWT_REFRESH_SECRET` | Một chuỗi ngẫu nhiên dài **khác** |

Giữ nguyên các giá trị còn lại là chạy được. Riêng ba biến này nên để mặc định khi
chấm: `SIMULATION_MUTATION_ENABLED=false`, `AI_PROVIDER=ollama`, `ALERT_EMAIL_ENABLED=false`.

Sinh nhanh hai chuỗi bí mật:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Sau đó sao chép file cấu hình sang thư mục backend (Prisma đọc bản này):

```powershell
Copy-Item .env apps/backend/.env -Force
```

> Mỗi lần sửa cấu hình cơ sở dữ liệu trong `.env`, phải chạy lại lệnh sao chép trên.

**Các cổng mặc định** — chỉ đổi nếu máy đang bị chiếm cổng:
PostgreSQL `55433` · Redis `16379` · API `3100` · Web `3200` · AI `8000`.

> Redis dùng cổng `16379` chứ không phải `6379`: trên Windows, cổng `56380` từng rơi
> vào dải TCP hệ điều hành giữ riêng và làm backend treo lúc khởi động. Cổng `16379`
> đã kiểm chứng ổn định.

### 8.4. Bật PostgreSQL và Redis

Mở Docker Desktop, chờ Docker Engine sẵn sàng rồi chạy:

```powershell
pnpm infra:up
docker ps
```

Phải thấy hai container đang chạy: `safestock_postgres` và `safestock_redis`.
Xem log khi có lỗi: `pnpm infra:logs`.

### 8.5. Tạo cấu trúc dữ liệu và nạp dữ liệu mẫu

```powershell
pnpm --filter @safestock/backend prisma:generate
pnpm be:db
```

> ⚠️ `pnpm be:db` gọi hàm xóa sạch cơ sở dữ liệu rồi dựng lại. Chỉ chạy trên cơ sở dữ
> liệu mới/dùng để demo.

**Kết quả seed đúng** — đây là mốc đối chiếu cho mọi bước test về sau:

| Dữ liệu | Số lượng | | Dữ liệu | Số lượng |
|---|---:|---|---|---:|
| Tổ chức | 1 | | Mã vật tư | 17 |
| Kho trung tâm | 1 | | Lô hàng | 126 |
| Kho thôn | 17 | | Bản kiểm kê | 126 |
| Người dùng | 20 | | Phiếu mượn đang mở | 2 |
| Thiết bị ảo | 68 | | Sự cố | 2 |
| | | | Giao dịch lịch sử | 190 |

Trong 17 kho thôn, seed chỉ gán tọa độ đã xác minh cho 5 thôn (Kỳ Đu, Phước Huệ, Tân
Bình, Phú Sơn, Triêm Đức); **12 thôn còn lại để trống có chủ ý** — quản trị dùng màn
hình bản đồ để ghim sau. Seed không gán tọa độ suy đoán.

**Tạo thêm tài khoản thiết bị IoT** (cần cho app desktop ở §7 — đây là tài khoản thứ 21):

```powershell
pnpm --filter @safestock/backend exec ts-node prisma/create-iot-account.ts
```

### 8.6. Chuẩn bị AI chạy cục bộ *(tùy chọn)*

```powershell
ollama pull qwen3.5:4b
ollama pull nomic-embed-text
ollama list

cd apps/ai-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\build_knowledge_index.py --check
cd ..\..
```

> Chỉ mục tri thức `knowledge_index.json` **đã có sẵn trong repository**, không cần
> vector hóa lại corpus khi cài máy mới. Nhưng model `nomic-embed-text` vẫn bắt buộc
> ở runtime để vector hóa **câu hỏi** của người dùng.

### 8.7. Chạy hệ thống

Mở **4 cửa sổ PowerShell** tại thư mục gốc:

```powershell
# Cửa sổ 1 — Ollama (bỏ qua nếu đã chạy dạng dịch vụ Windows ở cổng 11434)
ollama serve

# Cửa sổ 2 — Dịch vụ AI
pnpm ai:dev

# Cửa sổ 3 — Máy chủ API
pnpm be:dev

# Cửa sổ 4 — Web
pnpm fe:dev
```

> Cách nhanh hơn: `pnpm dev:all` chạy tất cả trong một lệnh.

**Kiểm tra cả cụm đã sống:**

```powershell
Invoke-RestMethod http://localhost:3100/api/health    # status = ok, database + redis = up
Invoke-RestMethod http://localhost:8000/health        # status = ok, provider = ollama
Invoke-WebRequest  http://localhost:3200 -UseBasicParsing   # HTTP 200
```

Mở giao diện: **<http://localhost:3200>** — đăng nhập bằng tài khoản ở §3.

Sau đó đi tiếp theo §4 (smoke test), §5 (luồng nghiệp vụ), §7 (desktop).

### 8.8. Dừng hệ thống

Nhấn `Ctrl+C` trong các cửa sổ ứng dụng. Khi không cần cơ sở dữ liệu nữa:

```powershell
pnpm infra:down
```

Lệnh này dừng container nhưng **giữ nguyên dữ liệu** trong Docker volume.

### 8.9. Dựng định tuyến offline OSRM *(tùy chọn, chỉ khi chấm phần định tuyến)*

```powershell
pnpm osrm:fetch
pnpm osrm:build -- --source infrastructure/osrm/data/dong-xuan.osm --graph-version dong-xuan-2026-08-07
pnpm osrm:up
pnpm osrm:verify-live
pnpm osrm:verify-offline      # chạy nghiệm thu với Docker --network none
```

Sau khi build, chép giá trị `LOCAL_ROUTING_GRAPH_VERSION` từ manifest vào `.env`.
`osrm:up` luôn chạy tiền kiểm và **không khởi động** nếu artifact thiếu hoặc sai checksum.

---

## 9. Kịch bản chấm đề xuất

### 9.1. 15 phút — chỉ xem giao diện và nghiệp vụ

Không cần cài gì. Dùng bản demo online (§4): đăng nhập `admin`, đi hết S01–S10, hỏi
trợ lý AI ba câu, thử đăng nhập lại bằng `rescue@` để thấy phân quyền đổi.

### 9.2. 45 phút — xem trọn luồng điều phối

Tự cài theo §8 (bỏ qua §8.6 nếu không chấm AI), rồi:

1. Smoke test §4 — 10 phút
2. Luồng điều phối §5.2, mở hai cửa sổ trình duyệt cho `admin` và `staff@` (nhớ có thể
   cần thêm tài khoản kho thôn) — 20 phút
3. Trợ lý AI §5.3, 10 câu — 10 phút
4. Thử phân quyền: đăng nhập `rescue@`, gọi thẳng một API quản trị → phải nhận 403 — 5 phút

### 9.3. 90 phút — chấm đầy đủ

Thêm vào kịch bản 45 phút:

5. App desktop §7 — bật cờ, kéo ngưỡng, xem chuông + sự cố + email hàng chờ — 20 phút
6. App điện thoại §6 — cài APK, nhận lệnh realtime, báo cáo bằng giọng nói, thử chế độ
   mất mạng — 15 phút
7. Bộ kiểm thử tự động §10 — 10 phút
8. Đặt lại dữ liệu §11 và xác nhận về đúng mốc ban đầu — 5 phút

---

## 10. Chạy bộ kiểm thử tự động

Phần này chấm **chất lượng mã nguồn**, không cần mở giao diện. Chạy tại thư mục gốc.

### 10.1. Máy chủ API

```powershell
pnpm --filter @safestock/backend exec jest --runInBand    # unit test
pnpm --filter @safestock/backend build                    # build production
```

Kỳ vọng: **100 bộ test / 588 test** đều PASS.

> ⚠️ Dùng `exec jest`, **không** dùng `test -- --runInBand`: pnpm 10.32.1 chuyển tiếp
> `--` thành tham số của jest, jest hiểu nhầm là mẫu đường dẫn rồi báo *"No tests
> found"* và thoát với mã lỗi — rất dễ bị hiểu nhầm là dự án hỏng.

Bộ e2e chạy riêng (7 bộ / 58 test, cần PostgreSQL sống; tự dọn dữ liệu của nó, không
đụng dữ liệu mẫu):

```powershell
pnpm --filter @safestock/backend test:e2e
```

### 10.2. Web

```powershell
pnpm --filter @safestock/frontend exec tsc --noEmit       # kiểm tra kiểu
pnpm --filter @safestock/frontend build                   # build production
pnpm --filter @safestock/frontend test:mission-inbox
pnpm --filter @safestock/frontend test:map-marker-state
```

### 10.3. Điện thoại

```powershell
pnpm --filter @safestock/mobile test:state
pnpm --filter @safestock/mobile test:resolution
```

### 10.4. Desktop

```powershell
pnpm --filter @safestock/desktop test:state
pnpm --filter @safestock/desktop test:queue
pnpm --filter @safestock/desktop test:login-error
```

### 10.5. Gói dùng chung, lint, định dạng

```powershell
pnpm --filter @safestock/shared-types test:coordination
pnpm lint            # eslint toàn workspace
pnpm format:check    # prettier --check
```

### 10.6. Dịch vụ AI

```powershell
cd apps/ai-service
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
cd ..\..
```

Tám nhóm test: RAG trợ lý, bản tin, ý định cập nhật hiện trường, tri thức, embedding
Ollama, xếp hạng ngữ nghĩa, phân tích tình huống, nhận dạng giọng nói. Một số test cần
Ollama đang chạy; nếu Ollama tắt thì các test đó có thể bỏ qua/thất bại **có chủ ý** —
đọc thông báo pytest để phân biệt.

> ⚠️ Phải chạy pytest **từ trong `apps/ai-service`**, không phải thư mục gốc, nếu không
> sẽ gặp `ModuleNotFoundError: No module named 'main'` do sai thư mục làm việc.

### 10.7. Định tuyến offline

```powershell
pnpm osrm:test
```

---

## 11. Đặt lại dữ liệu về trạng thái ban đầu

Các thao tác ghim tọa độ, kiểm kê, mượn–trả, xử lý sự cố, duyệt báo cáo, tạo nhiệm vụ
đều **thay đổi dữ liệu thật**. Để quay lại mốc ban đầu:

```powershell
pnpm --filter @safestock/backend seed
```

Lệnh này chỉ nạp lại dữ liệu mẫu, không cần dựng lại cấu trúc. Sau khi chạy phải quay
về đúng: 18 kho, 12 thôn chưa ghim tọa độ, 2 phiếu mượn đang mở, 2 sự cố, không còn
nhiệm vụ test.

Nếu vừa chạy `seed` thì tài khoản `iot@` bị xóa — tạo lại bằng lệnh ở §8.5.

---

## 12. Lỗi thường gặp và cách xử lý

| Triệu chứng | Cách xử lý |
|---|---|
| `https://ungphonhanh.life` mở được nhưng đăng nhập báo lỗi mạng | Máy chủ demo đang tắt. Kiểm tra `/api/health` (§1.1) hoặc tự cài theo §8 |
| `/api/health` trả `degraded` | `docker ps`; xem `docker logs safestock_postgres` và `docker logs safestock_redis`; kiểm tra cổng trong `.env` |
| Web báo không kết nối được | `Get-NetTCPConnection -LocalPort 3100 -State Listen`; `Invoke-RestMethod http://localhost:3100/api/health` |
| Trợ lý AI không phản hồi | `ollama list` (có `qwen3.5:4b` không?); `Invoke-RestMethod http://localhost:8000/health`; xem cửa sổ chạy `pnpm ai:dev` |
| Trợ lý AI lỗi đúng **lần đầu tiên** rồi sau đó chạy tốt | Bình thường — mô hình đang được nạp. Xem §3.4 ② |
| Cổng 3100/3200 bị chiếm | `Get-NetTCPConnection -LocalPort 3100,3200 -State Listen` → dừng đúng tiến trình cũ |
| Lỗi `EPERM` khi Prisma generate (Windows) | Dừng backend đang chạy rồi chạy lại `pnpm be:generate` — tiến trình Node đang khóa file thư viện |
| Backend treo lúc khởi động | Cổng Redis có thể trúng dải TCP Windows giữ riêng — dùng `16379` |
| pytest báo `ModuleNotFoundError: 'main'` | Chạy pytest **từ trong `apps/ai-service`**, không phải thư mục gốc |
| Nhiệm vụ đứng mãi ở *Chờ kho chuẩn bị* | Còn kho thôn chưa báo xong — xem §3.4 ① |
| Đăng nhập demo báo sai mật khẩu | Mật khẩu có thể đã bị quản trị đổi sau seed. Dùng chức năng đổi mật khẩu ở mục **Tài khoản**, **không** seed lại trên cơ sở dữ liệu có dữ liệu cần giữ |

Khi báo lỗi cho nhóm phát triển, xin ghi tối thiểu: **tài khoản · màn hình · dữ liệu
đã nhập · kết quả thực tế · kết quả mong đợi · log Console/Network**.

---

## 13. Phạm vi và giới hạn đã biết

Nhóm ghi rõ những điểm chưa hoàn tất thay vì để Ban giám khảo tự phát hiện:

- **Mật khẩu demo cố tình đơn giản.** Bộ tài khoản trong §3 chỉ dành cho dữ liệu mẫu.
  Trước khi vận hành thật phải đổi toàn bộ, đổi khóa JWT và mật khẩu PostgreSQL. Hệ
  thống chấp nhận mật khẩu từ 8 ký tự.
- **Demo online phụ thuộc một máy vật lý.** Web trên Vercel nhưng API, cơ sở dữ liệu
  và AI đều nằm trên máy chủ tại chỗ; máy tắt là phần API ngừng. Đây là hệ quả của
  thiết kế "chạy được khi mất Internet" — AI và dữ liệu phải ở trong xã.
- **Cờ `SIMULATION_MUTATION_ENABLED` mặc định tắt.** Luồng giả lập cảm biến ghi thẳng
  vào cơ sở dữ liệu đang dùng nên không được bật sẵn. App desktop chưa được coi là an
  toàn cho dữ liệu vận hành thật.
- **Chưa nghiệm thu xong bản diễn tập hai lượt.** Hạng mục còn lại: cài mới APK trên
  thiết bị thật (Galaxy S23 Ultra), chạy trong mạng nội bộ đã ngắt Internet ngoài, đủ
  bốn vai và desktop → cảnh báo → email. Chi tiết:
  [docs/COMPETITION-REHEARSAL.md](docs/COMPETITION-REHEARSAL.md).
- **Số lượng tồn trong dữ liệu mẫu là baseline mô phỏng**, không phải số kiểm kê hay
  định mức cấp phát chính thức của xã.
- **Điện thoại chỉ có đọc ngoại tuyến, không có ghi ngoại tuyến.** Mất mạng thì app
  hiển thị dữ liệu cũ kèm dấu thời gian và khóa mọi thao tác ghi — chủ ý, để không báo
  thành công giả.
- **Không public PostgreSQL, Redis, dịch vụ AI hay Ollama.** Chỉ web, `/api/*` và
  `/socket.io/*` được đi qua reverse proxy.

---

## 14. Tài liệu tham chiếu trong repository

| Tài liệu | Nội dung |
|---|---|
| [README.md](README.md) | Tổng quan kiến trúc monorepo và lệnh chính |
| [docs/TOAN-BO-CHUC-NANG-VA-LUONG-NGHIEP-VU.md](docs/TOAN-BO-CHUC-NANG-VA-LUONG-NGHIEP-VU.md) | **Tham chiếu đầy đủ**: mọi chức năng, luồng, thao tác, trạng thái và API |
| [docs/PRD.md](docs/PRD.md) | Phạm vi, trạng thái thật, backlog, định nghĩa hoàn thành |
| [docs/HUONG-DAN-TEST-TOAN-DIEN.md](docs/HUONG-DAN-TEST-TOAN-DIEN.md) | Bản test tất-tần-tật từ clone đến test mọi thành phần |
| [docs/HUONG-DAN-TEST-3-UNG-DUNG.md](docs/HUONG-DAN-TEST-3-UNG-DUNG.md) | Kịch bản xuyên web · điện thoại · desktop theo luồng công việc thật |
| [docs/HUONG-DAN-TEST.md](docs/HUONG-DAN-TEST.md) | 11 ca kiểm thử tính năng T01–T11 chi tiết |
| [Cachtest/](Cachtest/) | 17 file kịch bản theo từng luồng nghiệp vụ, có ca biên và cách kiểm chứng bằng lệnh |
| [docs/TAI-KHOAN-DEMO.md](docs/TAI-KHOAN-DEMO.md) | Danh sách tài khoản đầy đủ và cách phân bổ |
| [docs/SEED-DATASET.md](docs/SEED-DATASET.md) | Bộ dữ liệu mẫu xã Đồng Xuân và nguồn xác minh |
| [docs/HUONG-DAN-CAI-DAT-VA-CHAY.md](docs/HUONG-DAN-CAI-DAT-VA-CHAY.md) | Cài đặt chi tiết, build production, tự khởi động cùng Windows |
| [docs/HYBRID-DOMAIN-RUNBOOK.md](docs/HYBRID-DOMAIN-RUNBOOK.md) | Vận hành một tên miền hai đường đi |
| [docs/bao-cao-danh-gia-san-sang-du-thi.md](docs/bao-cao-danh-gia-san-sang-du-thi.md) | Báo cáo tự đánh giá mức sẵn sàng dự thi |
| [docs/BAN-GIAO-VAN-HANH.md](docs/BAN-GIAO-VAN-HANH.md) | Bàn giao cho người vận hành |
| [docs/KICH-BAN-DEMO.md](docs/KICH-BAN-DEMO.md) | Kịch bản trình diễn |

---

## Liên hệ

Khi cần bật máy chủ demo theo giờ hẹn hoặc cần hỗ trợ trong lúc chấm, xin liên hệ nhóm
phát triển qua thông tin trong hồ sơ dự thi.

*Tài liệu cập nhật ngày 07/08/2026. Mọi đường dẫn, tài khoản và số liệu trong file này
đã được kiểm chứng trực tiếp trên hệ thống tại thời điểm đó.*
