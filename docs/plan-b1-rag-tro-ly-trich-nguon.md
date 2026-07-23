# Kế hoạch B1 — RAG trợ lý cứu trợ có trích nguồn

## Context

Trợ lý hiện trả lời tốt dữ liệu vận hành từ snapshot kho, nhưng khi được hỏi kiến thức chuyên môn như định mức nước, sơ cứu, sơ tán hoặc ưu tiên nhóm dễ tổn thương, LLM chưa có kho tài liệu kiểm chứng và có thể trả lời từ trí nhớ mô hình. B1 bổ sung pipeline RAG chạy offline: câu hỏi → embedding → truy hồi tài liệu cứu trợ đã thẩm định → LLM tổng hợp → nguồn được hệ thống gắn xác định. Mục tiêu là biến RAG thành “ngôi sao AI” có thể chứng minh độc lập, đồng thời giữ nguyên nguyên tắc: số kho chỉ lấy từ backend, kiến thức chuyên môn chỉ lấy từ corpus, ngoài tài liệu thì nói chưa có.

Plan kế thừa `docs/plan-tang-mat-do-ai-rag-va-nl-plan.md` nhưng siết thêm 4 điểm để đi thi an toàn: nguồn phải kiểm chứng đến mục/trang; embedding tách khỏi chat provider; retrieval có ngưỡng chống nhét tài liệu không liên quan; citation ID được validate và render deterministic thay vì tin LLM tự viết.

> Khi bắt đầu thực thi, việc đầu tiên là lưu bản plan đã duyệt này thành file repo `docs/plan-b1-rag-tro-ly-trich-nguon.md`, đúng quy ước mọi plan phải có file `.md` thật trong dự án.

## Kết quả người dùng thấy

- Câu hỏi kiến thức cứu trợ, ví dụ “Một người cần bao nhiêu nước mỗi ngày trong tình huống khẩn cấp?”, được trả lời theo đúng phạm vi từng định mức và kèm nguồn cụ thể.
- Câu hỏi ngoài corpus trả lời “chưa có trong tài liệu tham khảo”, không dùng trí nhớ LLM để bịa.
- Câu hỏi tồn kho/readiness/thời tiết/sự cố vẫn đi luồng fast-answer và snapshot hiện tại, không chậm hơn và không đổi số liệu.
- Mất index, hỏng index, Ollama embedding tắt hoặc model mismatch: trợ lý vẫn hoạt động; với câu hỏi chuyên môn sẽ nói tài liệu chưa sẵn sàng thay vì trả lời không kiểm chứng.
- Endpoint nội bộ `/knowledge/search` cho phép demo riêng bước retrieval mà không cần tin vào phần văn của LLM.

## Kiến trúc khuyến nghị

```text
Frontend chat (không đổi)
  → Backend AssistantService (không đổi: emergency/fast answer trước)
  → AiClientService POST /assistant (không đổi contract)
  → ai-service
      1. KnowledgeRetriever.search(question)
      2. OllamaEmbeddingProvider → /api/embed, nomic-embed-text
      3. cosine + threshold → top 3 chunk đã thẩm định
      4. snapshot + question + retrieved chunks được đóng thành JSON dữ liệu
      5. có hit: LLM chỉ chọn sentence evidence IDs (K1S1...), không có field answer
         không hit/RAG lỗi: LLM chỉ dùng snapshot, cấm trả kiến thức chuyên môn không nguồn
      6. ai-service trả nguyên văn evidence + tự render nguồn từ metadata index
  → {answer: string} (backend/frontend không cần đổi)
```

### 1. Tách embedding provider khỏi LLM provider

Không thêm `embed()` vào `LLMProvider`, vì việc đó ép `GeminiProvider` phải triển khai embedding và buộc chat provider = embedding provider. Tạo interface riêng:

```python
class EmbeddingProvider(ABC):
    name: str
    model: str
    input_transform: str
    def embed(self, texts: list[str], *, task: Literal["document", "query"]) -> list[list[float]]: ...
```

- `build_provider()` giữ nguyên cho Gemini/Ollama chat.
- Thêm `build_embedding_provider()` độc lập; mặc định `EMBEDDING_PROVIDER=ollama` và `OLLAMA_EMBED_MODEL=nomic-embed-text`.
- Nhờ vậy demo có thể dùng Gemini cho sinh câu trả lời nhưng vẫn retrieval offline bằng Ollama; B5/B7 tái sử dụng cùng interface.
- Với `nomic-embed-text`, provider áp dụng đúng prefix theo task (`search_document:` / `search_query:`); `inputTransform` được ghi vào index để tránh query/index dùng hai cách vector hóa khác nhau.

