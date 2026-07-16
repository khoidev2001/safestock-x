# ROADMAP — AI Service (`apps/ai-service`)

> Python + FastAPI + Pydantic. LLM provider pluggable (Gemini/Ollama/Claude). CHỈ làm NLP: parse tình huống → JSON, giải thích phương án/sự cố. KHÔNG tự tính tồn kho/kết luận số liệu (backend + rule engine lo).
>
> **QUY TẮC:** mỗi phase khi code BẮT BUỘC tick từng dòng checklist. Xong hết + verify pass → phase ✅. Chi tiết: [../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md) Phase D.
>
> Trạng thái: ⬜ chưa · 🟡 đang làm · ✅ xong+verify. Ưu tiên: 🔴 CORE · 🟠 nên-có · ⚪ polish.
>
> Không thuộc pnpm workspace (Python venv riêng). Cần `GEMINI_API_KEY` (hỏi user cấp) khi tới D1.

---

## AI-D0 — Scaffold + provider pluggable ✅ 🔴
- [x] FastAPI + Pydantic + venv + requirements.txt (httpx thay SDK nặng)
- [x] Interface `LLMProvider` (generate_json, generate_text) + factory theo env `AI_PROVIDER`
- [x] GeminiProvider (default, httpx REST, model gemini-flash-latest, timeout 60s)
- [x] OllamaProvider (local HTTP localhost:11434, Qwen 2.5)
- [ ] ClaudeProvider — NotImplementedError (chưa cần MVP, factory có sẵn nhánh)
- [x] Env: AI_PROVIDER, GEMINI_API_KEY, GEMINI_MODEL, OLLAMA_*
- [x] GET /health báo provider đang dùng
- **Verify:** ✅ /health → {provider: "gemini"}; đổi env đổi provider không sửa code
- **File:** `apps/ai-service/{main.py,schemas.py,providers/}`

## AI-D1 — Parse tình huống (structured JSON) ✅ 🔴
- [x] POST /parse: mô tả (text) → ParsedIncident (incidentType/affectedPeople/children/elderly/durationHours/medicalSupportCases/priority)
- [x] Validation Pydantic + retry (2 lần) nếu sai schema + strip code fence
- [x] Prompt system rõ ràng (schema + quy tắc "khoảng lấy giá trị lớn")
- **Verify:** ✅ "170-180 người 48h 25 trẻ 15 già" → FLOOD, 180 (lấy max), đủ field, priority HIGH; input vô nghĩa → OTHER 0 người (không bịa)
- **⚠️ Gemini free tier chậm ~18s** → cache parse câu demo BẮT BUỘC (D1b, làm ở backend)

## AI-D3exp — Giải thích phương án (tiếng Việt) ✅ 🔴
- [x] POST /explain: nhận context (đã tính từ backend) → giải thích tiếng Việt
- [x] Prompt ràng "KHÔNG bịa số, chỉ dùng số trong dữ liệu"
- **Verify:** ✅ phương án 180 người/87% → đoạn văn tiếng Việt mạch lạc, số khớp

## AI-K — Action Plan (Incident Action Plan) ✅ 🔴 (⭐ khác biệt thi)
- [x] POST /action-plan: nhận context ĐÃ TÍNH (severity/forecasts/vật tư/kho/ETA) → sinh phần diễn giải
- [x] Schema ActionPlanNarrative: objectives + phases(0-2h,2-6h,6-24h) + warnings + followUpQuestions
- [x] Validate Pydantic + retry 4 lần (schema phức tạp hơn parse) + strip fence
- [x] Prompt: LLM CHỈ viết văn định tính, KHÔNG bịa số tồn kho/kho/%/ETA — dùng đúng số context; ví dụ JSON mẫu trong prompt
- [x] maxOutputTokens 4096 (Action Plan tiếng Việt dài, tránh JSON cắt cụt)
- **Verify:** ✅ context lũ 100 người → JSON 8 mục hợp lệ (4 obj, 3 phases, 3 warn, 3 Q); số khớp context; backend ghép severity+forecast (rule) thành Action Plan hoàn chỉnh bằng/hơn docx
- **Ghi chú:** severityLevel + forecasts do BACKEND chấm bằng rule (chống bịa), không thuộc phần LLM. Backend có template fallback khi endpoint này lỗi.

## AI-E-exp — Giải thích sự cố (Incident) ⬜ 🟠
- [ ] POST /explain-incident: nhận bằng chứng + điểm → viết tường trình tiếng Việt
- [ ] Ràng buộc: chỉ diễn đạt bằng chứng, không suy diễn ngoài dữ liệu
- **Verify:** bằng chứng suspected-loss → tường trình có căn cứ

## AI-out — An toàn output AI (CODING-STANDARDS §14) ⬜ 🔴
- [ ] Mọi output có cấu trúc validate bằng schema trước khi trả
- [ ] KHÔNG cho AI thực thi SQL/shell/xóa dữ liệu/gửi mail
- [ ] Không gửi dữ liệu cá nhân/bí mật không cần thiết đến AI bên thứ ba
- **Verify:** output sai schema → reject; không có đường AI chạm hệ thống trực tiếp
