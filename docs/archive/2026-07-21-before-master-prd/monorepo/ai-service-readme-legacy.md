# @safestock/ai-service

AI service — parse tình huống + giải thích phương án. Provider pluggable.

**Stack (dựng ở Phase D):** Python + FastAPI + Pydantic.

**Không phải Node** → không nằm trong pnpm workspace (chạy venv riêng). Đặt trong `apps/` cho gọn monorepo.

**LLM provider pluggable** (env `AI_PROVIDER`):
- `ollama` (mặc định, local, 0đ, offline)
- `gemini` (tùy chọn cloud, free tier)
- `claude` (cao cấp, trả phí)

**Chức năng:**
- POST /parse — mô tả tình huống (text) → JSON có cấu trúc (validation Pydantic + retry)
- POST /explain — giải thích phương án (tiếng Việt)

Service hiện đã có các luồng parse tình huống, giải thích, lập kế hoạch hành động và trợ lý. Contract thực thi nằm trong [`main.py`](main.py); tiến độ nằm trong [`ROADMAP.md`](ROADMAP.md).

## Cài đặt và chạy

Xem [Hướng dẫn cài đặt và chạy toàn hệ thống](../../docs/HUONG-DAN-CAI-DAT-VA-CHAY.md). AI Service dùng virtual environment riêng và đọc provider/model từ `.env` ở thư mục gốc repository.
