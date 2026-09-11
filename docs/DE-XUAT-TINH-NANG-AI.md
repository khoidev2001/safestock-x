# Rà soát AI hiện có và đề xuất tính năng mới

**Ngày:** 06/09/2026 · **Mã nguồn:** `main` @ `7cfe16f` (sau khi merge PR #15 và #16)

**Phương pháp:** đọc mã nguồn và đếm bằng máy. Phần "hiện có" là những gì đọc được từ mã, không lấy từ tài liệu tự khai. Phần "đề xuất" là ý kiến, đã ghi rõ chỗ nào là ước lượng.

---

## Phần 1 — AI hiện có, kiểm chứng từ mã nguồn

### 1.1. Mười điểm cuối AI đang chạy

`apps/ai-service` có 6.240 dòng Python, 15 điểm cuối. Bỏ 4 điểm cuối phục vụ vận hành (`/health`, `/keep-warm*`), còn **10 điểm cuối làm việc AI thật**:

| Điểm cuối                          | Việc                                     | Loại mô hình          | Gọi từ                                |
| ------------------------------------- | ----------------------------------------- | ------------------------ | --------------------------------------- |
| `/parse`                            | Bóc tách số liệu từ lời kể         | LLM + lớp neo số liệu | `mission.controller`                  |
| `/situation-analysis`               | Phân tích tình huống                  | LLM                      | `coordination-analysis.service`       |
| `/field-update-intent`              | Hiểu ý định cập nhật hiện trường | LLM                      | `field-update-assistant.service`      |
| `/action-plan`                      | Viết kế hoạch hành động 8 mục      | LLM                      | `mission.service`                     |
| `/explain`                          | Diễn giải số liệu bằng lời          | LLM                      | `incident`, `insights`, `mission` |
| `/assistant`, `/assistant/stream` | Hỏi đáp có dẫn nguồn                | LLM + RAG                | `assistant.service`                   |
| `/knowledge/search`                 | Tra kho tri thức                         | Embedding                | `assistant.service`                   |
| `/semantic/rank`                    | Tìm vật tư theo ngữ nghĩa            | Embedding                | `inventory-semantic.service`          |
| `/briefing/select`                  | Chọn dữ kiện cho bản tin              | LLM (trích xuất)       | `insights.service`                    |
| `/transcribe`                       | Nhận dạng giọng nói tiếng Việt      | PhoWhisper-small         | `mission.controller`                  |

Mô hình đang cấu hình: `qwen3.5:4b` (ngôn ngữ) · `nomic-embed-text` (nhúng) · `vinai/PhoWhisper-small` (giọng nói). Tất cả chạy tại chỗ qua Ollama.

### 1.2. Phần KHÔNG phải AI — và đó là lựa chọn đúng

Đây là chỗ cần nói thẳng, vì tài liệu dự thi dễ khiến người đọc tưởng AI làm nhiều hơn thực tế.

Những chức năng sau **hoàn toàn là thuật toán tất định**, không có mô hình nào tham gia:

| Chức năng                   | Cách làm thật                                            | Dòng                     |
| ----------------------------- | ----------------------------------------------------------- | ------------------------- |
| Dự báo cạn kho             | EWMA + độ lệch chuẩn nhu cầu ngày → khoảng tin cậy | `forecast.ts` 153       |
| Đề xuất điều chuyển kho | Luật ngưỡng                                              | `rebalance.ts` 79       |
| Cảnh báo hạn dùng         | So sánh ngày                                              | `expiry-alert.ts` 32    |
| Nhu cầu theo mưa            | Ngưỡng 100 mm/72 giờ × hệ số                          | `weather-demand.ts` 139 |
| Phát hiện sự cố kho       | Luật ngưỡng trên tín hiệu cảm biến                  | `incident.rules.ts`     |
| Chỉ số sẵn sàng           | 6 chiều có trọng số + điểm chặn                      | `readiness`             |
| Tính nhu cầu vật tư       | Định mức Sphere × số người × số ngày              | `mission.compute.ts`    |
| Bản tin đầu ngày          | Lắp ráp dữ kiện; AI chỉ chọn câu và viết lời      | `daily-briefing.ts` 161 |

**Đây là điểm mạnh, không phải điểm yếu.** Số liệu quan trọng do công thức kiểm chứng được tính ra; mô hình chỉ viết phần diễn giải. Đúng nguyên tắc *"không bịa số"* mà sản phẩm tự đặt ra.

Nhưng phải trình bày đúng khi thuyết minh. Nói "AI dự báo cạn kho" là sai — EWMA có từ thập niên 1950. Nói "hệ thống dự báo bằng thống kê, AI diễn giải kết quả và chịu kiểm chứng ngược từng con số" mới đúng, và nghe cũng vững hơn.

### 1.3. Lớp neo số liệu — thứ đáng giá nhất trong toàn bộ phần AI

`parse_grounding.py` không tin con số mô hình khai. Máy **tự đọc lại mô tả gốc** bằng biểu thức chính quy để lấy số, và mô hình chỉ còn giữ phần nó thật sự làm tốt: phân loại thiên tai, mức ưu tiên, ước lượng khi câu chữ không nêu con số.

Chú thích trong tệp ghi lại sự cố thật đã dẫn tới thiết kế này: mô hình 4B đọc *"12 hộ… 3 trẻ em và 2 người già, trong 48 giờ"* rồi trả `children=12, elderly=8, medicalSupportCases=4, durationHours=96` — **ổn định 3/3 lần**, và ba con số cuối không hề xuất hiện trong câu. Kèm theo là bộ nhận diện mưu toan tiêm lệnh: số nằm trong mệnh đề có dấu hiệu `bỏ qua`, `ignore`, `system prompt`, `auto dispatch` thì không được coi là số liệu người dân báo.

Đây là kỹ thuật ở tầng cao hơn hẳn mặt bằng sản phẩm dự thi, và là chỗ nên dành thời gian nhất khi trình bày.

### 1.4. Đánh giá khách quan phần AI hiện tại

**Mạnh:**

- Chạy hoàn toàn tại chỗ — không phụ thuộc Internet, chi phí không tăng theo lượt dùng
- Có lớp chống bịa số **chạy được và trình diễn được**, không phải lời hứa
- Nhận dạng giọng nói tiếng Việt bằng mô hình chuyên dụng, không dùng dịch vụ ngoài
- Ranh giới AI/tất định vạch rõ trong mã: AI không đụng vào phép cộng trừ kho

**Yếu:**

- **Mô hình 4B là trần thấp.** `qwen3.5:4b` đủ cho diễn giải và phân loại, nhưng suy luận nhiều bước thì đuối — chính lớp neo số liệu ra đời vì lý do này.
- **Một GPU, một yêu cầu tại một thời điểm.** Chú thích trong `main.py` tự ghi nhận: trang theo dõi gọi nền, người bấm "Phân tích bằng AI" xếp hàng phía sau, quá hạn 90 giây. Chưa có hàng đợi ưu tiên.
- **Không có xác thực trên `ai-service`.** 15 điểm cuối mở với ai chạm được cổng 8000.
- **AI chỉ phục vụ pha khẩn cấp.** Ngày thường — kiểm kê, hậu kiểm, mượn trả, sự cố kho — gần như không có AI. Mà ngày thường chiếm hơn 95% thời gian vận hành.

Điểm cuối là chỗ có nhiều dư địa nhất, và toàn bộ Phần 3 xoay quanh nó.

---

## Phần 2 — Dữ liệu đang có mà AI chưa dùng

39 bảng trong lược đồ. Những bảng sau **đang tích dữ liệu thật nhưng không mô hình nào đụng tới**:

| Bảng                    | Dữ liệu                       | Hiện dùng làm gì                                       |
| ------------------------ | ------------------------------- | ---------------------------------------------------------- |
| `MissionDeliveryPhoto` | Ảnh bằng chứng giao hàng    | Lưu và hiển thị.**Không có xử lý ảnh nào** |
| `MissionReportAudio`   | Ghi âm kèm báo cáo          | Lưu; chỉ chuyển thành chữ                             |
| `AuditLog`             | Nhật ký hậu kiểm 5W         | Tra cứu thủ công                                        |
| `InventoryTransaction` | Toàn bộ lịch sử xuất nhập | Chỉ EWMA cho dự báo                                     |
| `MonthlyStockReport`   | Báo cáo kiểm kê 17 thôn    | Người duyệt bằng mắt                                  |
| `InterCommuneLoan`     | Mượn trả liên xã           | Luật trạng thái                                         |
| `SensorEvent`          | Chuỗi thời gian cảm biến    | Luật ngưỡng tức thời                                  |
| `MissionFieldUpdate`   | Cập nhật hiện trường       | Hiển thị theo dòng thời gian                           |

Đây là nguyên liệu sẵn có. Mọi đề xuất dưới đây đều dựa trên dữ liệu **đã tồn tại**, không đòi thêm thiết bị hay nguồn dữ liệu mới.

---

## Phần 3 — Danh sách đề xuất

Xếp theo **giá trị vận hành thật**, không theo độ hào nhoáng. Mỗi mục có ghi riêng giá trị trình diễn, vì hai thứ đó không trùng nhau.

Quy ước cột: **Công** = ước lượng ngày công, là phỏng đoán chứ chưa đo. **Trình diễn** = mức gây ấn tượng trước ban giám khảo.

---

### Nhóm A — Đưa AI vào việc ngày thường (dư địa lớn nhất)

#### A1. Soát báo cáo kiểm kê tháng bằng AI

|                            |                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bài toán thật** | 17 thôn nộp báo cáo mỗi tháng, mỗi báo cáo vài chục dòng. Quản trị xã duyệt bằng mắt. Đây là việc lặp lại nhiều nhất trong toàn hệ thống, và cũng là chỗ dễ bỏ sót nhất                                                                                                                                                                           |
| **AI làm gì**      | Chấm điểm bất thường từng dòng rồi xếp lên đầu: chênh lệch vượt ngưỡng lịch sử của chính mã hàng đó; mặt hàng nhiều tháng không động bỗng đổi số; lý do chênh lệch sao chép nguyên văn tháng trước; lý do rỗng nghĩa (`ok`, `bt`, `.`). LLM viết một câu tóm tắt *"3 dòng cần xem kỹ, tập trung ở nhóm áo phao"* |
| **Dữ liệu**        | `MonthlyStockReport` + `InventoryTransaction` — đã có đủ                                                                                                                                                                                                                                                                                                                     |
| **Ranh giới**       | AI**chỉ xếp thứ tự và giải thích**, không tự duyệt, không tự sửa số                                                                                                                                                                                                                                                                                                |
| **Công**            | 4–5 ngày ·**Trình diễn:** trung bình                                                                                                                                                                                                                                                                                                                                       |

Phần phát hiện bất thường nên làm bằng thống kê (khoảng tin cậy trên lịch sử từng SKU), LLM chỉ viết lời. Giữ đúng nguyên tắc không bịa số.

#### A2. Chuẩn hoá tên vật tư ngay lúc nhập lô mới

|                            |                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bài toán thật** | 18 kho, nhiều người nhập liệu.`Nước uống đóng chai 500ml`, `nuoc uong 500`, `Nước đóng chai` dễ thành ba mã hàng khác nhau. Một khi danh mục phân mảnh thì mọi con số tổng hợp toàn xã đều sai, và không ai phát hiện ra |
| **AI làm gì**      | Khi gõ tên vật tư mới, so khớp ngữ nghĩa với danh mục hiện có và hỏi lại:*"Có phải bạn định nhập vào **WATER-01 · Nước uống đóng chai**? Kho đang có 120 chai."*                                                             |
| **Dữ liệu**        | Hạ tầng`semantic/rank` và `nomic-embed-text` **đã có sẵn** — chỉ đổi hướng dùng từ tra cứu sang nhập liệu                                                                                                                              |
| **Ranh giới**       | Chỉ gợi ý, người dùng vẫn tạo mã mới được nếu thật sự khác                                                                                                                                                                                        |
| **Công**            | 1–2 ngày ·**Trình diễn:** thấp                                                                                                                                                                                                                         |

**Tỉ lệ lợi trên công cao nhất trong toàn bộ danh sách.** Dùng lại hạ tầng đã có, chặn đúng loại lỗi làm hỏng dữ liệu ở gốc.

#### A3. Phát hiện bất thường trong nhật ký hậu kiểm

|                            |                                                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bài toán thật** | `AuditLog` ghi đủ 5W nhưng chỉ tra được bằng tay. Không ai đọc hết, nên nó là bằng chứng khi cần chứ không phải công cụ phát hiện                                                                             |
| **AI làm gì**      | Quét định kỳ, nêu mẫu đáng chú ý: xuất kho ngoài giờ hành chính; một người điều chỉnh giảm nhiều lần trên cùng mã hàng; lý do rỗng nghĩa; chuỗi thao tác lệch hẳn thói quen của chính người đó |
| **Dữ liệu**        | `AuditLog` — đã có                                                                                                                                                                                                                 |
| **Ranh giới**       | **Nêu để người xem**, tuyệt đối không kết luận ai sai. Ngôn từ phải trung tính: *"đáng xem lại"*, không phải *"nghi ngờ gian lận"*                                                                       |
| **Công**            | 3–4 ngày ·**Trình diễn:** khá                                                                                                                                                                                                |

Cần cẩn trọng: đây là công cụ chạm tới danh dự cán bộ. Thà bỏ sót còn hơn vu oan, nên đặt ngưỡng cao và luôn kèm ngữ cảnh đầy đủ.

#### A4. Kiểm tra ảnh bằng chứng ngay lúc chụp

|                            |                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bài toán thật** | `MissionDeliveryPhoto` đang lưu ảnh mà **không có xử lý nào**. Ảnh mờ, tối, hoặc chụp nhầm chỉ bị phát hiện lúc hậu kiểm — khi đội đã rời hiện trường và không chụp lại được                 |
| **AI làm gì**      | Ngay trên điện thoại, trước khi gửi: cảnh báo ảnh quá mờ, quá tối, hoặc**trùng với ảnh đã nộp ở nhiệm vụ khác** (so khớp bằng hàm băm tri giác). Gợi ý chụp lại khi người dùng còn đứng đó |
| **Dữ liệu**        | Ảnh đã có                                                                                                                                                                                                                              |
| **Ranh giới**       | **Chỉ xét ảnh dùng được hay không, không phán xét nội dung.** Không nhận diện khuôn mặt, không đếm hàng, không kết luận "có giao hay không"                                                                |
| **Công**            | 2–3 ngày ·**Trình diễn:** khá                                                                                                                                                                                                  |

Phần khó nhất (mờ, tối, trùng lặp) làm được bằng xử lý ảnh cổ điển ngay trên máy, **không cần mô hình thị giác** — nhẹ, chạy offline, không tốn GPU. Ranh giới hẹp này cũng là điều nên nói rõ khi thuyết minh: nó tránh được toàn bộ vùng nhạy cảm về dữ liệu cá nhân.

---

### Nhóm B — Làm mạnh phần khẩn cấp đã có

#### B1. Đối chiếu lời kể với dữ liệu thật

|                            |                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bài toán thật** | `/parse` bóc tách số từ lời kể, nhưng **không ai kiểm số đó có hợp lý không**. Trưởng thôn nói nhầm "200 người" thay vì "20" thì phương án phồng gấp mười, và sai số đó chảy thẳng xuống lệnh xuất kho |
| **AI làm gì**      | Đối chiếu với dữ liệu đã biết về thôn đó — dân số, số hộ, các lần báo trước — rồi cảnh báo:*"Thôn Long Châu có khoảng 180 nhân khẩu. Con số 200 người mắc kẹt gần bằng toàn thôn. Xác nhận lại?"*        |
| **Dữ liệu**        | `Hamlet` + lịch sử `Mission` — đã có                                                                                                                                                                                                          |
| **Ranh giới**       | Hỏi lại,**không tự sửa số**                                                                                                                                                                                                                 |
| **Công**            | 2 ngày ·**Trình diễn:** cao                                                                                                                                                                                                                   |

Đây là phần mở rộng tự nhiên của lớp neo số liệu: hiện đang neo vào *câu chữ*, bước tiếp là neo vào *thực tế*. Cùng một triết lý, và kể chuyện rất tốt khi thuyết minh.

#### B2. Tóm tắt diễn biến nhiệm vụ

|                            |                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Bài toán thật** | Nhiệm vụ chạy vài giờ có thể tích hàng chục`MissionFieldUpdate`. Người vào ca sau phải đọc lại từ đầu |
| **AI làm gì**      | Tóm tắt theo mốc: đã giao gì, còn nợ kho nào, hiện trường báo gì mới nhất, việc kế tiếp là gì          |
| **Dữ liệu**        | `MissionFieldUpdate` + `MissionWarehouseRequest` — đã có                                                            |
| **Công**            | 2 ngày ·**Trình diễn:** khá                                                                                      |

#### B3. Hàng đợi ưu tiên cho suy luận

|                            |                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bài toán thật** | Một GPU, một yêu cầu tại một thời điểm. Việc chạy nền tranh chỗ với người đang bấm nút, gây quá hạn 90 giây — chính chú thích trong`main.py` đã ghi nhận |
| **Làm gì**         | Hai mức ưu tiên: người bấm luôn được phục vụ trước việc nền. Dừng gọi nền khi tab ẩn. Hiển thị vị trí trong hàng đợi thay vì quay vòng vô định           |
| **Công**            | 2 ngày ·**Trình diễn:** thấp, nhưng **cứu buổi demo**                                                                                                                |

Không phải tính năng AI mới, nhưng nó quyết định mọi tính năng AI khác có dùng được lúc đông người hay không. **Nên làm trước nhóm A.**

---

### Nhóm C — Đáng cân nhắc, chưa nên làm ngay

#### C1. Đọc kết quả thành tiếng (TTS tiếng Việt)

Đội hiện trường đang lái xe, tay bận. Hiện đã có đường vào bằng giọng nói (PhoWhisper) nhưng **chưa có đường ra**. Hoàn tất vòng thoại sẽ rất ấn tượng khi trình diễn.

Nhưng: cần thêm một mô hình chạy tại chỗ, tranh GPU với LLM và PhoWhisper, và tiếng Việt có dấu đọc sai thì phản tác dụng. **Công 4–5 ngày, trình diễn rất cao, giá trị vận hành trung bình.** Chỉ làm khi B3 xong.

#### C2. Hỏi đáp trên lịch sử vận hành

Mở rộng trợ lý từ "kho đang có gì" sang "tháng trước xuất bao nhiêu áo phao cho Long Châu". Cần lớp chuyển câu hỏi thành truy vấn có kiểm soát — **không được để mô hình sinh SQL tự do**. Công 5–6 ngày.

#### C3. Nâng mô hình ngôn ngữ

`qwen3.5:4b` là trần thấp. Bản 7–8B suy luận tốt hơn rõ rệt nhưng cần thêm VRAM và chậm hơn. Nên **đo trước khi đổi**: `scripts/evaluate_ollama.py` đã có sẵn, chạy so sánh trên chính dữ liệu của mình rồi hãy quyết.

---

### Bảng tổng hợp

| #  | Tính năng                                | Công      | Giá trị vận hành | Trình diễn       |
| -- | ------------------------------------------ | ---------- | -------------------- | ------------------ |
| B3 | Hàng đợi ưu tiên suy luận            | 2 ngày    | Cao                  | Thấp              |
| A2 | Chuẩn hoá tên vật tư lúc nhập       | 1–2 ngày | **Rất cao**   | Thấp              |
| B1 | Đối chiếu lời kể với dữ liệu thật | 2 ngày    | Cao                  | **Cao**      |
| A4 | Kiểm tra ảnh bằng chứng                | 2–3 ngày | Cao                  | Khá               |
| B2 | Tóm tắt diễn biến nhiệm vụ           | 2 ngày    | Trung bình          | Khá               |
| A3 | Bất thường trong nhật ký hậu kiểm   | 3–4 ngày | Cao                  | Khá               |
| A1 | Soát báo cáo kiểm kê tháng           | 4–5 ngày | **Rất cao**   | Trung bình        |
| C1 | Đọc kết quả thành tiếng              | 4–5 ngày | Trung bình          | **Rất cao** |
| C2 | Hỏi đáp trên lịch sử                 | 5–6 ngày | Trung bình          | Khá               |

**Nếu chỉ làm được ba việc:** B3 → A2 → B1. Cái đầu làm mọi thứ còn lại dùng được, cái thứ hai chặn lỗi dữ liệu ở gốc với công thấp nhất, cái thứ ba vừa có giá trị thật vừa kể chuyện tốt trước ban giám khảo.

---

## Phần 4 — Những gì KHÔNG nên thêm

Nêu rõ để khỏi mất công, và vì mỗi mục đều có lý do nghiệp vụ chứ không phải ngại khó.

**Đừng để AI tự duyệt hay tự xuất kho.** Nguyên tắc *"máy tính toán, người quyết định"* là điểm mạnh của sản phẩm khi thuyết minh, không phải hạn chế cần gỡ.

**Đừng nhận diện khuôn mặt trong ảnh hiện trường.** Chạm thẳng vào Nghị định 13/2023 về bảo vệ dữ liệu cá nhân, trong khi giá trị nghiệp vụ gần bằng không. Tài liệu dự thi đã liệt kê nó vào phần ngoài phạm vi có chủ đích — **giữ nguyên như vậy**.

**Đừng để mô hình sinh SQL tự do.** Một câu lệnh sai trên cơ sở dữ liệu vận hành thật là mất dữ liệu, không phải câu trả lời sai.

**Đừng dự báo thiên tai bằng mô hình tự huấn luyện.** Đó là việc của cơ quan khí tượng, cần dữ liệu và thẩm quyền mà xã không có. Nối vào nguồn cảnh báo chính thức thì đúng; tự dự báo thì sai vai.

**Đừng thêm chatbot trả lời tự do cho người dân.** Hệ thống này phục vụ cán bộ vận hành. Mở ra cho công chúng là mở ra bề mặt sai sót và trách nhiệm mà xã không gánh nổi.

**Đừng chạy theo số lượng tính năng AI.** Mười tính năng nông không bằng lớp neo số liệu đã có làm cho thật vững. Nếu phải chọn giữa thêm một tính năng mới và làm B3 cho phần AI hiện tại chạy ổn lúc đông người — chọn B3.

---

## Phần 5 — Giới hạn của bản rà soát này

- **Chưa đo hiệu năng mô hình.** Các nhận định về `qwen3.5:4b` là suy ra từ kích thước mô hình và từ chú thích trong mã, chưa chạy `scripts/evaluate_ollama.py` để đối chiếu.
- **Ước lượng ngày công là phỏng đoán**, chưa tách việc chi tiết.
- **Chưa khảo sát người dùng thật.** Thứ tự ưu tiên dựa trên đọc mã và suy luận nghiệp vụ. Một buổi ngồi cùng trưởng thôn xem họ làm kiểm kê tháng có thể đảo lại toàn bộ bảng xếp hạng — và nếu có cơ hội thì nên làm điều đó trước khi viết dòng mã đầu tiên.
