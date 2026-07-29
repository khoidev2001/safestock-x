# Spec: Hoàn thiện toàn bộ phạm vi PRD

## Objective

Hoàn thiện các feature còn thiếu theo thứ tự phụ thuộc và rủi ro: đóng P09 điều phối đa kho/offline routing; phát hành APK Android REPORTER/Lực lượng hiện trường (`RESCUE`); khép nghiệp vụ web; mở rộng mobile dashboard, readiness, QR và toàn bộ nghiệp vụ kho; bổ sung AI dự báo mưa 72 giờ, semantic search, bản tin đầu ngày và chuẩn hóa nhập liệu bằng embedding; triển khai AI Phân tích tình huống, AI What-if và Trợ lý hiện trường; sau cùng hardening và nghiệm thu.

Người dùng chính là ADMIN xã, WAREHOUSE, Lực lượng hiện trường (`RESCUE`) và
REPORTER. Thành công nghĩa là từng lát cắt chạy qua UI thật, đúng scope, có
loading/error/offline state và có bằng chứng test phù hợp. AI chỉ tham mưu trên dữ
liệu được validate; con người xác nhận và phê duyệt mọi thay đổi nghiệp vụ.

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
- `apps/mobile/`: Android REPORTER/Lực lượng hiện trường/WAREHOUSE.
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
- Loại khỏi phạm vi: phân tích ảnh/video, phân công đội/cá nhân, GPS liên tục, AI tự
  duyệt/dispatch, AI tự liên hệ xã khác và kiểm tra tồn kho xã khác.

## Success Criteria

- P09 có OSRM local, marker đã xác minh, route snapshot và Internet-off acceptance.
- APK Android cài trên Galaxy S23 Ultra; REPORTER/Lực lượng hiện trường chạy qua LAN, session bền và offline-read rõ.
- Web và mobile hoàn tất inventory/loan/readiness/incident theo role.
- QR hỗ trợ SKU/lô theo contract có version, vẫn cho nhập tay và xác nhận trước mutation.
- Bốn feature AI mới có nguồn/provenance, scope, cache/fallback và test.
- Báo cáo tự nhiên tạo được bản phân tích có provenance, dữ kiện thiếu/mâu thuẫn,
  nhu cầu, phương án, dự báo, câu hỏi ưu tiên và giải thích mà không bịa số.
- What-if chạy trên snapshot tách biệt, hiển thị giả định/delta và không mutation.
- Trợ lý hiện trường nhận text/voice đã được người dùng xem, sửa và xác nhận trước khi
  lưu evidence; ADMIN là người quyết định có đổi phương án hay không.
- Full workflow qua phiên độc lập chạy lặp lại, không curl/SQL/copy ID.
- PRD, README và claim demo khớp bằng chứng thật.

## Open Questions

- Không còn câu hỏi sản phẩm về danh mục route/điểm cho AI-3. Danh mục V1 đã được
  tra Google Maps và khóa tại
  `docs/DANH-MUC-THAM-CHIEU-TUYEN-AI-WHAT-IF.md`.
- Registry vị trí kho đã có runtime validation: kho trung tâm dùng UBND Đồng Xuân,
  sáu UBND lân cận là external reference availability `UNKNOWN`, năm Nhà văn hóa
  thôn đã xác minh được seed và 12 điểm còn lại giữ null cho ADMIN ghim. Trước khi
  code AI-3 vẫn phải đưa danh mục cầu/đường vào registry có version và map-match với
  route snapshot/graph. Các tên
  `Cầu Sông Cô`, `Cầu Cây Sung`, `cầu sắt La Hai/Cầu La Hai cũ` và đoạn
  Phước Lộc–Xuân Quang 1 giữ `UNRESOLVED/AMBIGUOUS` cho tới khi có điểm/geometry
  được ADMIN xác minh.
- QR payload và AI embedding model tiếp tục được khóa bằng contract/test trước khi
  thêm dependency hoặc migration tương ứng.
