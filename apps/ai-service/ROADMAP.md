# ROADMAP — AI Service (`apps/ai-service`)

> Python + FastAPI + Pydantic. LLM provider pluggable (Gemini/Ollama/Claude). CHỈ làm NLP: parse tình huống → JSON, giải thích phương án/sự cố. KHÔNG tự tính tồn kho/kết luận số liệu (backend + rule engine lo).
>
> **QUY TẮC:** mỗi phase khi code BẮT BUỘC tick từng dòng checklist. Xong hết + verify pass → phase ✅. Chi tiết: [../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md) Phase D.
>
> Trạng thái: ⬜ chưa · 🟡 đang làm · ✅ xong+verify. Ưu tiên: 🔴 CORE · 🟠 nên-có · ⚪ polish.
>
> Không thuộc pnpm workspace (Python venv riêng). Cần `GEMINI_API_KEY` (hỏi user cấp) khi tới D1.

---

## AI-D0 — Scaffold + provider pluggable ⬜ 🔴
- [ ] FastAPI + Pydantic + venv + requirements.txt
- [ ] Interface `LLMProvider` (parse structured JSON, generate text) + factory theo env `AI_PROVIDER`
- [ ] GeminiProvider (default, google-generativeai, free tier)
- [ ] OllamaProvider (local HTTP localhost:11434, Qwen 2.5 3B)
- [ ] ClaudeProvider (anthropic)
- [ ] Env: AI_PROVIDER, GEMINI_API_KEY, OLLAMA_MODEL, OLLAMA_URL, CLAUDE_API_KEY
- [ ] GET /health báo provider đang dùng
- **Verify:** /health trả {provider: "gemini"}; đổi env sang ollama/claude không sửa code khác

## AI-D1 — Parse tình huống (structured JSON) ⬜ 🔴
- [ ] POST /parse: mô tả (text) → JSON schema (incidentType, affectedPeople, children, elderly, durationHours, priority...)
- [ ] Validation Pydantic + reject/retry nếu sai schema (áp MỌI provider)
- [ ] Prompt quản lý như source code (version, input/output schema, ví dụ, giới hạn)
- **Verify:** nhập mô tả lũ lụt → JSON đúng schema (gemini; thử ollama nếu có)

## AI-D3exp — Giải thích phương án (tiếng Việt) ⬜ 🔴
- [ ] POST /explain: nhận phương án (đã tính từ backend) → giải thích tiếng Việt
- [ ] KHÔNG tự kết luận số liệu — chỉ diễn đạt cái backend đưa
- **Verify:** phương án vào → đoạn giải thích tiếng Việt dễ hiểu ra

## AI-E-exp — Giải thích sự cố (Incident) ⬜ 🟠
- [ ] POST /explain-incident: nhận bằng chứng + điểm → viết tường trình tiếng Việt
- [ ] Ràng buộc: chỉ diễn đạt bằng chứng, không suy diễn ngoài dữ liệu
- **Verify:** bằng chứng suspected-loss → tường trình có căn cứ

## AI-out — An toàn output AI (CODING-STANDARDS §14) ⬜ 🔴
- [ ] Mọi output có cấu trúc validate bằng schema trước khi trả
- [ ] KHÔNG cho AI thực thi SQL/shell/xóa dữ liệu/gửi mail
- [ ] Không gửi dữ liệu cá nhân/bí mật không cần thiết đến AI bên thứ ba
- **Verify:** output sai schema → reject; không có đường AI chạm hệ thống trực tiếp
