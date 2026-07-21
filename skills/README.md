# skills/ — Quy tắc code + Skill AI cho đội SafeStock X

Thư mục này gồm 2 phần: **quy tắc code bắt buộc** (commit trong repo) và **skill AI** (mỗi dev tự cài vào máy).

---

## 1. Quy tắc code — ĐỌC TRƯỚC KHI VIẾT CODE

| File | Mô tả |
|---|---|
| [CODING-STANDARDS.md](CODING-STANDARDS.md) | **Bộ quy tắc code chuẩn (28 mục).** BẮT BUỘC đọc & tuân thủ. Mọi PR bị review theo bộ này. |

**Áp dụng:**
1. Đọc [CODING-STANDARDS.md](CODING-STANDARDS.md) trước khi viết dòng code đầu tiên.
2. Trước khi tạo PR → chạy checklist **mục 27** của CODING-STANDARDS.
3. Reviewer duyệt theo **mục 21** (Code Review).

---

## 2. Skill AI — CÀI VÀO MÁY (không nằm trong repo)

> Skill là công cụ cho AI coding agent (Claude Code, Cursor, Codex...) — giúp code chuẩn hơn, debug tốt hơn, UI đẹp hơn. **Mỗi dev tự cài trên máy mình.** Skill KHÔNG commit vào repo (đã `.gitignore` `.agents/` và `.claude/`).

### Yêu cầu trước khi cài
- **Node.js** (đã có nếu chạy được dự án)
- **GitHub CLI** đã đăng nhập: kiểm tra bằng `gh auth status`. Chưa có → `gh auth login`.

### Cài — chạy 4 lệnh sau khi clone repo

```bash
# 0. Set token để không bị hỏi auth (chạy 1 lần cho session terminal)
export GITHUB_TOKEN=$(gh auth token)

# 1. Công cụ tìm skill trên GitHub (find-skills)
npx -y skills add vercel-labs/skills -y

# 2. Design taste — chống UI "AI slop", thống nhất design (dùng cho frontend/mobile)
npx -y skills add Leonxlnx/taste-skill -y

# 3. Bộ skill engineering: debug, test, security, performance, git-workflow, spec-driven...
npx -y skills add addyosmani/agent-skills -y
```

> **Windows:** chạy trong **Git Bash** (không phải PowerShell) để `export` và `$(...)` hoạt động. PowerShell dùng: `$env:GITHUB_TOKEN = (gh auth token)` rồi chạy các lệnh `npx` phía dưới.

### Lưu ý
- **KHÔNG dùng cờ `-g`** (global) — PromptScript không hỗ trợ, sẽ báo lỗi. Cài local vào project là đúng.
- Skill lưu ở `.agents/skills/` + symlink `.claude/skills/` — cả hai đã được `.gitignore`, không lọt vào commit.
- Cài xong ~38 skill. Claude Code tự nhận qua `.claude/skills/`.

### Skill hữu ích cho dự án này
| Nhóm | Skill | Dùng khi |
|---|---|---|
| Backend/logic | `test-driven-development`, `debugging-and-error-recovery`, `security-and-hardening`, `performance-optimization` | Viết service, sửa bug, review bảo mật/hiệu năng |
| Quy trình | `git-workflow-and-versioning`, `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation` | Chia việc, làm theo phase |
| Frontend/mobile | `design-taste-frontend`, `frontend-ui-engineering`, `minimalist-ui` | Dựng UI web/mobile không bị "AI-generated" |
| Meta | `find-skills`, `using-agent-skills` | Tìm & gọi skill khác |

---

## Tóm tắt cho dev mới

```
1. Đọc CODING-STANDARDS.md            ← quy tắc bắt buộc
2. Cài skill AI (4 lệnh mục 2)         ← 1 lần trên máy mình
3. Xem README gốc + docs/PRD.md + CONTRIBUTING
4. Nhận việc theo checklist master, mỗi lát 1 branch → PR
```
