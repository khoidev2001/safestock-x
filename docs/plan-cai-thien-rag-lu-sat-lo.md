# Kế hoạch: Cải thiện RAG trợ lý cứu hộ — phạm vi Lũ / Sạt lở / Bão

> Bản v2 — đã **review khó tính + kiểm chứng bằng thực nghiệm production-path**. Mọi khẳng định dưới đây đều có số đo kèm theo, không phải phỏng đoán.

## Phạm vi đã chốt với user (2026-07-24)
- **CHỈ** làm: Lũ lụt / ngập / lũ quét · Sạt lở đất · Bão (vì kèm mưa lớn/lũ) · Nước & nhóm dễ tổn thương.
- **LOẠI khỏi phạm vi** (làm sau khi app phình to): tiêu chảy/ORS, rắn cắn, bỏng, y tế đa khoa không gắn trực tiếp lũ/sạt lở/bão.
- Ưu tiên: **cân bằng cả hai** — sửa recall + bổ sung corpus đúng phạm vi.
- Ràng buộc nền: tiếng Việt; không commit khi chưa được yêu cầu; hành chính 2 cấp (tỉnh/xã); mọi số/nội dung corpus đọc từ **nguồn gốc thật**, thiếu nguồn thì bỏ chunk.

## Những gì review khó tính đã lật được (khác plan v1)