### 2. Ollama API tương thích

- Ưu tiên API hiện hành `POST /api/embed` với batch `input` để build index nhanh.
- Chỉ khi `/api/embed` trả 404/405 mới fallback API legacy `POST /api/embeddings` từng text; không fallback mù trên 429/500/timeout.
- Validate chặt: số vector = số input, vector không rỗng, các vector cùng chiều, mọi phần tử hữu hạn.
- Payload dùng model embedding riêng, `truncate=false`, `keep_alive="30m"`; lỗi quá dài phải hiện rõ ở build, không cắt âm thầm.

### 3. Corpus có cổng kiểm duyệt nguồn

Tạo `docs/knowledge/README.md` mô tả quy chuẩn biên tập và 5 file chủ đề:

- `dinh-muc-cuu-tro.md`
- `tieu-chuan-sphere.md`
- `quy-trinh-ung-pho-bao-lu.md`
- `phan-loai-uu-tien-nan-nhan.md`
- `so-cuu-co-ban.md`

Mỗi section `##`/`###` là một chunk tự chứa, mục tiêu 80–150 từ, kết thúc bằng ít nhất một dòng nguồn chuẩn hóa:

```md
> Nguồn: Sphere Handbook 2018 | WASH Standard ..., trang ... | https://... | truy cập 2026-07-23
```

Quy tắc bắt buộc:

- Chỉ dùng nguồn gốc/nguồn chính thức hoặc tổ chức chuyên môn uy tín: Sphere Standards, cơ quan PCTT Việt Nam, Bộ Y tế/WHO/IFRC tùy chủ đề.
- Trước khi ghi bất kỳ con số nào phải mở tài liệu gốc và ghi đúng tên tài liệu + mục/trang + URL + ngày truy cập; không chép số từ trí nhớ hoặc từ plan cũ.
- Định mức nước phải tách rõ phạm vi (uống/nấu ăn sống còn so với tổng nhu cầu cơ bản gồm vệ sinh); không trả một con số duy nhất gây hiểu nhầm. Nếu tài liệu gốc không xác nhận, bỏ con số khỏi corpus.
- Nội dung sơ cứu chỉ là hành động ban đầu từ hướng dẫn chính thức, không thay thế nhân viên y tế và không tự thêm số điện thoại chưa kiểm chứng.
- Không dùng đơn vị hành chính “huyện”; chỉ tỉnh + xã theo mô hình 2 cấp.
- Parser/build phải fail nếu chunk thiếu nguồn, URL không hợp lệ, ID trùng, chunk rỗng/quá dài hoặc có vector không hợp lệ. Topic chưa tìm được nguồn tốt thì để ít nội dung hoặc hoãn, tuyệt đối không điền cho đủ 5 file.

### 4. Index JSON có version và fingerprint

Index đặt tại `apps/ai-service/knowledge_index.json`, được sinh bằng script, không sửa tay và được track trong repo. Schema:

```json
{
  "schemaVersion": 2,
  "builtAt": "ISO-8601 UTC",
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "digest": "SHA-256 artifact Ollama",
    "dimension": 768,
    "inputTransform": "nomic-search-prefix-v1"
  },
  "corpus": {
    "contentSha256": "...",
    "chunkCount": 0
  },
  "chunks": [
    {
      "id": "dinh-muc-cuu-tro--nuoc-khan-cap",
      "document": "dinh-muc-cuu-tro.md",
      "heading": "...",
      "text": "...",
      "textSha256": "...",
      "sources": [
        {"title": "...", "locator": "...", "url": "https://...", "accessedAt": "2026-07-23"}
      ],
      "embedding": [0.0]
    }
  ]
}
```

- Build sort file + heading để ID/thứ tự ổn định; hash toàn corpus và từng chunk.
- `--check` parse corpus hiện tại, so `contentSha256`, model/transform/dimension/chunk count với index đã commit và exit khác 0 nếu stale.
- Runtime validate schema version, model, input transform và dimension trước search. Không đọc index global theo cách có thể làm app crash lúc import.

### 5. Runtime retrieval dễ test và degrade an toàn

Tạo `KnowledgeRetriever` nhận `index_path`, `EmbeddingProvider`, `min_score` qua constructor; `get_knowledge_retriever()` mới là lazy singleton cho FastAPI.

