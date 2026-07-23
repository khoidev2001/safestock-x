# Kế hoạch: Tăng mật độ AI — RAG trợ lý + Nhập tình huống bằng lời (NL→plan)

_Lập ngày: 2026-07-23 · Đã chốt 2 hướng với người dùng (RAG + NL→plan); Vision để sau._

> Không phải nguồn trạng thái. Nguồn sự thật là code + [docs/PRD.md](PRD.md).

## 0. Trung thực về hiện trạng (tự khảo sát trước khi đề xuất)

| Thành phần | Bản chất hiện tại |
|---|---|
| Giải thích sự cố / nhận xét tháng (Ollama) | ✅ LLM thật |
| Trợ lý chat (`/assistant`) | ⚠️ LLM có, chỉ inject snapshot kho — **không có kiến thức domain, không trích nguồn** |
| Parse mô tả → tình huống (`/parse`) | ✅ **Đã có** backend + ai-service, **UI chưa dùng** |
| Readiness / luật sự cố / sinh plan | Rule-based |
| Forecast / trends | Thống kê (EWMA vừa nâng) |

**Hệ quả:** Hướng NL→plan (#2) backend đã hoàn chỉnh (`mission.controller.ts:23` `POST /missions/parse`;
`GeneratePlanDto.description`; `AiClientService.parse` có cache; ai-service `_PARSE_SYSTEM` + schema
`ParsedIncident` + retry). **Chỉ thiếu lớp UI.** Không tính đây là "tính năng mới" — gọi đúng là "kích hoạt
khả năng đã có + tinh chỉnh". Hướng RAG (#1) là phần AI mới thực sự.

---

## Phần A — RAG cho trợ lý (kiến thức cứu trợ có trích nguồn) ⭐ trọng tâm

### A1. Vì sao đây là "AI thật", không phóng đại

Trợ lý hiện chỉ tra số liệu kho. Hỏi "1 người/ngày cần bao nhiêu nước sạch?", "trẻ sơ sinh vùng lũ
cần gì?" → LLM **bịa tự do** (không nguồn, rủi ro sai). RAG = **embeddings + truy hồi ngữ nghĩa + LLM
sinh câu trả lời bám tài liệu, có trích dẫn**. Đây là pipeline AI không thể chối là "if-else":
vector hoá câu hỏi, cosine similarity, chèn ngữ cảnh, ràng buộc trả lời theo nguồn. Chạy **offline**
hoàn toàn bằng Ollama (`nomic-embed-text`), tác động xã hội rõ (cán bộ xã tra định mức chuẩn tại chỗ).

### A2. Corpus tri thức — `docs/knowledge/*.md` (tiếng Việt, GHI NGUỒN từng mục)

Mỗi file là 1 chủ đề, chia mục ngắn (mỗi mục ~80–150 từ, tự chứa) để chunk sạch:

- `dinh-muc-cuu-tro.md` — **đính chính theo PDF Sphere gốc**: 2,5–3 L/người/ngày cho lượng nước sống còn qua uống + thức ăn; 2–6 L vệ sinh; 3–6 L nấu ăn; tổng cơ bản 7,5–15 L; chỉ số tối thiểu trung bình 15 L cho uống + vệ sinh sinh hoạt. Ghi rõ phạm vi để không đánh đồng các mức; nhu cầu nhóm dễ tổn thương phải căn cứ nguồn.
- `tieu-chuan-sphere.md` — ngưỡng nhân đạo tối thiểu (nước, vệ sinh, chỗ ở, dinh dưỡng).
- `quy-trinh-ung-pho-bao-lu.md` — các bước trước/trong/sau bão lũ; sơ tán; an toàn cứu hộ.
- `phan-loai-uu-tien-nan-nhan.md` — nguyên tắc phân loại (trẻ em, người già, thương tật, thai phụ).
- `so-cuu-co-ban.md` — sơ cứu đuối nước, hạ thân nhiệt, vết thương, khi chưa có y tế.

> Nguồn tham chiếu: tiêu chuẩn Sphere, hướng dẫn phòng chống thiên tai VN (Luật PCTT), khuyến cáo
> y tế cơ bản. Ghi rõ cuối mỗi mục `> Nguồn: ...` để trích dẫn được. Không bịa số — chỉ đưa số có căn cứ.

### A3. Kỹ thuật (ai-service, giữ nguyên kiến trúc provider)

1. **Embedding provider** — thêm `providers/ollama.py::embed(text) -> list[float]` gọi
   `POST /api/embeddings` model `nomic-embed-text` (768 chiều, offline, free). Thêm interface
   `embed()` vào `base.py`; Gemini provider để `NotImplemented`/fallback (bản demo chạy Ollama).
2. **Build index offline** — `scripts/build_knowledge_index.py`: đọc `docs/knowledge/*.md` → tách theo
   heading `##`/`###` thành chunks {id, source, heading, text} → embed từng chunk → ghi
   `knowledge_index.json` (chunks + vector). Chạy 1 lần khi cài đặt; commit index để demo không cần
   re-embed (nêu rõ cách rebuild trong README).
3. **Retrieve lúc chạy** — `knowledge.py`: load index khi service start; `search(query, k=3)` = embed
   query → cosine similarity → top-k chunks kèm `source`. Pure Python/`math` (vài chục chunks, không
   cần numpy/faiss); nếu index rỗng/thiếu → trả `[]` (degrade an toàn, không vỡ).
