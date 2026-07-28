# Spec: Hoàn thiện toàn bộ phạm vi PRD

## Objective

Hoàn thiện các feature còn thiếu theo thứ tự phụ thuộc và rủi ro: đóng P09 điều phối đa kho/offline routing; phát hành APK Android REPORTER/RESCUE; khép nghiệp vụ web; mở rộng mobile dashboard, readiness, QR và toàn bộ nghiệp vụ kho; bổ sung AI dự báo mưa 72 giờ, semantic search, bản tin đầu ngày và chuẩn hóa nhập liệu bằng embedding; sau cùng hardening và nghiệm thu.

Người dùng chính là ADMIN xã, WAREHOUSE, RESCUE và REPORTER. Thành công nghĩa là từng lát cắt chạy qua UI thật, đúng scope, có loading/error/offline state và có bằng chứng test phù hợp.

## Tech Stack

- Monorepo pnpm, Node.js 20+.
- Backend NestJS, Prisma, PostgreSQL, Redis và Socket.IO.
- Web Next.js.
- Mobile Expo SDK 52/React Native, Android APK là deliverable chính.
- AI FastAPI, Ollama/local embedding; Open-Meteo chỉ qua adapter thời tiết có cache/fallback.
- OSRM local và dữ liệu GIS đóng gói cho Đồng Xuân/vùng đệm.

## Commands

- Backend focused test: `pnpm --filter @safestock/backend test -- <suite>`
- Backend build: `pnpm --filter @safestock/backend build`
- Frontend typecheck: `pnpm --filter @safestock/frontend exec tsc --noEmit`
- Frontend build: `pnpm --filter @safestock/frontend build`
- Mobile typecheck: `pnpm --filter @safestock/mobile exec tsc --noEmit`
- Mobile lint: `pnpm --filter @safestock/mobile lint`
- AI focused test: `apps/ai-service/.venv/Scripts/python.exe -m pytest <path>`
- Prisma validate: `pnpm --filter @safestock/backend exec prisma validate`

## Project Structure

- `apps/backend/`: API, auth/scope, inventory, loan, readiness, incident, mission.
- `apps/frontend/`: web ADMIN/WAREHOUSE.
- `apps/mobile/`: Android REPORTER/RESCUE/WAREHOUSE.
- `apps/ai-service/`: forecast, embedding, semantic retrieval và brief.
- `infrastructure/`: OSRM, LAN runtime, backup/recovery.
- `docs/PRD.md`: nguồn trạng thái duy nhất.
- `tasks/`: spec, kế hoạch và checklist sống cho phạm vi mở rộng này.

## Code Style

Giữ pattern hiện hữu, contract rõ và trạng thái lỗi tường minh:

```ts
const result = await loadScopedResource(actor, input);
if (!result) throw new NotFoundException("Không tìm thấy dữ liệu");
return result;
```

- TypeScript strict; component nhỏ, native controls có accessibility label.
- Không biến lỗi thành `[]`, `null` hoặc success giả.
- AI output luôn là dữ liệu không tin cậy, phải validate trước khi dùng.

## Testing Strategy

- TDD cho logic/scope/concurrency: test đỏ → implementation tối thiểu → test xanh.
- Contract/API integration cho boundary giữa backend, web và mobile.
- Focused typecheck/lint/build sau từng lát cắt; không lặp lại khi source chưa đổi.
- Manual/device acceptance trên Galaxy S23 Ultra và Internet-off LAN là gate bắt buộc.
- Browser/mobile E2E chỉ được tick khi chạy thật, không suy diễn từ unit test.

## Boundaries

- Always: bảo toàn dữ liệu hiện hữu, scope theo organization/xã/kho/actor, dùng API làm authority, giữ offline-write tắt.
- Ask first: thay đổi phá vỡ contract public, reset/seed database, mở dịch vụ ra Internet hoặc đổi mô hình tenant.
- Never: commit secret/token/password thật, tự seed/reset dữ liệu đang chạy, để LLM thực thi mutation, giả tuyến đường hoặc báo thành công khi mất mạng.

## Success Criteria

- P09 có OSRM local, marker đã xác minh, route snapshot và Internet-off acceptance.
- APK Android cài trên Galaxy S23 Ultra; REPORTER/RESCUE chạy qua LAN, session bền và offline-read rõ.
- Web và mobile hoàn tất inventory/loan/readiness/incident theo role.
- QR hỗ trợ SKU/lô theo contract có version, vẫn cho nhập tay và xác nhận trước mutation.
- Bốn feature AI mới có nguồn/provenance, scope, cache/fallback và test.
- Full workflow qua phiên độc lập chạy lặp lại, không curl/SQL/copy ID.
- PRD, README và claim demo khớp bằng chứng thật.

## Open Questions

- Không có câu hỏi chặn implementation hiện tại. QR payload và AI embedding model sẽ được khóa bằng contract/test trước khi thêm dependency hoặc migration tương ứng.