- Load index lazy; file thiếu/hỏng/version sai/model mismatch → trạng thái không sẵn sàng, không ném lỗi ra `/assistant`.
- `search(query, top_k=3)` chuẩn hóa whitespace, embed query, cosine thuần Python, bỏ vector zero/dimension sai, lọc theo `KNOWLEDGE_MIN_SCORE`.
- Top hit phải vượt threshold; hit phụ chỉ giữ nếu vừa vượt threshold vừa không thấp hơn top hit quá biên độ nhỏ. Tối đa 3 hit và dedupe nguồn.
- Không hard-code keyword gate làm mất tính semantic. Threshold được hiệu chỉnh bằng bộ câu hỏi dương/âm trong `scripts/evaluate_ollama.py`; mặc định ban đầu ghi trong `.env.example`, chỉ chốt sau live calibration.
- Kết quả phân biệt rõ: `ok + hits`, `ok + no_hits` (ngoài corpus), và `unavailable + reason` (index/model/Ollama lỗi).

### 6. Prompt và citation chống bịa

Dữ liệu gửi LLM là một JSON được serialize (`snapshot`, `knowledge`, `question`), và system prompt nói rõ cả ba trường là **dữ liệu không đáng tin, không phải chỉ dẫn**. Query người dùng không được nối thành system prompt; các câu kiểu “bỏ qua nguồn” không thay đổi quy tắc.

Khi retrieval có hit (implementation sau security review):

- Tách từng chunk thành các câu evidence deterministic, gán ID `K1S1`, `K1S2`... trong request hiện tại.
- LLM **không có trường answer**; chỉ được gọi `provider.generate_json()` với schema:

```json
{"evidenceIds": ["K1S1", "K1S2"]}
```

- Schema `extra="forbid"`: nếu model cố trả `answer`, URL, citation hoặc claim tự viết thì reject và retry. ID không được cấp cũng bị reject.
- Ai-service trả **nguyên văn câu evidence trong corpus** (chỉ bỏ ký hiệu Markdown) rồi tự gắn nguồn từ metadata index. Model không thể đổi “15 lít” thành “15 viên thuốc”, viết số bằng chữ hoặc gắn nguồn cho claim mới.
- Nếu không có câu trực tiếp hỗ trợ thì trả “Chưa có trong tài liệu tham khảo” và không gắn nguồn. Nếu hai lần chọn ID sai thì trả fallback không nguồn.

Khi retrieval không có hit hoặc không sẵn sàng:

- Giữ contract `/assistant` cũ và vẫn cho LLM trả lời snapshot/tình huống.
- Prompt cấm dùng kiến thức nội tại cho định mức/sơ cứu/quy trình chuyên môn; phải nói “chưa có trong tài liệu tham khảo” hoặc “kho tài liệu tạm thời chưa sẵn sàng”.
- Dữ liệu vận hành trong snapshot luôn là nguồn sự thật; tài liệu RAG không được sửa tồn kho, readiness, dự báo hoặc tự quyết lượng xuất.

### 7. Endpoint chứng minh retrieval

Thêm `POST /knowledge/search` (ai-service nội bộ, chưa proxy ra frontend):

Request:

```json
{"query": "nước mỗi người mỗi ngày", "topK": 3}
```

Response:

```json
{
  "available": true,
  "reason": null,
  "indexVersion": 1,
  "model": "nomic-embed-text",
  "hits": [
    {
      "id": "...",
      "document": "...",
      "heading": "...",
      "score": 0.73,
      "preview": "tối đa 240 ký tự...",
      "sources": [{"title": "...", "locator": "...", "url": "https://..."}]
    }
  ]
}
```

- `query` 2–500 ký tự, `topK` 1–5.
- Không trả embedding hoặc toàn bộ index; preview được cắt deterministic.
- Lỗi validation → 422. Thiếu/hỏng index/Ollama → HTTP 200 với `available=false`, reason code ổn định (`index_missing`, `index_invalid`, `model_mismatch`, `embedding_unavailable`, `dimension_mismatch`) và `hits=[]`; không lộ stack trace/path nội bộ.

## File tạo/sửa

### Tạo mới

