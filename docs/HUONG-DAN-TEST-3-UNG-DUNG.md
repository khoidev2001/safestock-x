# Hướng dẫn test ba ứng dụng: web, điện thoại, desktop

Tài liệu này đi theo **luồng công việc thật** chứ không liệt kê nút bấm. Mỗi
kịch bản nói rõ: ai làm, làm ở đâu, kỳ vọng thấy gì, và **vì sao** hệ thống phải
xử sự như vậy.

Mọi thông tin dưới đây được kiểm chứng trực tiếp trên mã nguồn và hệ thống đang
chạy tại thời điểm viết, không chép lại từ tài liệu cũ.

---

## 1. Chuẩn bị

### 1.1. Hạ tầng

```bash
pnpm infra:up                 # PostgreSQL + Redis trong Docker
pnpm be:db                    # sinh Prisma client, đẩy schema, seed dữ liệu mẫu
```

`be:db` **xoá sạch rồi dựng lại** toàn bộ dữ liệu. Không chạy trên cơ sở dữ liệu
đang vận hành thật.

Seed thành công sẽ in ra: 1 tổ chức, 21 người dùng, 18 kho, 17 thôn, 17 mã vật
tư, 126 lô, 19 thiết bị, 2 sự cố.

### 1.2. Chạy ứng dụng

| Ứng dụng | Lệnh | Địa chỉ |
|---|---|---|
| Backend | `pnpm be:dev` | http://localhost:3100 |
| Web | `pnpm fe:dev` | http://localhost:3200 |
| Desktop | `pnpm desktop:dev` | cửa sổ Electron |
| Điện thoại | cài `app-release.apk` | trỏ tới `https://ungphonhanh.life` |

Kiểm tra backend sống: `GET http://localhost:3100/api/health` phải trả
`{"status":"ok"}` kèm `database: up`, `redis: up`.

### 1.3. Tài khoản mẫu

| Tài khoản | Mật khẩu | Vai |
|---|---|---|
| `admin` | `admin123@` | Quản trị xã |
| `staff` | `staff123` | Phụ trách kho trung tâm |
| `rescue` | `rescue123` | Lực lượng hiện trường |
| `{tênthôn}` | `truongthon123` | Phụ trách kho thôn — ví dụ `phuson@`, `longchau@`, `triemduc@` |

Hệ thống chỉ còn **ba vai**. Vai "trưởng thôn" riêng đã bị bỏ: người giữ kho thôn
kiêm luôn việc báo tình huống của thôn mình, nên tách hai tài khoản chỉ thêm việc
đăng nhập chứ không thêm quyền kiểm soát nào.

### 1.4. Cờ cần bật để test cảm biến

Desktop chỉ gửi được số liệu khi `SIMULATION_MUTATION_ENABLED=true` trong `.env`.
Cờ này **chỉ chi phối luồng mô phỏng** — gateway phần cứng đã xác thực không bao
giờ bị nó làm câm.

---

## 2. Ai thấy gì

### 2.1. Web

| Mục | Quản trị xã | Phụ trách kho | Hiện trường |
|---|:---:|:---:|:---:|
| Tổng quan | ✅ | ✅ | — |
| Điều phối cứu hộ | ✅ | ✅ | ✅ |
| Theo dõi, dự báo | ✅ | ✅ | — |
| Trợ lý nổi (nút góc phải dưới) | ✅ | ✅ | — |
| Vật tư | ✅ | ✅ | — |
| Kiểm kê | ✅ | ✅ | — |
| Mượn, trả | ✅ | ✅ | — |
| Sự cố | ✅ | ✅ | ✅ |
| Báo cáo tháng | ✅ | ✅ | — |
| Bản đồ kho | ✅ | ✅ | — |
| Cảm biến thử nghiệm | ✅ | ✅ | — |
| Tài khoản | ✅ | — | — |
| Nhật ký | ✅ | — | — |

Hiện trường chỉ thấy **2 mục**. Đây là điều đáng kiểm: đăng nhập `rescue@` trên
web mà thấy nhiều hơn hai mục là phân quyền hỏng.

### 2.2. Điện thoại — đúng hai giao diện

Chọn tự động theo vai lúc đăng nhập.

| Vai | Các thẻ | Ghi chú |
|---|---|---|
| Hiện trường | Lệnh · Báo cáo · Cảnh báo | **Không có** nghiệp vụ kho |
| Phụ trách kho | Tổng quan · Sẵn sàng · Kho · Kiểm kê · Báo cáo · Cảnh báo | Kiêm việc báo tình huống |
| Quản trị xã | Kho | Chỉ để quét QR nhập/xuất tại kệ |

