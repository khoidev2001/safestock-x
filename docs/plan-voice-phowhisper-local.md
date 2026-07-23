# Kế hoạch: Nhập giọng nói offline bằng PhoWhisper (VinAI) local

_Lập ngày: 2026-07-23 · Thay Web Speech API (cloud Google) → PhoWhisper chạy local trên GPU máy demo._

> Không phải nguồn trạng thái. Nguồn sự thật là code + [PRD.md](PRD.md).
> Bối cảnh: máy demo có GPU RTX 2060 (6GB VRAM) → chạy PhoWhisper-medium thoải mái, offline thật.

## 0. Vì sao đổi (trung thực)

Web Speech API hiện tại **gửi giọng nói ra server Google** (cần internet) — mâu thuẫn với câu chuyện
"AI chạy offline tại xã". PhoWhisper là Whisper **fine-tune riêng cho tiếng Việt** (VinAI), chạy **local
trên GPU**, không gọi mạng ngoài → đồng nhất thông điệp "AI local, không lộ dữ liệu ra ngoài".

**Ranh giới trung thực khi trình bày:** đây là **ASR (nhận dạng tiếng nói) bằng model fine-tune tiếng
Việt chạy offline** — không phóng đại thành "AI tự huấn luyện". Gọi đúng tên: dùng model mã nguồn mở của VinAI.

## 1. Hiện trạng (đã khảo sát code thật)