4. **Nối vào `/assistant`** — trước khi gọi LLM: `hits = search(question)`; nếu có hits, chèn block
   `KIẾN THỨC THAM KHẢO (có nguồn): ...` vào prompt. Cập nhật `_ASSISTANT_SYSTEM`: "Nếu câu hỏi là kiến
   thức cứu trợ/định mức, ưu tiên dùng KIẾN THỨC THAM KHẢO và **trích nguồn [Nguồn: ...]**; nếu tài
   liệu không có → nói 'chưa có trong tài liệu tham khảo', KHÔNG tự bịa." Snapshot kho vẫn giữ nguyên
   cho câu hỏi tồn kho → trợ lý làm được cả hai.
5. **Endpoint phụ để demo/test** — `POST /knowledge/search {query}` trả top-k {source, heading, score}
   → chứng minh retrieval hoạt động độc lập với LLM (dễ quay demo, dễ viết test).

### A4. Backend + Frontend (tối thiểu, không phá hợp đồng)

- Backend: assistant không đổi luồng (ai-service tự RAG trong `/assistant`). Tuỳ chọn thêm proxy
  `GET /assistant/knowledge?q=` để UI có nút "Tra cứu tài liệu" — để sau nếu kịp.
- Frontend: trợ lý chat giữ nguyên; câu trả lời nay kèm "[Nguồn: dinh-muc-cuu-tro]" hiển thị tự nhiên.
  Không cần đổi component (chỉ nội dung answer giàu hơn).

### A5. Test / nghiệm thu phần A

- ai-service: test thuần `knowledge.py` — chunk parse đúng số mục; cosine similarity xếp hạng đúng
  (query "nước mỗi người" → hit `dinh-muc-cuu-tro` đứng đầu) dùng **vector giả cố định** (không cần
  Ollama trong CI). Test `/knowledge/search` với index mẫu nhỏ.
- Live (cần Ollama): hỏi "1 người cần bao nhiêu nước 1 ngày?" → trả đúng phạm vi 15L cho uống + vệ sinh sinh hoạt, hoặc 2,5–3L nếu hỏi riêng nước sống còn qua uống/thức ăn, kèm [Nguồn: ...]; hỏi thứ ngoài
  tài liệu → "chưa có trong tài liệu tham khảo" (không bịa).

---

## Phần B — Nhập tình huống bằng lời (NL→plan): kích hoạt UI cho khả năng đã có

### B1. Backend đã sẵn sàng (không sửa logic)

`POST /missions/parse {description}` → `ParsedIncident`. `generate-plan` nhận `description` HOẶC
`incident`. Chỉ cần UI dùng. (Nếu cần, tinh chỉnh prompt `_PARSE_SYSTEM` cho địa danh xã 2 cấp.)

### B2. Frontend — luồng "LLM trích xuất → người xác nhận → sinh plan" (hybrid trung thực)

- `mission-api.ts`: thêm `description?` vào `GenerateInput`; thêm `parseIncident(description)` gọi
  `POST /missions/parse`.
- `mission-view.tsx`: thêm ô **textarea "Mô tả tình huống bằng lời"** + nút **"Phân tích bằng AI"**.
  Bấm → gọi parse → **điền vào form số** (incidentType/affectedPeople/... ) cho admin **xem lại & sửa**
  trước khi "Lập phương án". Nguyên tắc: LLM trích xuất, **con người là trọng tài** — không giao phó mù.
  Giữ SAMPLES cứng làm ví dụ nhanh.
- (Tuỳ chọn wow, offline) **Nhập bằng giọng nói**: Web Speech API (`SpeechRecognition`, vi-VN) đổ text
  vào textarea. Comment DTO đã ghi "voice ở UI → text". Chạy trong trình duyệt, không thêm dependency.
  Làm sau khi luồng text chạy ổn.

### B3. Test / nghiệm thu phần B

- Frontend tsc exit 0. Luồng: gõ "Lũ quét xã Đồng Xuân, khoảng 200 người mắc kẹt, nhiều trẻ em, 3 ngày
  chưa có nước" → bấm Phân tích → form tự điền FLOOD/200/trẻ em>0 → sửa nếu cần → Lập phương án ra plan.
- Không phá E2E mission hiện có (vẫn gửi `incident` structured được).

---

## Thứ tự thực hiện đề xuất

1. **B trước** (nhanh, thấp rủi ro): nối UI NL→plan + (tuỳ chọn) voice → có ngay điểm "wow" từ hạ tầng
   sẵn có. ~ nửa buổi.
2. **A sau** (giá trị AI cao nhất): corpus `docs/knowledge/` → embed provider → index → retrieve →
   nối `/assistant` + trích nguồn → test. Đây là phần nâng "mật độ AI" mạnh nhất.

## Ranh giới an toàn (không phá cái đang chạy)

- ai-service RAG **degrade an toàn**: thiếu index/Ollama → `search` trả `[]`, `/assistant` vẫn chạy như cũ.
- Không đổi schema DB. Không đụng `computeForecast`/mission workflow/E2E.
- Giữ `_IDENTITY_GUARD` + `_redact_identity` (không lộ tên model) cho mọi câu trả lời RAG.
- Mọi số trong tài liệu tri thức phải có nguồn — đúng tinh thần "AI có trách nhiệm, trích dẫn được".

## Câu trả lời khi giám khảo hỏi "AI ở đâu / có bịa không?"

"Trợ lý dùng **RAG**: câu hỏi được vector hoá (embeddings `nomic-embed-text`, offline), truy hồi ngữ
nghĩa từ kho tài liệu cứu trợ, rồi LLM trả lời **bám tài liệu và trích nguồn**; ngoài tài liệu thì nói
thẳng 'chưa có', không bịa. Phần nhập liệu dùng LLM **trích xuất** tình huống từ lời kể, nhưng **con
người xác nhận** trước khi ra phương án — AI hỗ trợ, không thay người quyết định."
