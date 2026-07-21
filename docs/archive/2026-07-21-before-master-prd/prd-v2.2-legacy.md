# PRD – Ứng phó nhanh

**Product Requirements Document (bản hoàn chỉnh v2.2)**
Nền tảng AI đánh giá năng lực sẵn sàng và điều phối vật tư cứu hộ trong tình huống khẩn cấp

| | |
|---|---|
| Phiên bản | 2.2 (Readiness theo trạng thái, điều kiện chặn và khả năng đáp ứng) |
| Ngày | 2026-07-20 |
| Trạng thái | Đang code — xem [13. Trạng thái hiện tại](#13-trạng-thái-hiện-tại) |
| Dự thi | Cuộc thi Sáng tạo AI tỉnh Đắk Lắk (ai.daklak.gov.vn) |
| Đội | 2 người |
| Bối cảnh | Bão lũ Phú Yên (cũ) 2025 — nay thuộc Đắk Lắk |
| Kế hoạch chi tiết | Xem [BUILD-PLAN.md](BUILD-PLAN.md) |

> Tài liệu này mô tả **CÁI GÌ** và **TẠI SAO**. Chi tiết **LÀM THẾ NÀO** (phase, verify, thứ tự) ở [BUILD-PLAN.md](BUILD-PLAN.md).

---

## 1. Tổng quan

### 1.1. Vấn đề
Phần mềm quản lý kho thường trả lời *"kho có bao nhiêu?"*. Trong cứu hộ khẩn cấp, câu đó không đủ — số trên sổ không phản ánh **năng lực phản ứng thực tế**: vật tư có thể đã hỏng, hết hạn, sai vị trí, bị che chắn, hoặc đang được mượn. Khi bão lũ ập tới (như Phú Yên 2025), đội cứu hộ cần biết ngay *cái gì thực sự dùng được, chuẩn bị mất bao lâu, thiếu gì*.

### 1.2. Giải pháp
Ứng phó nhanh quản lý **năng lực phản ứng thực tế của kho**, trả lời 4 câu hỏi:
1. Vật tư nào đang thực sự sẵn sàng sử dụng?
2. Kho đáp ứng được tình huống khẩn cấp nào?
3. Với một tình huống cụ thể, cần chuẩn bị gì?
4. Điểm nghẽn nào khiến cứu hộ bị chậm?

### 1.3. Tuyên bố giá trị
> Phần mềm thường quản lý hàng tồn kho. Ứng phó nhanh quản lý **năng lực phản ứng thực tế** của kho khi sự cố xảy ra — kể cả khi con người quá bận để nhập liệu.

### 1.4. Phạm vi MVP
**5 module cốt lõi:** Quản lý kho · Mức sẵn sàng vận hành kho · Mission-to-Kit Compiler · Sensor Simulator (Digital Twin) · Mobile App.

**Mock (không phần cứng thật):** ESP32/loadcell/camera/RFID/mesh. Dữ liệu cảm biến mô phỏng, **cùng schema JSON phần cứng thật sẽ xuất** → thay mock bằng thiết bị thật không đổi phần mềm. Đây là **lộ trình có tầm nhìn**, không phải thiếu kinh phí.

**Ngoài phạm vi:** nhận diện khuôn mặt, CV phức tạp, blockchain, drone, GIS phức tạp, dự báo thiên tai cấp tỉnh.

> Mọi định mức vật tư là **tham khảo nghiên cứu** (dẫn nguồn Sphere Handbook + quy định PCTT VN), không phải hướng dẫn nghiệp vụ chính thức.

---

## 2. Đối tượng sử dụng — 3 vai trò

Xã thường **1 người phụ trách kho** → gộp còn 3 role:

| Role | Ai | Làm gì |
|---|---|---|
| **WAREHOUSE** | Cán bộ phụ trách kho | Toàn bộ vận hành: quét QR nhập/xuất, kiểm kê, báo hỏng, xuất lô khẩn cấp, sửa tay, đối chiếu kiểm kê, cho mượn, duyệt phương án |
| **RESCUE** | Đội cứu hộ | Xem phương án AI đề xuất, mượn–hoàn vật tư, gửi yêu cầu vật tư. Không đụng quản trị kho |
| **ADMIN** | Quản trị/giám sát | + Quản lý người dùng, xem toàn bộ nhật ký, cấu hình, **hậu kiểm** thao tác nhạy cảm |

**Mô hình kiểm soát: HẬU KIỂM** (không duyệt 2 bước). WAREHOUSE tự làm thao tác nhạy cảm + tự chịu trách nhiệm (lý do bắt buộc + nhật ký không xóa được) → ADMIN soi lại sau. Phù hợp quy mô xã ít người, không cản cứu hộ khẩn cấp.

---

## 3. Yêu cầu chức năng

### 3.1. Quản lý kho + nhập/xuất đa nguồn

**Phân cấp:** Kho → Khu vực → Kệ → Danh mục → Vật tư → Lô.

**Trạng thái vật tư — 2 chiều độc lập:**
- **Tình trạng:** `NEW` (mới) · `USED` (cũ, đã dùng) · `NEEDS_CHECK` (cần kiểm tra) · `DAMAGED` (hư hỏng)
- **Lưu hành:** `IN_STOCK` (trong kho) · `ON_LOAN` (đang mượn — vẫn thuộc kho, không tính mất) · `RETURNED` (vừa hoàn, chờ kiểm tra)

**Loại vật tư:** `consumable=true` (nước/lương thực/pin — xuất = tiêu hao) vs `consumable=false` (áo phao/xuồng/đèn — xuất = mượn, sẽ hoàn).

**4 tầng nhập/xuất — mỗi tầng bắt cái tầng trên sót:**
1. **Quét QR** — chính xác từng món (thường ngày)
2. **Xuất lô 1 chạm** — chế độ khẩn cấp, xuất cả kệ/theo nhiệm vụ
3. **Loadcell/RFID tự động** — cảm biến phát hiện biến động → tự sinh giao dịch (loadcell = *tín hiệu trigger*, không phải nguồn đếm chính xác)
4. **Kiểm kê định kỳ + sửa tay** — nguồn sự thật cao nhất, ghi đè tất cả

Mỗi giao dịch có `source` (SCAN/BULK/LOADCELL/RFID/MANUAL) — độ lệch giữa các nguồn feed vào "độ tin cậy dữ liệu" của Readiness.

**Mượn–trả (LoanRecord):** vật tư `consumable=false` xuất = tạo phiếu mượn → ON_LOAN → hoàn từng phần (ok/hỏng/mất): ok→USED về kho, hỏng→DAMAGED, mất→trừ tổng kho.

**Giao dịch:** nhập/xuất/chuyển/hoàn/điều chỉnh — mọi thao tác có nhật ký bất biến.

**Concurrency:** update nguyên tử có điều kiện (`quantity >= x`) → 2 người xuất cùng lúc không âm kho.

**FR chính:**
- FR-INV-01 Xuất 1 vật tư qua QR ≤ 3 bước
- FR-INV-02 Không cho xuất quá tồn sẵn sàng (100%)
- FR-INV-03 Mọi giao dịch có nhật ký 5W (ai/gì/trên gì/khi nào/vì sao)
- FR-INV-04 Kiểm kê chỉ đếm IN_STOCK (trừ ON_LOAN khỏi kỳ vọng)

### 3.2. Mức sẵn sàng vận hành kho (chức năng hỗ trợ quyết định cốt lõi #1)

Readiness không phải một điểm số dùng để xếp hạng kho. Mục tiêu là trả lời: **kho có vận hành được ngay không, đang vướng gì và đáp ứng được tình huống cụ thể đến đâu?**

Thay vì chỉ hiển thị `Readiness Score: 84/100`, giao diện chính phải trình bày:

```text
TRẠNG THÁI: CẦN XỬ LÝ
Điều kiện chặn: Không
Vấn đề: Thiếu 16 áo phao · 2 lô sắp hết hạn · 1 kệ bị khóa
Hành động: Mở kệ B1 · kiểm tra 2 lô y tế · đề nghị điều chuyển áo phao
Điểm tham khảo xu hướng: 84/100
```

**Ba tầng quyết định, theo đúng thứ tự ưu tiên:**

1. **Điều kiện chặn:** sự cố làm kho không thể vận hành; vật tư bắt buộc đã hỏng/hết hạn; vị trí chứa vật tư cần thiết bị khóa/chặn; dữ liệu quá cũ nên phải kiểm kê xác nhận trước khi xuất.
2. **Trạng thái từng mặt:** số lượng khả dụng, tình trạng, hạn dùng, khả năng tiếp cận, môi trường bảo quản và độ tin cậy dữ liệu. Mỗi mặt phải có trạng thái, lý do và hành động; không chỉ có điểm.
3. **Khả năng đáp ứng tình huống:** đối chiếu nhu cầu theo loại thiên tai, số người và thời gian với tồn thực sự khả dụng. Mức đáp ứng tổng bằng loại vật tư yếu nhất, không lấy trung bình để che thiếu hụt.

**Trạng thái vận hành chính:**

| Trạng thái | Ý nghĩa | Hành động hệ thống |
|---|---|---|
| Sẵn sàng | Không có điều kiện chặn; các mặt thiết yếu đạt yêu cầu | Cho phép chọn kho và tiếp tục đối chiếu nhu cầu tình huống |
| Cần xử lý | Kho vẫn vận hành được nhưng có thiếu hụt, rủi ro hoặc dữ liệu cần xác minh | Nêu vấn đề, người phụ trách, hành động và mức ưu tiên |
| Không thể điều phối | Có ít nhất một điều kiện chặn liên quan đến nhiệm vụ | Chặn chọn kho cho phần bị ảnh hưởng, cảnh báo và gợi ý kho/phương án khác |

**Sáu thành phần và trọng số hiện tại** (`28%` số lượng, `22%` tình trạng, `15%` hạn dùng, `15%` tiếp cận, `10%` môi trường, `10%` độ tin cậy) chỉ dùng để tạo **điểm tham khảo xu hướng**. Đây là định mức nghiên cứu, phải cấu hình được và không phải quy chuẩn nghiệp vụ chính thức.

**Nguyên tắc bất biến:** điều kiện chặn và mức đáp ứng theo tình huống luôn có quyền ưu tiên cao hơn điểm tổng. Kho `90/100` vẫn không được dùng nếu vật tư bắt buộc không thể tiếp cận; kho `70/100` vẫn có thể được chọn nếu không có blocker và đáp ứng đủ nhiệm vụ sau khi người phụ trách xác nhận cảnh báo.

**Tính ở 4 cấp:** lô vật tư → kệ → khu → kho. Mọi kết luận phải truy được về dữ liệu nguồn, nguyên nhân và thời điểm cập nhật.

**Chiến lược tính lại:** event-driven cho môi trường/sự cố + on-write cho giao dịch/kiểm kê/mượn-trả + phái sinh cho hạn dùng. Khi dữ liệu thay đổi, hệ thống tính lại blocker, trạng thái từng mặt và điểm tham khảo trong dưới 2 giây.

**FR:** FR-RDY-01 mọi trạng thái truy nguồn 100% · FR-RDY-02 sensor quá 30 phút không cập nhật không được dùng như dữ liệu hiện tại · FR-RDY-03 blocker luôn thắng điểm tổng · FR-RDY-04 trả mức đáp ứng theo từng loại vật tư và lấy loại yếu nhất · FR-RDY-05 mọi cảnh báo phải kèm hành động đề xuất.

### 3.3. Mission-to-Kit Compiler (chức năng AI cốt lõi #2)

Nhập tình huống (văn bản/giọng nói tiếng Việt) → JSON → nhu cầu → phương án → giải thích → phê duyệt.

Ví dụ input: *"Ngập lụt xã A, 150 người cô lập 48h, 25 trẻ em, 15 người già, 4 ca cần y tế."*

**Quy trình:**
```
Mô tả → LLM parse → JSON có cấu trúc
  → Rule Engine (định mức, dẫn nguồn Sphere) sinh nhu cầu
  → đối chiếu tồn kho + Readiness
  → phân bổ GREEDY + FEFO (ưu tiên gần hết hạn còn đủ điều kiện)
  → thiếu → gợi ý mượn kho lân cận (ưu tiên gần)
  → LLM giải thích → WAREHOUSE phê duyệt
```

**Mức đáp ứng % = MIN qua các loại** (mắt xích yếu nhất — thiếu nước thì đủ áo phao vô nghĩa), không phải trung bình đẹp.

**Phân bổ:** greedy + FEFO (OR-Tools bỏ khỏi MVP — greedy đủ ở quy mô này, dễ giải thích; OR-Tools là hướng phát triển). Không vượt tồn sẵn sàng. Chỉ lấy IN_STOCK khả dụng.

**FR:** FR-MTK-01 tạo phương án <10s · FR-MTK-02 không vượt tồn 100% · FR-MTK-03 mọi con số do backend/rule engine tính, LLM chỉ parse + diễn đạt.

### 3.4. Sensor Simulator — Digital Twin (thay phần cứng IoT)

> Gọi đúng: "mô phỏng lớp cảm biến", không khoe "Digital Twin công nghiệp".

Sinh sự kiện cảm biến theo kịch bản **deterministic** (cùng seed → cùng dãy). Mô hình **timeline-scrubber**: kịch bản = danh sách sự kiện có `offsetMs`, runner là con trỏ chạy qua (như trình phát video). Tốc độ x1/x10, play/pause/reset.

**Thiết bị ảo:** loadcell, nhiệt độ, độ ẩm, khói, cửa, RFID gateway, camera AI, nguồn điện, gateway. Mỗi thiết bị giữ **giá trị current** (Readiness đọc trực tiếp). Ngưỡng lọc: chỉ lưu sự kiện có nghĩa.

**≥5 kịch bản (PRD gốc 3.4):** bình thường (có nhiễu seed), nghi thất thoát, lỗi cảm biến, bảo quản xấu, mất kết nối, sai vị trí. **Nhiễu ngẫu nhiên có seed** ở kịch bản bình thường → chứng minh AI phân biệt nhiễu vs sự cố thật (không chỉ đọc kịch bản).

Sự kiện đẩy realtime qua WebSocket (room theo kho) tới mobile + web.

**FR:** FR-SIM-01 reproducible 100% cùng seed · FR-SIM-02 đổi dữ liệu → mobile cập nhật <2s.

### 3.5. Incident Intelligence — điều tra sự cố (nên-có)

Hợp nhất sự kiện đa nguồn → timeline → chấm điểm nghiêm trọng → giải thích. Rule engine với **ngưỡng cụ thể** (vd loadcell giảm >3kg + cửa mở + RFID + không phiếu xuất ±5ph → nghi thất thoát). LLM viết giải thích, **không tự kết luận số liệu**. Thông báo in-app qua WebSocket. Mọi kết luận kèm bằng chứng truy nguồn (100%).

Bổ sung 2 lớp phát hiện dùng thống kê thay vì chỉ ngưỡng tuyệt đối: **phát hiện bất thường (z-score)** — so độ lệch điểm mới nhất với baseline lịch sử từng cảm biến, bắt pattern lệch dù chưa vượt ngưỡng cứng; **cảnh báo sớm dự đoán (hồi quy tuyến tính)** — ngoại suy xu hướng gần nhất, báo trước khi chạm ngưỡng nguy hiểm (vd "nhiệt độ dự kiến vượt 35°C trong ~12 phút"). Cả hai vẫn là rule/thống kê thuần backend tính, LLM chỉ diễn giải khi được yêu cầu — giữ nguyên nguyên tắc bất biến của mục này.

### 3.6. Mobile App (vận hành hiện trường)

**Điều hướng:** Trang chủ · Kho · Quét QR · Nhiệm vụ · Cảnh báo.

Chức năng: xem Readiness + cảnh báo + nhiệm vụ; quét QR xuất/nhập/chuyển/kiểm tra/báo hỏng (có nút nhập SKU tay dự phòng); nhận cảnh báo realtime; mượn–hoàn (RESCUE).

**Offline 3 tình huống:**
- Mất internet, LAN còn → tiếp tục dùng Backend, DB và Ollama local trên máy chủ xã; bản đồ chuyển tile cục bộ
- Mất LAN (ra hiện trường) → offline-đọc (cache xem kho) + trao đổi ngoài (bộ đàm/SMS) + nhập bù tay khi mạng về. **Không** sync tự động (tránh âm kho)
- Mất điện toàn kho → offline-đọc trên điện thoại + phiếu giấy in sẵn + UPS máy chủ

### 3.7. Cụm kho xã + GeoService (đã bổ sung sau v2.0)

**Mô hình cụm kho:** 1 xã = 1 hệ thống, 1 DB. Trong xã có **1 kho tổng** (`CENTRAL`, trung tâm hành chính, dự trữ lớn) + **nhiều kho thôn** (`HAMLET`, mỗi thôn 1 kho nhỏ), cùng `communeId` → AI query trực tiếp cả cụm (KHÔNG "móc DB kho khác"). Tọa độ kho **ghim tay** (`lat`/`lng`), không geocode.

**GeoService — khoảng cách/ETA kho→điểm nạn:**
- **Haversine** (thuần, offline, luôn chạy) làm nền — 2 lat/lng → km, ETA = km÷tốc độ giả định (`GEO_ASSUMED_SPEED_KMH`)
- **Google Routes** (Compute Route Matrix) làm chính khi có mạng + key — đường bộ thật. Lỗi/timeout/hết quota → tự lùi về Haversine, không ném lỗi lên workflow
- **2 lớp chặn quota** để không bao giờ bị trừ tiền: app tự đếm, tới `GEO_MONTHLY_CAP` (mặc định 8.500/tháng) thì ngừng gọi Google; ngoài ra đặt **quota cap 9.000** trên Google Cloud Console (Google enforce cứng, dưới free-tier 10.000)

Mission (3.3) dùng GeoService để chọn kho thôn **gần điểm nạn nhất còn hàng**, tràn sang kho tổng/thôn khác cùng xã khi thiếu, rồi mới gợi ý mượn xã lân cận (`NeighborWarehouse`, nhập tay, không sync DB — giữ nguyên §5.2).

### 3.8. AI Incident Action Plan — kế hoạch hành động cứu hộ (đã bổ sung sau v2.0)

Nâng Mission-to-Kit từ "danh sách vật tư + đáp ứng %" thành **kế hoạch hành động 8 mục** (khớp/hơn tài liệu phân tích tình huống cứu hộ tham khảo):
1. Đánh giá tình huống + mức khẩn cấp (1–5)
2. Mục tiêu cứu hộ 6 giờ đầu
3. Phương án cấp phát vật tư
4. Điều phối kho — kèm khoảng cách + ETA (từ GeoService, §3.7)
5. Phương án theo 3 giai đoạn: 0–2h / 2–6h / 6–24h
6. Cảnh báo nguy cơ
7. Dự báo theo tỷ lệ % (định tính, có ghi rõ là ước lượng)
8. Câu hỏi bổ sung để tăng độ chính xác

**Nguyên tắc bất biến:** mục 1 (severity) và mục 7 (dự báo %) tính bằng **rule backend kiểm chứng được**, LLM CHỈ viết phần diễn giải (mục tiêu/giai đoạn/cảnh báo/câu hỏi) dựa trên số đã tính — không tự bịa số. ETA đưa vào context từ GeoService, LLM dùng đúng số này khi viết "điều phối".

**Fallback không mạng/LLM lỗi:** dựng plan bằng template từ số backend — vẫn ra đủ 8 mục, không phụ thuộc LLM khi demo.

### 3.9. Workflow liên vai trò + Notification (đã bổ sung sau v2.0)

Mission đi qua trạng thái: `DRAFT → PENDING_RESCUE → RESCUE_CONFIRMED → PENDING_WAREHOUSE → READY → COMPLETED` (giữ `REJECTED`):
```
ADMIN nhập tình huống → AI sinh Action Plan (chọn kho theo §3.7)
  → notify RESCUE → RESCUE xác nhận lấy
  → notify WAREHOUSE → WAREHOUSE chuẩn bị + xuất (bulk-export)
  → notify ADMIN + RESCUE (READY)
  → thiếu → notify kho lân cận
```
Thông báo qua model `Notification` (DB, theo role) + Socket.IO room theo role (realtime in-app). Phân quyền bổ sung: `mission:confirm` (RESCUE), `mission:fulfill` (WAREHOUSE), `mission:create` chuyển hẳn về ADMIN.

---

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Mục tiêu |
|---|---|---|
| NFR-01 | Tạo phương án | < 10s |
| NFR-02 | Độ trễ cảnh báo mô phỏng | < 2s |
| NFR-03 | Giao dịch có nhật ký | 100% |
| NFR-04 | Reproducibility scenario cùng seed | 100% |
| NFR-05 | Phương án không vượt tồn | 100% |
| NFR-06 | Kết luận có bằng chứng | 100% |
| NFR-07 | Thao tác quét để xuất | ≤ 3 bước |
| NFR-08 | Thời gian demo | 5–7 phút |
| NFR-09 | Auth | JWT access + refresh |
| NFR-10 | Dự phòng offline | Có (3 lớp) |

---

## 5. Kiến trúc

### 5.1. Tổng thể
```
Online:  ungphonhanh.life ─→ Cloudflare Tunnel ─┐
Offline: IP/hostname LAN ───────────────────────┤
                                               v
Mobile (Expo) ─┐                           Máy chủ xã
Web Admin ─────┼─ REST + WebSocket ─→ NestJS API ─┬─ PostgreSQL
Simulator UI ──┘                                  ├─ Redis + BullMQ
                                                  └─ AI Service (FastAPI)
                                                       └─ Ollama/Qwen local
```

### 5.2. Đa xã tự trị (quyết định kiến trúc quan trọng)
**Mỗi xã = 1 máy chủ độc lập, KHÔNG sync DB xã khác.** Trong 1 xã, cụm kho (1 `CENTRAL` + n `HAMLET` cùng `communeId`, §3.7) **dùng chung 1 DB** → AI query trực tiếp cả cụm, không phải "kho lân cận". Chỉ khi vét hết cụm kho cùng xã vẫn thiếu, AI mới **gợi ý** liên hệ kho **xã khác** (đọc bảng `NeighborWarehouse` nhập tay) → con người tự gọi bộ đàm/điện thoại → bên cho mượn xuất đánh dấu `LOAN_OUT`, bên mượn nhập `LOAN_IN`. Xóa bỏ bài toán đồng bộ đa kho liên xã, đúng thực tế liên xã.

### 5.3. Phân vai AI vs nghiệp vụ
| Bên | Trách nhiệm |
|---|---|
| **LLM** (Gemini/Ollama/Claude) | Parse mô tả → JSON; giải thích kết quả; tóm tắt sự cố. KHÔNG tự tính tồn kho/kết luận số liệu |
| **Backend** | Kiểm tra số lượng/quyền/hạn; giao dịch atomic; nhật ký; xác nhận dữ liệu |
| **Rule Engine** | Điều kiện chặn + trạng thái Readiness + điểm xu hướng; hợp nhất bằng chứng; phân loại nghiêm trọng; sinh nhu cầu, phát hiện bất thường thống kê + dự đoán xu hướng cảm biến |
| **Greedy + FEFO** | Phân bổ vật tư; ưu tiên gần hết hạn; ưu tiên kho gần |

### 5.4. AI provider pluggable
Đổi bằng env `AI_PROVIDER`. **Production = Ollama local** (0đ, offline, dữ liệu không rời cơ quan; cấu hình hiện tại dùng Qwen 3.5 4B trên máy 16GB RAM). Gemini chỉ là provider cloud tùy chọn. Cùng interface + schema JSON.

### 5.5. Nền tảng
- **DB chính:** PostgreSQL 16 Alpine chạy local bằng Docker trên máy chủ xã; Prisma là ORM. Supabase không phải database chính trong pilot.
- **Cache/queue:** Redis 7 Alpine chạy local bằng Docker.
- **Backup:** PostgreSQL local → bản sao ngoài ổ máy chủ; có thể upload thêm bản đã mã hóa lên Supabase Storage, giữ tối thiểu 3 bản và thử restore định kỳ.
- **Thời gian:** server là nguồn timestamp duy nhất (giờ VN +07:00), client không gửi timestamp
- **Storage:** local trong pilot; Cloudflare R2 chỉ là lựa chọn tương lai cho ảnh báo hỏng.
- **Deploy pilot:** chưa mua VPS, không dùng Vercel/Railway. Máy `PLAT1NER` của người cài source code chạy toàn bộ stack; `ungphonhanh.life` truy cập qua Cloudflare Tunnel.
- **Deploy tương lai:** có thể chuyển nguyên stack sang máy chuyên dụng/VPS hoặc tách máy AI mà không đổi domain.

### 5.6. Quy tắc truy cập online/offline

- **Online:** `https://ungphonhanh.life` → Cloudflare Tunnel → Frontend/Backend trên máy chủ xã.
- **Offline:** IP hoặc hostname LAN → reverse proxy nội bộ → cùng Frontend/Backend.
- Frontend cần dùng API same-origin để một bản build hoạt động ở cả domain và LAN; `/api/*` và `/socket.io/*` được route về Backend.
- Chỉ Frontend và API có Auth/JWT được công khai. AI Service `8000`, Ollama `11434`, PostgreSQL và Redis chỉ hoạt động nội bộ.
- Cloudflare Tunnel không thay đổi AI provider và không lưu database; AI luôn là Ollama local trong cả hai mode.
- Kế hoạch triển khai chi tiết: [plan-trien-khai-domain-online-offline-ai-local.md](plan-trien-khai-domain-online-offline-ai-local.md).

---

## 6. Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Monorepo | pnpm workspace |
| Mobile | React Native + Expo + TypeScript (Expo Router, TanStack Query, Zustand, expo-camera, Socket.IO client) |
| Backend | NestJS + Prisma + PostgreSQL + Redis + BullMQ + Socket.IO + JWT |
| AI Service | Python + FastAPI + Pydantic + LLM provider pluggable |
| Web Admin | Next.js + Tailwind + shadcn/ui + Recharts + SVG (sơ đồ kho) |
| Shared | `@safestock/shared-types` (enum + type dùng chung) |
| Hạ tầng | Docker Compose · Cloudflare Tunnel · GitHub · backup local/offsite mã hóa |

---

## 7. Mô hình dữ liệu (nhóm chính)

**Tổ chức & phân quyền:** organizations, users, roles (WAREHOUSE/RESCUE/ADMIN), permissions (hằng số code), user_warehouses (scope), warehouses (+distanceKm, **+kind CENTRAL/HAMLET, +communeId, +lat/lng**, §3.7), warehouse_zones, shelves (+isLocked)

**Vật tư:** item_categories, items (+consumable), item_batches (+condition, +circulation, expiryDate), inventory_transactions (+source), inventory_counts, loan_records, neighbor_warehouses

**Readiness:** readiness_scores (điểm tham khảo), readiness_components, readiness_rules (blocker + trạng thái + trọng số cấu hình), readiness_recommendations

**Cảm biến & sự cố:** virtual_devices (+currentValue, +updatedAt), sensor_events, simulation_scenarios, simulation_runs, incidents, incident_evidence

**Nhiệm vụ:** missions (+actionPlan Json, +incidentLat/lng, +status mở rộng §3.9), mission_requirements, mission_allocations

**Hệ thống:** audit_logs (5W), attachments, refresh_tokens, **notifications** (recipientRole/userId, kind, read, §3.9), **api_usage** (đếm quota GeoService/tháng, §3.7)

---

## 8. API chính

**Auth/RBAC:** POST /auth/{login,refresh} · GET /auth/me · GET /audit
**Inventory:** POST /inventory/{export,import,transfer,bulk-export,adjust,reconcile,scan} · GET /inventory/discrepancies
**Loan:** POST /loans · POST /loans/:id/return
**Readiness:** GET /warehouses/:id/readiness (operationalStatus, blockers, dimensions, referenceScore) · GET /zones/:id/readiness · POST /readiness/recalculate · GET /readiness/recommendations
**Mission:** POST /missions/{parse,generate-plan} · GET /missions/:id · POST /missions/:id/{action-plan,explain,approve,dispatch,confirm,prepare}
**Simulator:** GET /simulator/scenarios · POST /simulator/{events,runs,runs/:id/play,runs/:id/pause,runs/:id/reset} · GET /simulator/warehouses/:id/{devices,timeline}
**Incident:** GET /incidents · GET /incidents/:id/timeline · POST /incidents/:id/{acknowledge,assign,resolve}
**Notification:** GET /notifications · POST /notifications/:id/read · POST /notifications/read-all

---

## 9. Kịch bản demo (5–7 phút) — "lõi diễn" vs "đạn Q&A"

**DIỄN (6 bước):**
1. Dashboard: **Sẵn sàng**, không có điều kiện chặn; điểm xu hướng 91/100 hiển thị phụ
2. Nhập tình huống (giọng nói): "Ngập lụt 120 người cô lập 48h, 20 trẻ em, 10 người già"
3. AI lập phương án: phân tích → bộ vật tư → đối chiếu tồn → báo thiếu → gợi ý mượn kho lân cận
4. Kéo slider độ ẩm kho y tế (Simulator) → trạng thái chuyển **Cần xử lý** trong thời gian thực, nêu rõ “độ ẩm vượt ngưỡng” và bắn cảnh báo mobile
5. Nhân viên xuất kho theo phương án (mobile, quét QR / xuất lô)
6. Kết: "Ứng phó nhanh cho biết kho đáp ứng tình huống nào, chuẩn bị bao lâu, điểm nghẽn ở đâu"

**KHÔNG diễn — chỉ trả lời khi hỏi (slide phụ lục):** RBAC/hậu kiểm, mượn-trả, offline 3 lớp, phiếu giấy, backup, đa xã, loadcell 4 tầng, kiểm kê. Chiều sâu để chứng minh nghĩ kỹ.

---

## 10. Ưu tiên phạm vi

**Phải làm thật tốt (3 trụ diễn):** trạng thái Readiness có lý do · Mission-to-Kit · Sensor Simulator.

**Nên có:** Incident · mobile khép vòng đời · admin nâng cao (voice, so sánh trạng thái và khả năng đáp ứng trước/sau).

**Polish (dư mới làm):** loadcell/RFID tự động · backup · offline push · chatbot hỏi-đáp kho · import Excel.

**Đã cắt:** Diễn tập AI (Drill) · OR-Tools · duyệt 2 bước · bản đồ thiên tai tĩnh.

---

## 11. Rủi ro & giả định

| Rủi ro | Giảm thiểu |
|---|---|
| LLM parse sai schema | Validation Pydantic + retry (mọi provider) |
| Demo mất mạng | Bản chạy 100% localhost + cache mọi call AI |
| Rate-limit Gemini khi demo | Cache kết quả parse câu demo |
| Scenario không reproducible | Seed cố định, timeline-scrubber deterministic |
| Phạm vi phình to | Bám 3 trụ diễn, phần còn lại là đạn Q&A |
| Thực thi 2 người/thời gian | Thứ tự: differentiator (Readiness) trước, nền bồi sau |
| Máy chủ pilot tắt/sleep/mất điện | Tắt sleep, tự khởi động dịch vụ, UPS; chỉ cam kết pilot trước khi có máy chuyên dụng |
| Mất Internet tại xã | Dùng URL LAN, tile local, PostgreSQL/Redis/Ollama local; không phụ thuộc domain |
| Public nhầm dịch vụ nội bộ | Tunnel/reverse proxy chỉ route web/API; firewall chặn DB, Redis, AI Service và Ollama |

**Giả định:** định mức là tham khảo nghiên cứu (có dẫn nguồn); không phần cứng thật trong MVP; máy `PLAT1NER` Windows 11, i7-10750H, RAM 16GB làm máy chủ pilot và chạy Ollama; đội quen hệ TypeScript. Vận hành 24/7 chính thức cần đánh giá lại phần cứng, UPS và máy chủ chuyên dụng.

---

## 12. Deliverables dự thi

Ứng dụng mobile Android (APK) · Web quản trị + Simulator · Backend API · AI service · Bộ dữ liệu mẫu (2 xã) · ≥5 scenario · Video demo 5–7ph · Tài liệu kiến trúc · Báo cáo kỹ thuật · Slide · Poster · Thư quan tâm CTĐ Đồng Xuân (ký + mộc) · Mã nguồn GitHub.

---

## 13. Trạng thái hiện tại (2026-07-21)

**Backend (mạnh nhất, vượt phạm vi PRD gốc):** đã có nền/auth/RBAC/inventory, sensor simulator, Readiness v2.2, Mission-to-Kit, Incident Intelligence + E2 anomaly/predictive warning, GeoService, cụm kho xã + AI Action Plan 8 mục, workflow liên vai trò + Notification, Normal Mode/Insights, chatbot hỏi-đáp kho, backup Supabase, admin/report. Readiness v2.2 đã dùng blocker có bằng chứng và ba trạng thái; Mission loại lô hỏng/cần kiểm tra/hết hạn/kệ khóa/không còn khả dụng, lưu đánh giá từng SKU và chặn gửi khi thiếu hoàn toàn vật tư thiết yếu. Ngày 2026-07-21: backend pass 25 suite / 168 test và build sạch.

**AI service:** đã có FastAPI + provider Gemini/Ollama, parse tình huống, explain phương án, Action Plan, assistant. Claude provider và endpoint explain-incident riêng chưa hoàn chỉnh theo roadmap.

**Frontend web:** dashboard Next.js đã có nhiều view. Tổng quan Readiness ưu tiên trạng thái, blocker, lý do, hành động; điểm chỉ hiển thị phụ. Mission hiển thị mức đáp ứng và trạng thái từng vật tư. `tsc --noEmit` và `next build` pass ngày 2026-07-21.

**Triển khai pilot đã chốt:** domain `ungphonhanh.life` mua tại Mắt Bão; chưa mua VPS và chưa dùng Vercel/Railway. Máy cài source `PLAT1NER` chạy Frontend, Backend, PostgreSQL, Redis, AI Service và Ollama; truy cập online qua Cloudflare Tunnel, offline qua LAN. Same-origin API, hardening CORS/WebSocket, service auto-start và backup ngoài máy là các bước triển khai tiếp theo.

**Còn thiếu/dở:** mobile Expo chưa có source app thực tế; RFID handler chưa xong (loadcell đã có); `explain-incident` riêng phía AI service chưa tick; blocker theo cấu hình nghiệp vụ từng địa phương và kiểm thử E2E trình duyệt đầy đủ vẫn là lát tiếp theo.

Chi tiết tiến độ + verify từng lát: [BUILD-PLAN.md](BUILD-PLAN.md) · [codebase-summary.md](codebase-summary.md) · checklist đầy đủ: `apps/backend/ROADMAP.md`, `apps/frontend/ROADMAP.md`, `apps/mobile/ROADMAP.md`, `apps/ai-service/ROADMAP.md`.