Hiện trường **không có** màn kho vì họ xem xét tình hình thực tế rồi gửi yêu cầu;
việc đối chiếu tồn và quyết định cho mượn thuộc người giữ kho.

### 2.3. Desktop

Đăng nhập bằng **`admin`** — chỉ vai này có quyền bơm số liệu mô phỏng. Đăng nhập
bằng `staff@` sẽ vào được nhưng không gửi được snapshot.

---

## 3. Luồng chính xuyên ba ứng dụng

Đây là kịch bản quan trọng nhất. Chạy trọn vẹn một lần là đã bao phủ phần lớn hệ
thống.

### Bước 1 — Hiện trường báo tình huống *(điện thoại)*

1. Đăng nhập `rescue`.
2. Vào thẻ **Báo cáo**.
3. Mô tả tình huống bằng **gõ tay** hoặc **bấm giữ micro** để nói tiếng Việt.
4. Nếu dùng giọng nói: kiểm tra chữ hiện ra khớp lời nói, **sửa lại nếu sai**, rồi mới gửi.

**Kỳ vọng:** gửi xong báo thành công. Nội dung phải do người xác nhận trước khi
gửi — hệ thống không tự gửi thẳng bản nhận dạng, vì máy nghe nhầm giữa mưa gió là
chuyện bình thường.

**Kiểm chéo:** đăng nhập `admin` trên web, vào **Sự cố**, thấy báo cáo vừa gửi.

### Bước 2 — Xã lập và phát hành phương án *(web, tài khoản `admin`)*

1. Vào **Điều phối cứu hộ**, mở báo cáo vừa nhận.
2. Nhập thông tin sự việc (loại, số người, thời lượng) để AI đề xuất phương án.
3. Xem danh sách vật tư đề xuất, rồi bấm **Duyệt và phát hành**.

**Kỳ vọng:** trạng thái chuyển sang **Chờ kho chuẩn bị**. Hệ thống sinh ra yêu cầu
vật tư **theo từng mã** cho từng kho liên quan.

**Case biên đáng thử:** phát hành một báo cáo **chưa lập phương án** → phải bị từ
chối. Không có phương án thì kho không biết chuẩn bị gì.

### Bước 3 — Kho chuẩn bị theo từng vật tư *(web, tài khoản `staff@`)*

1. Vào **Điều phối cứu hộ**, mở nhiệm vụ.
2. Với **từng mã vật tư**: bấm **Tiếp nhận**, rồi **Đã chuẩn bị**.
3. Nếu thiếu hoặc sai: bấm **Báo thiếu/sai** kèm ghi chú.

**Kỳ vọng:**
- Tồn kho giảm đúng phần đã cấp, **ngay khi** báo đã chuẩn bị.
- Bấm lại lần hai **không trừ kho lần nữa**.
- Chỉ khi kho **cuối cùng** xong thì nhiệm vụ mới chuyển **Sẵn sàng**.

**Vì sao chia theo từng mã:** một nhiệm vụ có thể lấy hàng từ nhiều kho. Nếu chuẩn
bị cả gói một lần thì kho A phải chờ kho B mới ghi nhận được phần việc của mình.

### Bước 4 — Hiện trường đi giao và báo kết quả *(điện thoại)*

1. Đăng nhập `rescue@`, vào thẻ **Lệnh**.
2. Nhiệm vụ ở trạng thái **Kho đã sẵn sàng · chờ giao**, có nút **Báo kết quả giao**.
3. Chọn một trong ba: **Giao đủ** · **Giao một phần** · **Không giao được**.

**Kỳ vọng theo từng lựa chọn:**

| Kết quả | Nhiệm vụ | Tồn kho |
|---|---|---|
| Giao đủ | Hoàn thành | giữ nguyên (hàng đã tới nơi) |
| Không giao được | Hoàn thành | **hoàn về kho** |
| Giao một phần | Hoàn thành | **không tự đụng**, chờ đối soát tay |

Giao một phần không tự sửa kho vì máy không biết phần nào đã giao, phần nào mang
về. Đoán ở đây là làm sai sổ sách.

**Case biên:** bấm báo kết quả **lần thứ hai** → phải bị từ chối, và **không hoàn
kho thêm lần nữa**.

---

## 4. Test theo từng ứng dụng

### 4.1. Web

#### Nghiệp vụ kho hằng ngày *(tài khoản `staff@`)*

Vào **Vật tư**, thử lần lượt: nhập kho, xuất kho, chuyển kho/kệ, điều chỉnh, báo
tình trạng, xuất hàng loạt.

Điểm cần soi:
- Xuất quá tồn → bị chặn, **không** ghi sổ.
- Chuyển **toàn bộ** một lô sang kệ khác → lô giữ nguyên mã, **không** sinh lô rỗng.
- Chuyển **một phần** → tách lô con, tổng số lượng không đổi.
- Lô đang có người mượn → **chặn** trước khi tách.

