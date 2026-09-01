---
name: project-safestock-x
description: SafeStock X — nền tảng AI quản lý năng lực sẵn sàng kho vật tư cứu hộ, dự thi AI Đắk Lắk
metadata:
  type: project
---

SafeStock X: nền tảng AI đánh giá "năng lực phản ứng thực tế" của kho cứu hộ (không chỉ tồn kho). Trả lời: vật tư nào thực sự sẵn sàng, kho đáp ứng tình huống nào, cần chuẩn bị gì, điểm nghẽn ở đâu.

MVP 5 module: Quản lý kho, Readiness Score, Mission-to-Kit Compiler (Claude parse + OR-Tools tối ưu), Digital Twin Simulator (mock hết IoT), Mobile app. PRD chi tiết tại docs/PRD.md.

Stack: monorepo (Turborepo/pnpm) — mobile React Native/Expo, admin-web Next.js, api NestJS+Prisma+Postgres, ai-service FastAPI+OR-Tools+Claude. Kế hoạch 10 tuần.

**Nguyên tắc kiến trúc chốt:** Claude chỉ NLP (parse mô tả→JSON, giải thích), KHÔNG tự tính tồn kho/kết luận. OR-Tools tối ưu, Rule Engine tính Readiness. Phần cứng thật xuất JSON = giống schema Simulator → thay mock không đổi phần mềm.

**Ưu tiên:** làm xuất sắc 2 module Readiness Score + Mission-to-Kit; giữ scope, demo mượt > nhiều tính năng. Cắt Drill module nếu chậm.