### Phát hiện 1 — Câu "mắc kẹt lũ" KHÔNG đi qua RAG (bị emergency tier chặn)
Luồng chat thật có 3 tier ([assistant.service.ts:28-37](../apps/backend/src/assistant/assistant.service.ts#L28)): `resolveEmergencyAnswer` → `resolveAssistantFastAnswer` → RAG. Đã verify bằng dist thật:

| Câu hỏi | Tier bắt | Có tới RAG? |
|---|---|---|
| "Có người mắc kẹt trong vùng lũ…" | **EMERGENCY** ("mắc kẹt" ∈ high-signal) | ❌ KHÔNG |
| "Bão số sắp đổ bộ nên làm gì?" | xuống RAG | ✅ CÓ |
| "Trẻ em/người già lưu ý khi thiếu nước" | xuống RAG | ✅ CÓ |
| "Sắp có bão lớn kho chuẩn bị gì" | xuống RAG | ✅ CÓ |

⇒ **Chunk RAG cho "mắc kẹt" gần như vô ích trong chat** (người dùng nhận câu deterministic của emergency tier). Plan v1 đã tính nhầm đây là câu RAG cần cứu. Câu RAG thật sự cần cứu qua chat chỉ còn: **"bão đổ bộ"** và các biến thể **chuẩn bị/ứng phó bão-lũ** không chứa từ khoá khẩn cấp.

### Phát hiện 2 — Đổi heading KHÔNG phải "đòn bẩy chính" (chỉ cứu 1/3)
Kiểm chứng bằng **retriever thật** (embed lại bằng nomic, tham số production `min_score=.65, high=.88, margin=.005`):

| Câu MISS | Sau khi đổi heading | Lý do |
|---|---|---|
| Trẻ em/người già thiếu nước | ✅ **FIX** (cos 0.828, anchor∩=6) | heading mới trùng 6 token |
| Bão đổ bộ | ❌ vẫn MISS | chỉ trùng **1** token ("bão"); gate cần ≥2 |
| Mắc kẹt lũ | ❌ vẫn MISS | chỉ trùng 1 token ("lũ") — mà câu này vốn không tới RAG (PH1) |

Nguyên nhân gốc đo được: gate thật sự **duy nhất** là `answerable = anchor_overlap >= 2` ([knowledge.py:288](../apps/ai-service/knowledge.py#L288)). Ngưỡng bypass `high_confidence_score=0.88` **gần như dead-path**: đo self-similarity (query = đúng heading) cosine trần chỉ **0.887**, trung bình 0.833, **1/11 chunk** đạt 0.88. Câu hỏi tự nhiên (khác heading) hầu như không bao giờ bypass ⇒ **không được nới gate** (đã thử: nới làm trích nhầm nguồn + vỡ `test_quantity_queries_do_not_bypass_topic_answerability`).

### Phát hiện 3 — Chunk mới đúng chủ đề mới là đòn bẩy chính (cứu nốt phần còn lại)
Kiểm chứng bằng retriever thật, thêm 2 chunk proxy (heading chứa ≥2 token câu hỏi):

| Câu | Kết quả | 
|---|---|
| Bão đổ bộ | ✅ FIX (cos 0.765) → chunk "Chuẩn bị khi bão sắp đổ bộ…" |
| (mắc kẹt lũ — chỉ có ích cho /knowledge/search, không cho chat) | ✅ FIX (cos 0.782) |
| **3 câu bẫy** (nước xiết số lượng · thủ đô Pháp · giá vàng) | ✅ **VẪN TỪ CHỐI cả 3** — an toàn giữ nguyên |

## Kết luận đảo trọng số so với v1
1. **Đòn bẩy CHÍNH = thêm chunk mới đúng chủ đề, heading giàu từ khoá** (Phần 2). Đây là thứ cứu được câu "bão".
2. **Đổi heading chunk cũ = phụ trợ**, chỉ hiệu quả khi câu hỏi vốn đã trùng ≥2 token nội dung (như "trẻ em/người già") (Phần 1).
3. **Tuyệt đối không đụng gate/threshold** — chúng là lá chắn chống trích dẫn sai, đã đo là cần thiết.
4. Câu khẩn cấp ("mắc kẹt", "cô lập"…) **do emergency tier lo, không phải RAG** — không phí công tối ưu RAG cho chúng.

## Kế hoạch thực hiện

### Phần 1 — Làm giàu heading (phụ trợ, an toàn, KHÔNG bịa)
Chỉ đổi **heading**, giữ nguyên 100% thân bài + nguồn. Đã kiểm: không test nào phụ thuộc corpus thật (test chỉ dùng fixture `tmp_path`/mock) nên suite an toàn.
- `phan-loai-uu-tien-nan-nhan.md`: "Ưu tiên nhóm dễ tổn thương…" → **"Ưu tiên trẻ em, người già, người bệnh — nhóm dễ tổn thương khi thiếu nước"** (đã kiểm: fix câu trẻ em/người già, cos 0.828).
- `tieu-chuan-sphere.md`: "Nhu cầu khác nhau theo từng người" → **"Nhu cầu nước khác nhau ở trẻ em, người già, người khuyết tật"**.
- `quy-trinh-ung-pho-bao-lu.md` (2 heading): thêm từ khoá "bão, mưa lớn, lũ, sơ tán, chia cắt" — hỗ trợ recall, dù đòn bẩy chính là Phần 2.

### Phần 2 — Thêm chunk mới đúng phạm vi (ĐÒN BẨY CHÍNH — cần tra nguồn thật khi implement)
Mỗi chunk phải có **nguồn gốc thật đọc trực tiếp**, đúng format README corpus, 80–150 từ (≤220). Nguồn: Cổng PCTT VN, Sphere 2018, IFRC 2020.
1. **"Chuẩn bị khi bão sắp đổ bộ và mưa lớn kéo dài"** — chằng chống, kê cao vật tư kho, dự trữ nước/lương thực, 4 tại chỗ, sơ tán sớm. (Đã kiểm proxy: fix câu "bão đổ bộ".)
2. **"Cứu người mắc kẹt trong vùng lũ và nước ngập xiết"** — an toàn người cứu hộ, áo phao/dây/phao, không lội dòng xiết. ⚠️ *Chủ yếu phục vụ `/knowledge/search` & tra cứu; trong chat câu "mắc kẹt" bị emergency tier bắt trước. Vẫn nên có để corpus đầy đủ + phục vụ câu hỏi biến thể không kích hoạt emergency.*
3. **(Tuỳ nguồn)** chunk an toàn khi có dấu hiệu sạt lở nếu tìm được mục nguồn PCTT đủ cụ thể; không có nguồn → bỏ.

> Bổ sung việc cần cân nhắc: một số câu "chuẩn bị bão" có thể muốn trả lời **kết hợp snapshot kho + kiến thức** — hiện RAG và fast-answer tách rời. Không mở rộng kiến trúc trong đợt này; chỉ ghi nhận.

### Phần 3 — Tinh chỉnh prompt (không phá cơ chế an toàn)
- `_RAG_DRAFT_SYSTEM` ([main.py:116](../apps/ai-service/main.py#L116)): thêm hướng dẫn chọn evidence cho câu hỏi **hành động/quy trình** (chọn đủ câu mô tả bước xử lý, không chỉ định mức).
- `_render_evidence` ([main.py:432](../apps/ai-service/main.py#L432)): giữ trích nguyên văn + nguồn; chỉ tinh chỉnh câu dẫn cho bám chủ đề hỏi. Không đổi cơ chế chống bịa.
- `_ASSISTANT_SYSTEM`: rà lại nhất quán giọng điệu đã tune; không mở rộng phạm vi.

## Thứ tự thực thi
1. Phần 1 + Phần 2: sửa/tra nguồn → viết corpus → `build_knowledge_index.py --check` (bắt stale) → `build_knowledge_index.py` (rebuild, Ollama đang chạy :11434).
2. Đo lại recall qua `/knowledge/search`: câu "bão/chuẩn bị/trẻ em-người già" → có hit đúng; bộ câu bẫy → vẫn rỗng.
3. Phần 3: chỉnh prompt → **restart ai-service** (:8000, không autoreload).
4. Test tự động: `pytest apps/ai-service` giữ ≥ 60 pass; thêm test recall cho câu "bão đổ bộ" nếu ổn định.
5. **Live E2E qua chat thật** (backend :3100 → ai :8000): xác nhận câu "bão đổ bộ", "chuẩn bị bão" ra câu có nguồn, trình bày đẹp (Dạ/anh-chị, xuống dòng, bullet, dd/mm/yyyy). Câu "mắc kẹt lũ" vẫn ra emergency answer (đúng thiết kế).

## Kiểm chứng (định lượng)
- **Recall RAG-relevant (câu thật sự tới RAG):** "bão đổ bộ", "chuẩn bị trước bão/lũ", "trẻ em/người già thiếu nước" → có hit đúng chunk.
- **Không hồi quy an toàn:** câu bẫy vẫn từ chối; `pytest` xanh — đặc biệt `test_quantity_queries_do_not_bypass_topic_answerability`, `test_model_cannot_inject_claim_url_or_changed_unit`, `test_empty_evidence_returns_no_source_instead_of_false_citation`.
- **Chống bịa nguyên vẹn:** RAG render câu nguồn nguyên văn + URL thật; số kho từ snapshot backend.
- **Emergency tier không bị RAG lấn:** câu "mắc kẹt/cô lập" vẫn ra câu deterministic.

## Rủi ro & xử lý
- **Rebuild cần Ollama:** đang chạy; nếu down → `--check` báo stale, không âm thầm dùng vector cũ.
- **Đổi heading đổi chunk id + fingerprint:** đúng kỳ vọng; đã kiểm không test nào hard-code corpus thật.
- **Không tìm được nguồn chunk mới:** bỏ chunk (đúng hơn đủ).
- **nomic-embed điểm phẳng trên tiếng Việt (dải 0.64–0.83):** đã đo; là lý do giữ nguyên gate. Nếu sau này cần recall cao hơn nữa, hướng đúng là **đổi embedding model** (đề tài riêng), không nới gate.
- **Kỳ vọng người dùng vs thiết kế:** câu "mắc kẹt lũ" ra emergency answer chứ không trích nguồn RAG — cần nhớ khi demo, tránh hiểu nhầm "RAG không hoạt động".