#### Mượn, trả

Cho mượn 2 đơn vị, rồi hoàn: **1 tốt · 1 hỏng**.

**Kỳ vọng:** hàng hỏng **không** quay lại tồn sẵn sàng mà thành lô `NEEDS_CHECK`
chờ kiểm tra. Trộn hàng hỏng vào tồn tốt nghĩa là lần sau cấp phát nhầm.

#### Kiểm kê tháng

1. `staff@` vào **Kiểm kê**, lập phiếu, nhập số đếm **theo từng lô**, gửi.
2. `admin` vào **Báo cáo tháng**, duyệt.

**Kỳ vọng:** khi một mã có nhiều lô, báo cáo **phải ghi rõ đếm được ở lô nào** —
hệ thống từ chối số tổng. Đoán hộ ở đây là đoán hộ hạn dùng của hàng cứu trợ.

Sau khi duyệt, tồn của lô = **số đếm được + phần đang cho mượn**, vì người đi đếm
chỉ thấy hàng trên kệ.

#### Phân quyền

- Đăng nhập `rescue@` → chỉ thấy **2 mục** trên thanh điều hướng.
- Đăng nhập `staff@` → **không** thấy *Tài khoản* và *Nhật ký*.
- Gõ thẳng địa chỉ `/users` bằng `staff@` → phải bị đẩy đi, không hiện nội dung.

### 4.2. Điện thoại

#### Giao diện hiện trường

Đăng nhập `rescue@`:
- Mở app vào thẳng **Lệnh điều phối**, không phải màn chung chung.
- Có đúng **ba thẻ**: Lệnh · Báo cáo · Cảnh báo.
- **Không** có thẻ Kho ở bất kỳ đâu.
- Lệnh chưa tới bước giao thì **không hiện nút** — nút bấm vào là báo lỗi còn tệ
  hơn không có nút, nhất là với người đang đứng ngoài mưa.

#### Giao diện phụ trách kho

Đăng nhập `staff@`:
- Sáu thẻ: Tổng quan · Sẵn sàng · Kho · Kiểm kê · Báo cáo · Cảnh báo.
- Thẻ **Kho**: quét QR trên lô hàng để mượn/trả, và các thao tác nhập/xuất.
- Thẻ **Báo cáo**: báo tình huống bằng giọng nói — cùng chức năng hiện trường có.

#### Chế độ ngoại tuyến

1. Đăng nhập, mở lần lượt **Tổng quan**, **Kho**, và nhiệm vụ định trình diễn.
2. Bật **chế độ máy bay** (tắt cả Wi‑Fi lẫn 4G).
3. Mở lại app.

**Kỳ vọng:**
- **Không** bị đá ra màn đăng nhập.
- Huy hiệu đổi từ **LIVE** sang **BẢN LƯU**.
- Hiện băng *"Ngoại tuyến · chỉ đọc"* kèm **mốc thời gian** bản lưu.
- Thông báo lỗi nhắc `ungphonhanh.life`, không nhắc "máy chủ LAN".

**Hai giới hạn phải biết trước khi diễn:**
- Màn nào **chưa mở trước khi mất mạng** thì không có bản lưu, sẽ trắng.
- **Đăng xuất xoá sạch bản lưu.** Đừng đăng xuất trước buổi trình diễn.

### 4.3. Desktop — cảm biến và chuông

Đăng nhập `admin`, host `localhost:3100`.

#### Chuông theo ngưỡng

1. Kéo thanh nhiệt độ lên **trên 35°C** (hoặc độ ẩm trên 85%).
2. Bấm **Xác nhận và gửi**.

**Kỳ vọng:** chuông kêu ngay, **chỉ tắt khi bấm nút Tắt chuông**. Sự cố xuất hiện
trên web ở mục **Sự cố**.

#### Chuông khi mất mạng

1. Ngắt mạng của máy chạy desktop.
2. Kéo vượt ngưỡng rồi bấm xác nhận.

**Kỳ vọng:** chuông **vẫn kêu**. Ngưỡng được đánh giá ngay tại máy và tiếng chuông
tự sinh, không tải gì từ mạng. Số liệu và thao tác tắt chuông nằm trong hàng chờ,
tự gửi khi có mạng lại — **không mất dữ liệu**.

#### Chuông do nguồn khác kích hoạt

Mở desktop và để yên. Từ máy khác, gửi số liệu vượt ngưỡng bằng khoá thiết bị.