- `docs/plan-b1-rag-tro-ly-trich-nguon.md` — bản plan repo sau khi được duyệt.
- `docs/knowledge/README.md` và 5 file corpus nêu trên.
- `apps/ai-service/providers/embedding.py` — interface `EmbeddingProvider`.
- `apps/ai-service/providers/ollama_embedding.py` — `/api/embed` + legacy fallback.
- `apps/ai-service/knowledge.py` — parser/index validation/cosine/retriever/context+citation rendering.
- `apps/ai-service/scripts/build_knowledge_index.py` — build + `--check`.
- `apps/ai-service/knowledge_index.json` — artifact sinh từ corpus thật.
- `apps/ai-service/tests/test_knowledge.py` — parser/index/search/degrade/citation.
- `apps/ai-service/tests/test_ollama_embedding.py` — mock HTTP current/legacy/error validation.
- `apps/ai-service/tests/test_assistant_rag.py` — mock retriever + mock LLM cho `/assistant` và `/knowledge/search`.
- `apps/ai-service/requirements-dev.txt` — khai báo pytest để môi trường test tái lập được (production requirements không chứa pytest).

### Sửa

- `apps/ai-service/providers/factory.py` — `build_embedding_provider()` độc lập.
- `apps/ai-service/schemas.py` — request/response `/knowledge/search` + draft RAG nội bộ nếu đặt tại đây.
- `apps/ai-service/main.py` — prompt RAG, retrieval, structured draft, deterministic citations, endpoint search.
- `apps/ai-service/scripts/evaluate_ollama.py` — golden queries dương/âm, kiểm citation và no-answer ngoài corpus.
- `apps/ai-service/README.md` — kiến trúc, pull model, build/check index, run tests, degrade.
- `.env.example` — `EMBEDDING_PROVIDER=ollama`, `OLLAMA_EMBED_MODEL=nomic-embed-text`, `KNOWLEDGE_MIN_SCORE=<giá trị sau calibration>`.
- `docs/HUONG-DAN-CAI-DAT-VA-CHAY.md` — pull cả chat model + embedding model; index đã commit nhưng query vẫn cần model embedding.
- `docs/qa/tong-quan.md` — cập nhật “AI ở đâu?”, “RAG có bịa nguồn không?”, “mất Ollama/index thì sao?”.
- `docs/checklist-cong-viec-con-lai.md` — tick B1 từng mục chỉ sau khi code, corpus, test và live acceptance thật sự hoàn tất.

Không đổi schema DB, backend hay frontend trong B1. Giữ nguyên `AssistantService.ask()` và các fast path hiện có.

## Thứ tự triển khai

1. **Lưu plan repo + khóa nguồn**: tạo file plan; mở tài liệu gốc, ghi source locator; viết corpus với validator source trước khi có embedding.
2. **Embedding adapter**: interface riêng + Ollama batch/current + legacy fallback + factory/env; viết test HTTP mock trước.
3. **Chunk/index builder**: parser deterministic, source validation, hash/version/fingerprint, `build` và `--check`; unit test không cần Ollama.
4. **Sinh index thật**: `ollama pull nomic-embed-text`, build index, review kích thước/chunk/source, commit artifact vào working tree (không git commit nếu user chưa yêu cầu).
5. **Runtime retrieval**: lazy loader, cosine, threshold/top-k, reason codes; test vector giả cho positive/negative/dimension/error.
6. **Nối `/assistant` an toàn**: JSON data boundaries, draft structured, citation subset validation, deterministic renderer, no-hit/unavailable policy.
7. **Endpoint `/knowledge/search`**: response metadata/preview, không vector/full corpus.
8. **Đánh giá live + calibration**: chạy golden set trên Ollama, chốt `KNOWLEDGE_MIN_SCORE` dựa trên dương/âm; rebuild nếu đổi transform/model.
9. **Docs/QA/checklist**: chỉ công bố “offline RAG có nguồn” sau khi live pass; ghi rõ giới hạn corpus.

## Ma trận kiểm thử

### Unit — không cần Ollama

- Parser tách đúng `##/###`, giữ heading/document, parse nhiều nguồn; fail khi thiếu nguồn/URL sai/ID trùng/chunk rỗng hoặc vượt giới hạn.
- Corpus linter bắt từ “huyện” và con số không nằm trong chunk có nguồn.
- Cosine: ranking đúng với vector giả; vector zero; dimension mismatch; top-k; threshold; dedupe.
- Index: thiếu file, JSON hỏng, schema version sai, model/transform/dimension mismatch, content hash stale (`--check`).
- Embedding HTTP: `/api/embed` batch đúng; 404/405 mới fallback legacy; 500/timeout không fallback; sai số vector, NaN/Infinity, vector rỗng bị reject.
- Citation: chỉ ID retrieve được chấp nhận; ID bịa/URL tự viết/không citation bị retry; fallback sau 2 lần; source renderer dedupe và không nhận text nguồn từ LLM.

