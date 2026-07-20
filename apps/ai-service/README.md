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

Hiện tại: **placeholder**. Xem [BUILD-PLAN.md](../../docs/BUILD-PLAN.md) Phase D0.

## Chạy (khi đã scaffold)
```bash
cd apps/ai-service
python -m venv .venv && source .venv/Scripts/activate  # Windows Git Bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