**Kỳ vọng:** chuông kêu **mà không ai bấm gì trên desktop**. Chuông phải kêu vì
*có sự cố*, không phải vì *có người bấm nút* — cảm biến thật báo cháy lúc 2 giờ
sáng thì không có ai ngồi trước máy.

---

## 5. Cảm biến thật và thiết bị mô phỏng

Nguyên tắc: hai nguồn đi **chung một cửa vào, một hợp đồng dữ liệu, một luồng xử
lý**. Khác biệt duy nhất là ai sinh ra con số.

### Cấp khoá cho gateway

```bash
pnpm --filter @safestock/backend device:issue -- \
  --warehouse <mã-kho> --code gateway_a --name "Gateway kho trung tâm"
```

Token **chỉ hiện đúng một lần**. Hệ thống chỉ giữ bản băm nên mất là phải cấp lại.

### Gửi số liệu như một cảm biến

```bash
curl -X POST http://localhost:3100/api/telemetry/snapshots \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Token: upn_....' \
  -d '{"warehouseId":"<mã-kho>","idempotencyKey":"demo-1",
       "observedAt":"2026-07-31T04:00:00.000Z",
       "readings":[{"deviceCode":"temp_A","value":41.5,"quality":0.9}]}'
```

**Kỳ vọng:** `201`, sinh sự cố y hệt như khi người vận hành kéo thanh trượt.

### Các chốt an toàn cần thử

| Thử | Kết quả đúng |
|---|---|
| Không gửi khoá | `401` |
| Khoá sai | `401` |
| Dùng JWT người dùng thay khoá thiết bị | `401` |
| Gửi cho kho khác | `403` |
| Gửi lại **đúng gói tin** | `201` nhưng **chỉ ghi một lô** |
| Bắn liên tục bằng khoá lạ | `429` sau khi vượt trần |
| Thu hồi khoá rồi gửi tiếp | `401` |

Thu hồi: `device:revoke -- --id <credentialId>`.

### Mất tín hiệu cũng là sự cố

```bash
pnpm --filter @safestock/backend device:monitor -- \
  --warehouse <mã-kho> --device temp_B --interval 10
```

Rồi **không gửi gì cả**. Sau khoảng một phút, sự cố **Mất tín hiệu thiết bị** tự
xuất hiện.

Cảm biến hỏng hoặc hết pin thì không gửi gì. Nếu hệ thống chỉ phản ứng với dữ liệu
nhận được, im lặng sẽ bị hiểu nhầm thành "mọi thứ bình thường" — đúng lúc kho
không còn được giám sát.

Nhớ tắt sau khi thử: `--interval off`.

---

## 6. Chạy bộ kiểm thử tự động

```bash
pnpm lint                                              # toàn workspace
pnpm --filter @safestock/backend exec jest --runInBand  # 588 test
pnpm --filter @safestock/backend test:e2e               # 58 test, cần PostgreSQL
pnpm --filter @safestock/mobile test:state              # 21 test
pnpm --filter @safestock/desktop test:state             # 7 test
pnpm osrm:test                                          # 8 test định tuyến offline
cd apps/ai-service && python -m pytest -q               # 74 test
```

Toàn bộ phải xanh. E2E cần PostgreSQL đang chạy và **tự dọn dữ liệu của nó**,
không đụng dữ liệu mẫu.

---

## 7. Bảng kiểm nhanh trước buổi trình diễn

- [ ] `pnpm infra:up` xong, `GET /api/health` trả `ok` với `database: up`, `redis: up`
- [ ] Đã seed lại để dữ liệu sạch
- [ ] Web mở được ở `localhost:3200`, đăng nhập cả ba vai
- [ ] Điện thoại đăng nhập được, badge **LIVE** sáng
- [ ] Đã mở trước các màn định trình diễn để có bản lưu ngoại tuyến
- [ ] **Chưa đăng xuất** trên điện thoại (đăng xuất xoá bản lưu)
- [ ] Desktop đăng nhập `admin`, chuông kêu thử một lần rồi tắt
- [ ] Chạy trọn luồng mục 3 một lượt
- [ ] Máy chạy backend đã cắm nguồn, tắt chế độ ngủ
- [ ] Có sẵn 4G dự phòng cho máy chủ — mất Internet ở máy chủ là hỏng cả buổi

---

## 8. Ghi chú

Hai tài liệu `HUONG-DAN-TEST.md` và `HUONG-DAN-TEST-TOAN-DIEN.md` còn nhắc tới vai
"trưởng thôn" đã bị bỏ và luồng điều phối cũ. Khi có mâu thuẫn, lấy tài liệu này
làm chuẩn.

Lý do kiến trúc của đường ống số liệu chung nằm trong
[ADR-005](adr/ADR-005-telemetry-single-pipeline.md).
