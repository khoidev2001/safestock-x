# Kế hoạch tăng hàm lượng AI để dự thi "AI for Life"

_Lập ngày: 2026-07-22 · Chủ sở hữu: đội 2 dev · Mốc: còn > 1 tháng_

> File này là kế hoạch hành động, KHÔNG phải nguồn trạng thái. Nguồn sự thật vẫn là
> [docs/PRD.md](PRD.md). Khi làm xong hạng mục nào thì tick ở PRD, không tick ở đây.

## 1. Bối cảnh và chẩn đoán trung thực

Người dùng tự nhận thấy "tính AI trong app không nhiều". Sau khi đọc code thật
(không chỉ tài liệu), chẩn đoán:

**AI thật (generative) hiện có:**
- Parse tình huống tiếng Việt → JSON — [apps/ai-service/main.py:126](../apps/ai-service/main.py#L126)
- Sinh diễn giải Incident Action Plan — [main.py:217](../apps/ai-service/main.py#L217)
- Trợ lý hỏi-đáp kho + tình huống khẩn cấp — [assistant.service.ts](../apps/backend/src/assistant/assistant.service.ts)
- Chạy được local offline bằng Qwen 3.5 4B (điểm cộng thật, hiếm đội làm).

**Phần đang bị GỌI NHẦM là "AI" (thực chất là expert system / thống kê):**
- Readiness 6 chiều có trọng số — rule engine, không phải ML.
- Mission-to-Kit: greedy + FEFO + kho gần nhất — thuật toán, không phải ML.
- Incident evidence-fusion — rule engine theo ngưỡng.
- **Điểm yếu lộ nhất:** `forecast.ts` được quảng bá là "AI dự báo thiếu hụt" nhưng chỉ
  là **trung bình tuyến tính** `tồn / (tổng_xuất / số_ngày)` —
  [apps/backend/src/insights/forecast.ts:56](../apps/backend/src/insights/forecast.ts#L56).
  Không mô hình học, không mùa vụ, không độ tin cậy → dễ bị giám khảo bắt bài.

**Kết luận:** cảm nhận của người dùng đúng. Dùng AI *có trách nhiệm và đúng chỗ* là
tốt, nhưng **chiều sâu AI mỏng**. Không tự động trượt (thi AI-for-Life chấm nặng tác
động xã hội + ứng dụng thực tế + dùng AI hợp lý), nhưng cần vá 2 rủi ro:
1. Bị hỏi xoáy "AI ở đâu, có phải if-else?" mà chưa có câu trả lời chắc cho forecast/insight.
2. Demo gãy vì MVP mới 45-55% (5 blocker P0, workflow 3 vai trò chưa chạy qua phiên độc lập).

## 2. Quyết định phạm vi (đã chốt với người dùng 2026-07-22)

Người dùng chọn làm **cả 3 hướng**, mốc **> 1 tháng**:
- Track A — Làm mạnh câu chuyện AI + Q&A phản biện (chi phí thấp).
- Track B — Bổ sung 1-2 điểm AI có chiều sâu để demo.
- Track C — Ưu tiên khép MVP cho demo chạy mượt (P0 + workflow 3 vai trò).

Thứ tự ưu tiên đề xuất: **C (chống gãy) → B (tăng chất AI) → A (đóng gói câu chuyện)**,
làm xen kẽ nhưng C là điều kiện tiên quyết vì demo gãy mất điểm nặng nhất.

## 3. Track B — Bổ sung AI chiều sâu (trọng tâm câu hỏi gốc)

Chọn **2 tính năng**, ưu tiên theo tỉ lệ "tăng độ tin cậy AI / rủi ro demo":

### B1. RAG cho trợ lý — tra định mức có trích dẫn nguồn (KHUYẾN NGHỊ #1)

**Vì sao:** củng cố đúng nguyên tắc lõi "AI không bịa số" bằng **trích dẫn nguồn thật**
(Sphere Handbook, nghị định PCTT VN, tiêu chuẩn Hội CTĐ). Biến trợ lý từ "wrapper LLM"
thành **hệ hỏi-đáp có dẫn chứng** — đây là AI có chiều sâu, chống hallucination nhìn thấy được.

**Kiến trúc (bám code sẵn có):**
- Thêm corpus nhỏ: `docs/knowledge/` chứa định mức Sphere, quy định PCTT, quy trình kho
  (markdown, chia chunk).
- Embedding **local** (offline) qua Ollama (`nomic-embed-text` hoặc `bge-m3`) → lưu vector.
  Không cần vector DB nặng: JSON + cosine trong-bộ-nhớ là đủ ở quy mô corpus xã.
- Điểm cắm: [assistant.service.ts:35](../apps/backend/src/assistant/assistant.service.ts#L35).
  Trước khi gọi `ai.assistantAsk`, retrieve top-k chunk liên quan → chèn vào snapshot với
  nhãn `references`. LLM chỉ được trích dẫn, kèm câu "Theo [nguồn]...".
- Trả về kèm danh sách nguồn để UI hiển thị "Nguồn: Sphere Handbook, mục nước".

**Điều kiện nghiệm thu:** hỏi "định mức nước mỗi người mỗi ngày?" → trả 15 lít + trích
đúng nguồn Sphere; hỏi thứ ngoài corpus → nói "chưa có trong tài liệu tham chiếu".
Chạy offline hoàn toàn.

**Rủi ro:** thấp-trung bình. Không đụng nghiệp vụ tồn kho, không sửa transaction.

### B2. Nâng forecast: từ trung bình tuyến tính → có độ tin cậy + điểm đặt hàng lại

**Vì sao:** vá đúng điểm yếu lộ nhất. Không cần model ML nặng — dùng **EWMA (trung bình
trượt có trọng số mũ) + độ lệch chuẩn → khoảng tin cậy + reorder point (safety stock)**.
Trung thực gọi là "dự báo thống kê", KHÔNG gọi quá lên là deep learning.

**Kiến trúc:**
- Nâng [forecast.ts](../apps/backend/src/insights/forecast.ts): thêm EWMA thay mean phẳng,
  tính std của nhu cầu ngày → `daysLeftLow/daysLeftHigh` (khoảng), `reorderPoint`,
  `confidence` (dựa số điểm dữ liệu). Giữ hàm thuần, test được.
- UI Insights hiển thị dải tin cậy thay vì 1 con số.

**Điều kiện nghiệm thu:** SKU có lịch sử biến động → forecast cho khoảng + mức đặt lại;
unit test khóa công thức. SKU ít dữ liệu → `confidence` thấp, nêu rõ "dữ liệu chưa đủ".

**Rủi ro:** thấp. Thuần hàm số, có sẵn seed 156 giao dịch EXPORT 60 ngày để chứng minh.

### B3. (Tùy chọn, nếu còn thời gian) Voice input vi-VN → parse → kế hoạch

**Vì sao:** "wow" khi demo — cán bộ **nói** "lũ cô lập 100 người..." → ra Action Plan.
Whisper local (ASR) là AI thật, offline. Nối vào pipeline `/parse` sẵn có.

**Rủi ro:** trung bình (phụ thuộc thiết bị hội trường). Để P4/polish, không chặn demo chính.

**Chọn cho MVP dự thi: B1 + B2. B3 là stretch.**

### B4-B7. Tính AI bổ sung (người dùng chốt cả 4 — 2026-07-22)

Bốn tính năng này **dùng chung 1 hạ tầng embedding local** (đặt cùng B1 RAG) và đều
offline, đều tôn trọng "AI không bịa số". Ghép thành câu chuyện: *"AI đọc thời tiết +
tồn kho + định mức chuẩn → cảnh báo sớm và điều phối, chạy hoàn toàn offline tại xã"*.

**B4. Dự báo nhu cầu theo thời tiết** ⭐ hợp chủ đề thi nhất — rủi ro thấp
- Nối [insights/forecast.ts](../apps/backend/src/insights/forecast.ts) (tốc độ tiêu thụ)
  với [insights/weather.ts](../apps/backend/src/insights/weather.ts) (mưa 72h Open-Meteo,
  hiện chỉ cảnh báo ngưỡng 100mm).
- Logic: khi có cảnh báo mưa lớn → nhân hệ số nhu cầu nhóm WASH/RESCUE/FOOD → so với tồn
  khả dụng → "kho X thiếu áo phao trước lũ". Hệ số là rule minh bạch, LLM chỉ viết cảnh báo.
- Nghiệm thu: có mưa lớn dự báo → sinh cảnh báo nhu cầu tăng đúng nhóm vật tư; test thuần
  cho phần tính hệ số. Offline vẫn chạy phần forecast (thiếu weather thì nói rõ "không có dữ liệu mưa").
- Rủi ro: thấp. Không đụng transaction.

**B5. Semantic search vật tư** — AI thật, tái dùng embedding của B1
- Gõ "đồ giữ ấm cho trẻ" → ra chăn/màn/quần áo trẻ em dù không trùng từ khóa.
- Embedding local (Ollama) cho tên+mô tả SKU → cosine similarity. Làm 1 lần dùng cho cả RAG.
- Nghiệm thu: truy vấn ngữ nghĩa trả đúng nhóm vật tư liên quan; offline.
- Rủi ro: thấp-trung bình. Chỉ đọc catalog, không ghi.

**B6. Bản tin AI đầu ngày (Daily briefing)** — thể hiện "AI chủ động", dễ demo
- LLM tóm tắt readiness + forecast + incident đang mở + thời tiết thành 1 đoạn tiếng Việt
  cho lãnh đạo xã. Chỉ diễn giải số đã tính (giống pipeline /explain sẵn có).
- Nghiệm thu: sinh briefing đúng số từ snapshot, không thêm số ngoài; có nút xem trên dashboard.
- Rủi ro: thấp. Tái dùng cơ chế redact/chống-bịa-số của action-plan.

**B7. Chuẩn hóa nhập liệu bằng embedding** — giá trị thực tế, làm SAU khi inventory ổn
- Tên tự do "áo phao trẻ em" → gợi ý map về SKU chuẩn (dùng embedding B5).
- ⚠️ CẢNH BÁO: cắm vào luồng inventory đang là điểm yếu (Track C chưa khép). CHỈ làm sau
  khi transfer/contract inventory đã ổn định, và chỉ ở mức **gợi ý cho người xác nhận**,
  không tự động ghi. Nếu thời gian gấp → hạ xuống stretch.
- Rủi ro: trung bình (do vị trí cắm), giảm bằng cách chỉ gợi ý + người duyệt.

**Thứ tự đề xuất trong nhóm bổ sung: B4 → B5 → B6 → B7.** B4 hợp chủ đề nhất và rẻ; B5+B6
tái dùng hạ tầng; B7 để cuối vì phụ thuộc inventory ổn định.

## 4. Track C — Khép MVP cho demo không gãy (điều kiện tiên quyết)

Bám checklist P0/P1 trong [PRD.md](PRD.md). Tối thiểu cho demo an toàn:
- [ ] Transfer partial tách batch đúng `quantity`, atomic, scoped nguồn/đích (blocker #2).
- [ ] Workflow 3 vai trò ADMIN→RESCUE→WAREHOUSE chạy qua **3 phiên độc lập**, không mất
  state khi refresh (blocker #3); mission inbox + deep-link.
- [ ] Web trả vật tư đúng contract `{ ok, damaged, lost }` (blocker #4).
- [ ] Simulator demo-mode tách khỏi production stock (blocker #1).
- [ ] Kịch bản demo simulator → readiness realtime → (mobile/QR nếu có) chạy được (blocker #5).
- [ ] 1 browser E2E khóa đường demo chính (login → mission → readiness đổi).

## 5. Track A — Đóng gói câu chuyện AI + Q&A phản biện

- [ ] Cập nhật [docs/qa/tong-quan.md](qa/tong-quan.md): thêm câu trả lời chuẩn cho
  "forecast này AI ở đâu?" → thành thật gọi tên: "phần dự báo là thống kê có độ tin cậy;
  phần LLM là parse + diễn giải + RAG có trích dẫn; ranh giới rõ ràng là cố ý để AI không bịa số".
- [ ] Slide/nói: định vị hệ thống là **Decision Support System dùng AI có trách nhiệm**,
  nhấn RAG-trích-dẫn + offline local LLM là điểm khác biệt, không khoe "model to".
- [ ] Chuẩn bị demo RAG (hỏi định mức → ra nguồn) như bằng chứng "AI không bịa số".

## 6. Thứ tự thực hiện đề xuất (trong > 1 tháng)

1. **Tuần 1-2:** Track C blocker #2, #3, #4 (chống gãy demo) + B2 forecast (rẻ, thuần hàm).
2. **Tuần 3:** B1 RAG (corpus + embedding local + cắm vào assistant) + C blocker #1, #5.
3. **Tuần 4:** browser E2E đường demo chính, Track A đóng gói câu chuyện + Q&A.
4. **Dư địa:** B3 voice input nếu ổn định; nếu không, để hậu MVP.

## 7. Nguyên tắc bất biến khi làm (không được vi phạm)

- AI KHÔNG bịa số: RAG chỉ trích dẫn; forecast là thống kê minh bạch; mọi số vẫn từ backend.
- Không nhồi ML phức tạp gây rủi ro demo (đội 2 người, MVP mới 45-55%).
- Trung thực khi gọi tên công nghệ: expert system gọi là expert system, thống kê gọi là
  thống kê. Chính sự trung thực này là điểm mạnh trước giám khảo, không phải điểm yếu.
- Đơn vị hành chính 2 cấp (tỉnh + xã), không dùng "huyện".
