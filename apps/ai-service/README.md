# @safestock/ai-service

FastAPI service dùng LLM để parse tình huống, viết diễn giải và hỗ trợ trợ lý ứng phó trực tiếp trong khung chat.

Đã có: Gemini/Ollama provider, `/parse`, `/explain`, `/action-plan`, `/assistant`, `/knowledge/search`, `/transcribe`, Pydantic validation và fallback ở các luồng chính. `/assistant` trả lời câu hỏi kho, tình huống khẩn cấp và kiến thức cứu trợ bằng RAG có nguồn. Claude provider và `/explain-incident` chưa hoàn chỉnh.

AI service không thuộc pnpm workspace và dùng virtual environment riêng.

```powershell
cd apps/ai-service
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8000
```

Health: `http://localhost:8000/health`. Contract và backlog chính thức nằm tại [docs/PRD.md](../../docs/PRD.md).

## RAG cứu trợ offline có trích nguồn

`POST /assistant` nay kết hợp hai nguồn sự thật:

- **Snapshot kho** do backend chụp: tồn kho, readiness, sự cố và thời tiết. LLM không tự tính lại.
- **Corpus cứu trợ** tại [`docs/knowledge/`](../../docs/knowledge/): Sphere Handbook 2018, IFRC 2020 và hướng dẫn PCTT Việt Nam; mỗi chunk có tên tài liệu + mục/trang + URL.

Pipeline: câu hỏi → `nomic-embed-text` qua Ollama local → hybrid retrieval (cosine + lexical/quantity-unit answerability guard) → top hit → Qwen **chỉ chọn ID câu bằng chứng** (`K1S1`, `K1S2`...). Ai-service trả nguyên văn các câu đã chọn rồi tự gắn tên/URL nguồn từ index; model không có trường `answer` để bịa claim, đổi số hay đổi đơn vị. Câu ngoài corpus không được dùng trí nhớ mô hình để bù.

### Model và index

```powershell
ollama pull qwen3.5:4b
ollama pull nomic-embed-text

cd apps/ai-service
.\.venv\Scripts\python.exe scripts\build_knowledge_index.py
.\.venv\Scripts\python.exe scripts\build_knowledge_index.py --check
```

`knowledge_index.json` (11 chunk, 768 chiều) được commit sẵn để không phải embed lại corpus khi demo. Runtime vẫn cần `nomic-embed-text` để vector hóa câu hỏi. Index schema v2 lưu corpus hash, hash từng chunk và SHA-256 digest của model Ollama; tag model đổi artifact sẽ trả `model_mismatch` thay vì trộn vector cũ/mới. `--check` không chạy suy luận; nó bắt corpus/index stale, sai model/transform/dimension.

Endpoint kiểm chứng retrieval độc lập với LLM:

```http
POST /knowledge/search
Content-Type: application/json

{"query":"nước mỗi người mỗi ngày","topK":3}
```

Endpoint chỉ trả metadata, preview và nguồn; không trả vector/toàn bộ index. Thiếu index, Ollama embedding tắt hoặc dimension mismatch → `available=false` + reason code an toàn; `/assistant` vẫn tra snapshot và từ chối kiến thức không nguồn.

## Nhận dạng giọng nói offline — PhoWhisper (`/transcribe`)

Endpoint `POST /transcribe` nhận `{ audioBase64, mimeType }` (WAV 16kHz mono, base64) và
trả `{ text }` bằng [PhoWhisper](https://github.com/VinAIResearch/PhoWhisper) của VinAI —
Whisper fine-tune cho tiếng Việt, **chạy local/offline** trên GPU máy demo (RTX 2060).

- **Con người là trọng tài:** UI ghi âm → nhận dạng → điền vào ô mô tả để cán bộ **đọc lại & sửa**
  trước khi bấm "Phân tích bằng AI". AI chỉ hỗ trợ nhập liệu, không tự quyết.
- **Lazy-load an toàn:** model chỉ nạp ở lần gọi đầu (`transcribe.py`). Thiếu `torch`/model →
  endpoint trả **503**, các endpoint LLM khác vẫn chạy, frontend degrade về gõ tay.
- **Không cần ffmpeg:** giải mã WAV bằng `soundfile`; trình duyệt đã encode sẵn WAV 16kHz.

### Cài cho máy demo (có GPU)

Torch bản CUDA phải cài TRƯỚC (khớp driver — RTX 2060 dùng `cu121`):

```powershell
cd apps/ai-service
.\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu121
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Đổi cỡ model qua env `PHOWHISPER_MODEL` (mặc định `vinai/PhoWhisper-medium`). Lần chạy đầu sẽ
tải model từ HuggingFace (~1.5GB) rồi cache; các lần sau chạy hoàn toàn offline.

> Không dùng voice? Bỏ qua khối cài đặt trên — `/transcribe` trả 503 và UI vẫn cho gõ tay.

## Test

```powershell
cd apps/ai-service
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -v

# Cần ai-service + Ollama thật đang chạy; đánh giá 13 ca HTTP (kho/parse/plan/RAG)
.\.venv\Scripts\python.exe scripts\evaluate_ollama.py
```

Bộ test hiện có **59 test**: voice mock, embedding HTTP current/legacy + model digest, parser/index/fingerprint,
retrieval positive/negative/degrade, transient recovery, prompt injection, extractive evidence và assistant fallback. Bộ live
13 ca đã pass trên `qwen3.5:4b` + `nomic-embed-text` ngày 2026-07-23; khi đổi model/corpus phải chạy lại.
