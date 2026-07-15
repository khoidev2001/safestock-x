# skills/

Quy tắc code + skill hỗ trợ cho đội SafeStock X.

## Nội dung

| File | Mô tả |
|---|---|
| [CODING-STANDARDS.md](CODING-STANDARDS.md) | **Bộ quy tắc code chuẩn** — BẮT BUỘC đọc & tuân thủ trước khi commit |

## Skill Claude Code (cài vào máy mỗi người)

Các skill dưới đây cài vào **Claude Code của từng thành viên** (không phải file trong repo). Chạy lệnh sau khi clone:

```bash
# Công cụ tìm skill trên GitHub
npx skills add vercel-labs/skills

# Design taste — chống UI "AI slop", thống nhất design (tasteskill.dev)
npx skills add Leonxlnx/taste-skill

# Bộ skill engineering: debug, test, security, performance, git-workflow...
npx skills add addyosmani/agent-skills
```

> Skill cài vào `.agents/skills/` + symlink `.claude/skills/` (đã .gitignore, không commit). Cần `GITHUB_TOKEN` — chạy `export GITHUB_TOKEN=$(gh auth token)` trước nếu bị prompt auth. Dùng `-y` để bỏ prompt (KHÔNG dùng `-g`, PromptScript không hỗ trợ global).

> Lưu ý: skill gắn vào công cụ AI cá nhân, không commit vào repo. Mỗi người tự cài để trải nghiệm nhất quán.

## Áp dụng

1. Đọc [CODING-STANDARDS.md](CODING-STANDARDS.md) trước khi viết dòng code đầu tiên.
2. Trước khi tạo PR: chạy checklist mục 27 của CODING-STANDARDS.
3. Reviewer bám mục 21 (Code Review) để duyệt.