- `ai-service` cực gọn: chỉ FastAPI + provider LLM (Ollama/Gemini). `requirements.txt` **chưa có torch/ML**.
  Endpoints: `/health /parse /explain /assistant /action-plan` ([main.py:121-217](../apps/ai-service/main.py#L121)).
- Frontend đã có nút mic dùng Web Speech (`useSpeechToText` trong
  [mission-view.tsx](../apps/frontend/src/components/mission/mission-view.tsx)) → sẽ **thay** bằng ghi âm + upload.
- `apiFetch` **ép `Content-Type: application/json`** ([api.ts:44](../apps/frontend/src/lib/api.ts#L44)) →
  audio (nhị phân) không đi thẳng qua `apiFetch`. **Giải pháp: mã hoá base64, gửi trong JSON** (clip ngắn
  vài giây → payload nhỏ, chấp nhận được; không cần đổi lớp apiFetch).

## 2. Kiến trúc đường đi audio

```
[Trình duyệt]                    [Backend NestJS]              [ai-service FastAPI]
MediaRecorder ghi âm             POST /missions/transcribe     POST /transcribe
 → Blob (webm/opus)   ──base64──►  (RequirePermission          → PhoWhisper pipeline (GPU)
 → base64 trong JSON               MISSION_CREATE)              → {text}
                                   forward base64  ──────────►
 ◄──────────── {text} ◄──────────── {text} ◄────────────────────
 → đổ vào textarea "Mô tả tình huống"
```

Người dùng vẫn **xem lại & sửa** text trước khi "Phân tích bằng AI" → giữ nguyên tắc con người là trọng tài.

## 3. Việc theo tầng

### A. ai-service (Python) — phần chính

1. **Deps mới** (`requirements.txt`): `torch` (bản CUDA khớp máy — xem mục 6), `transformers`,
   `soundfile` (đọc WAV) **hoặc** phụ thuộc `ffmpeg` (đọc webm/opus). Thêm `python-multipart` nếu chọn
   upload file thay vì base64.
2. **Module `transcribe.py`**: **lazy-load** pipeline PhoWhisper ở lần gọi ĐẦU (không load lúc startup →
   service vẫn khởi động nhanh, và nếu thiếu torch/model thì các endpoint LLM khác **không vỡ**).
   - `pipeline("automatic-speech-recognition", model="vinai/PhoWhisper-medium", device="cuda" nếu có else "cpu")`
   - Hàm `transcribe(audio_bytes) -> str`: decode audio → chạy pipeline → trả text (strip khoảng trắng).
3. **Endpoint `POST /transcribe`**: nhận `{audioBase64, mimeType}` → decode → `transcribe()` → `{text}`.
   Lỗi (thiếu model/GPU/decode) → HTTP 503 kèm message rõ để frontend degrade.
4. **Nhất quán guard**: text trả về không qua LLM nên không cần `_redact_identity`; nhưng ghi log tối thiểu.

### B. Backend NestJS — proxy mỏng

5. `AiClientService.transcribe(audioBase64, mimeType)` → POST `/transcribe` sang ai-service (giống `parse`).
6. `mission.controller.ts`: `POST missions/transcribe` (`@RequirePermission(MISSION_CREATE)`) → gọi
   `ai.transcribe`. DTO `TranscribeDto {audioBase64: string; mimeType: string}` (validate không rỗng).

### C. Frontend — ghi âm thay Web Speech

7. Thay `useSpeechToText` → **`useAudioRecorder`** dùng `MediaRecorder`:
   - Bấm mic → xin quyền micro → ghi (webm/opus) → bấm lần nữa dừng → Blob → base64.
   - Gọi `transcribeAudio(base64, mimeType)` (thêm vào `mission-api.ts`) → nhận text → `onResult(text)` đổ vào textarea.
   - Trạng thái: `idle | recording | transcribing`. Hiện "● Đang ghi…" / "Đang nhận dạng…".
8. **Degrade an toàn**: không có `navigator.mediaDevices`/`MediaRecorder` hoặc bị từ chối quyền mic →
   ẩn/vô hiệu nút, luồng gõ tay + AI parse vẫn chạy. ai-service `/transcribe` 503 → báo "chưa bật nhận
   dạng giọng nói", không kẹt.

### D. Test / nghiệm thu

9. ai-service: test `transcribe.py` với **mock pipeline** (không tải model thật trong CI) — kiểm decode +
   xử lý lỗi. Live (máy có GPU): đọc 1 câu tiếng Việt → ra text hợp lý.
10. Frontend `tsc` exit 0. Live: ghi "lũ quét xã Đồng Xuân hai trăm người" → ra text → Phân tích → form điền.

## 4. Vấn đề kỹ thuật cần chốt

- **Định dạng audio & ffmpeg:** `MediaRecorder` cho **webm/opus**. Để `transformers` decode cần **ffmpeg
  trên PATH** máy demo. Hai lựa chọn:
  - **(1) Dùng ffmpeg** (code server đơn giản nhất) — cài ffmpeg 1 lần trên máy demo (đã có GPU thì thêm ffmpeg nhẹ nhàng).
  - **(2) Không cần ffmpeg**: frontend mã hoá **WAV/PCM** bằng Web Audio API → ai-service đọc bằng
    `soundfile` (không cần ffmpeg). Thêm ~40 dòng encoder WAV ở frontend, nhưng bớt 1 phụ thuộc hệ thống.
- **Model size** (2060 6GB chạy được cả 3): `PhoWhisper-small` (~500MB, nhanh nhất) /
  `PhoWhisper-medium` (~1.5GB, cân bằng — **khuyến nghị**) / `PhoWhisper-large` (~3GB, chính xác nhất, chậm hơn).
- **Tải model lần đầu**: `transformers` tự tải từ HuggingFace (cần mạng **1 lần** lúc cài). Sau đó cache
  local → demo offline. Cần tải trước ở nhà, KHÔNG để tải tại hội trường.

## 5. Ranh giới an toàn (không phá cái đang chạy)

- Lazy-load: thiếu torch/model → `/transcribe` lỗi có kiểm soát, **các endpoint LLM + toàn app không vỡ**.
- Không đổi schema DB, không đụng mission workflow/forecast/E2E.
- Voice chỉ là bước nhập liệu phụ; lõi AI (parse NL→JSON) vẫn là Ollama offline như cũ.

## 6. Rủi ro & phụ thuộc nặng

- `torch` bản CUDA ~2–2.5GB. Cần khớp CUDA của driver 2060 (thường cu121). Cài sai → chạy CPU (vẫn chạy, chậm hơn).
- Tăng thời gian khởi động lần gọi đầu (load model vài giây) — chấp nhận được, đã lazy-load.
- `.venv` ai-service phồng to; nêu rõ trong README cách cài + tải model trước.

## 7. Thứ tự thực hiện

1. Chốt: **model size** + **ffmpeg hay WAV-in-browser** (mục 4).
2. ai-service: deps + `transcribe.py` + `/transcribe` + test mock.
3. Backend proxy + DTO.
4. Frontend `useAudioRecorder` thay Web Speech + `transcribeAudio` + trạng thái.
5. Tải model trước, chạy live trên máy GPU nghiệm thu.
6. Cập nhật README ai-service + tick checklist.
