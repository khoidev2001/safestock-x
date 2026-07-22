# @safestock/ai-service

FastAPI service dùng LLM để parse tình huống, viết diễn giải và hỗ trợ trợ lý ứng phó trực tiếp trong khung chat.

Đã có: Gemini/Ollama provider, `/parse`, `/explain`, `/action-plan`, `/assistant`, Pydantic validation và fallback ở các luồng chính. `/assistant` trả lời cả câu hỏi kho lẫn mô tả tình huống khẩn cấp, không yêu cầu chuyển màn hình. Claude provider và `/explain-incident` chưa hoàn chỉnh; automated test/hardening còn thiếu.

AI service không thuộc pnpm workspace và dùng virtual environment riêng.

```powershell
cd apps/ai-service
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8000
```

Health: `http://localhost:8000/health`. Contract và backlog chính thức nằm tại [docs/PRD.md](../../docs/PRD.md).