### Integration mock — không cần model

- `/knowledge/search`: hit, no-hit, unavailable reason, input bounds và không lộ embedding/path.
- `/assistant` có hit: prompt nhận đúng snapshot/question/chunks dưới dạng JSON data; output có nguồn deterministic.
- `/assistant` query prompt injection không thay được source list hoặc quy tắc số kho.
- Retrieval ném timeout/index lỗi: `/assistant` vẫn gọi chat provider và trả snapshot answer an toàn.
- Không hit: câu hỏi kiến thức phải nói chưa có tài liệu; câu hỏi snapshot vẫn trả lời được.
- Identity guard/redaction vẫn áp dụng cho câu RAG.

### Regression

- Toàn bộ pytest ai-service, gồm 5 test voice hiện có.
- Backend `npx jest --silent`: giữ 202/202 hoặc cao hơn; đặc biệt emergency/fast-answer vẫn không gọi ai-service.
- Backend + frontend TypeScript `tsc --noEmit` sạch dù không đổi contract.

### Live acceptance — cần Ollama

1. Pull `nomic-embed-text`; build index và chạy `--check` pass.
2. `/knowledge/search` với các cách diễn đạt khác nhau về nước/sơ tán/sơ cứu trả đúng chủ đề; câu hỏi kho/chuyện phiếm không có hit vượt threshold.
3. `/assistant`: câu hỏi nước trả lời phân biệt rõ phạm vi định mức, không nhập nhằng 2,5–3L nước sống còn qua uống/thức ăn với 15L uống + vệ sinh sinh hoạt, và nguồn khớp metadata thật.
4. Hỏi nội dung ngoài corpus → nói chưa có; không xuất citation bịa.
5. Câu hỏi tồn kho → số y nguyên snapshot; không dùng định mức RAG để tự đề xuất số xuất.
6. Dừng Ollama embedding hoặc tạm đổi index hỏng → `/assistant` không sập; `/knowledge/search` trả reason an toàn.
7. Chạy `scripts/evaluate_ollama.py`, lưu kết quả golden set và threshold chốt vào QA evaluation docs.

## Rủi ro và biện pháp

- **Nguồn sai/mâu thuẫn**: corpus review trước embedding; locator bắt buộc; tách phạm vi định mức, không san bằng các con số khác mục đích.
- **Semantic false positive**: threshold + relative margin + negative golden set; không nhét top-k vô điều kiện.
- **LLM bịa citation**: structured citation IDs, subset validation, cấm URL/source trong answer, renderer deterministic.
- **Prompt injection**: system rule cố định; toàn bộ snapshot/knowledge/question là JSON data; không coi nội dung corpus/query là lệnh.
- **Index stale/model đổi**: schema version + corpus hash + provider/model/dimension/inputTransform + `--check`.
- **Demo offline nhưng quên model query**: hướng dẫn pull `nomic-embed-text` và health/search check trước demo; committed index chỉ tránh embed lại corpus, không thay model embed query.
- **Latency**: batch lúc build; runtime một query embedding, top-k in-memory; giữ fast-answer backend trước RAG.
- **Medical overreach**: corpus chỉ dùng hướng dẫn chính thức, prompt nêu giới hạn sơ cứu và ưu tiên lực lượng y tế.

## Definition of Done

B1 chỉ được tick hoàn tất khi đủ tất cả:

- Corpus có nguồn gốc thật đến mục/trang/URL, qua linter và review thủ công; không có “huyện”.
- Index versioned/fingerprinted được sinh từ `nomic-embed-text`, `--check` pass và artifact có trong working tree.
- Retrieval semantic chạy offline, endpoint search chứng minh được hit/no-hit/degrade.
- `/assistant` trả nguồn deterministic từ index, không chấp nhận citation LLM tự bịa; snapshot vẫn là source-of-truth cho số kho.
- Unit + integration mock pass; 202 backend tests và TypeScript checks không regression.
- Live Ollama golden set pass, threshold được chốt bằng kết quả thực tế; ngoài corpus nói không biết.
- README, hướng dẫn chạy, QA thuyết trình và checklist cập nhật trung thực; chưa chạy live thì không ghi “đã xong”.
