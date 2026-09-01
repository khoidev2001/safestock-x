# AI điều phối cứu hộ — trạng thái triển khai source

Ngày cập nhật: 28/07/2026.

Tài liệu này phân biệt rõ ba mức: source đã có, kiểm thử tự động đã chạy và nghiệm thu
runtime. Nó không thay thế checklist release trong `docs/PRD.md`.

## Luồng đang có trong source

```text
Text/voice đã được người dùng xác nhận
  -> MissionFieldUpdate (evidence bất biến, idempotent)
  -> AI intent có provenance hoặc fallback literal
  -> What-if sơ bộ trên BASELINE (nếu intent phù hợp và có baseline)
  -> notification + timeline ADMIN
  -> ADMIN đọc bằng chứng/delta và tự quyết định workflow thật
```

Không có bước nào trong luồng này tự sửa tồn kho, route, mission status, phân công người,
gọi xã khác, kiểm tra tồn kho xã khác, duyệt hay dispatch.

## API và dữ liệu

| Endpoint | Quyền | Kết quả |
|---|---|---|
| `POST /api/missions/:id/analyses` | `MISSION_ANALYZE` | Tạo `BASELINE` bất biến có provenance. |
| `GET /api/missions/:id/analyses/latest` | `MISSION_ANALYZE` | Chỉ trả `BASELINE`, không để What-if thay thế phương án gốc. |
| `POST /api/missions/:id/simulations` | `MISSION_SIMULATE` | Tạo `WHAT_IF` tách biệt, lưu delta vào snapshot. |
| `GET /api/missions/:id/simulations/:simulationId` | `MISSION_ANALYZE` | Đọc simulation trong scope mission. |
| `POST /api/missions/:id/field-updates` | `MISSION_FIELD_UPDATE` | Lưu text đã xác nhận; raw audio, ảnh/video, GPS và assignment bị từ chối. |
| `GET /api/missions/:id/field-updates` | `MISSION_VIEW` | Evidence timeline theo mission và actor scope. |

Hai model additive là `MissionAnalysisSnapshot` và `MissionFieldUpdate`. Field update có
`structuredIntent` và `intentProvenance`; intent luôn có `requiresAdminVerification: true`.
`FIELD_UPDATE_REPORTED` là notification dành cho ADMIN.

## Trợ lý hiện trường

APK dùng voice native/PhoWhisper chỉ để điền text. Người dùng phải xem, sửa nếu cần và
bấm xác nhận trước khi gửi. Backend gọi `POST /field-update-intent` của AI service sau
khi evidence đã được lưu.

Intent cho phép gồm: đã đến, không tiếp cận được, tuyến nguy hiểm, thay đổi số người,
nhóm dễ tổn thương, cần/đã nhận/đã giao vật tư, không thể tiếp tục, ổn định hoặc khác.
Mọi địa danh/cầu/đường tự do là `unresolvedReferences`; AI service không được nhận registry
để tự map-match hoặc coi đó là route thật.

Nếu AI provider hỏng, fallback chỉ giữ đoạn text xác nhận làm fact `REPORTED`, gắn nhãn
thận trọng và không làm mất evidence. Với intent có thể ảnh hưởng phương án, hệ thống chỉ
tạo What-if sơ bộ khi đã có baseline. Snapshot đó giữ delta để ADMIN xem lại sau F5/relogin;
nó không áp dụng kết quả vào nghiệp vụ.

## UI ADMIN

`CoordinationAnalysisPanel` hiển thị baseline, nguồn dữ kiện, phần thiếu, allocation,
forecast, liên hệ ngoài xã `UNKNOWN` và What-if thủ công. `FieldUpdateTimeline` hiển thị
evidence gốc, intent, phần chưa xác minh và delta của simulation sơ bộ. Timeline nói rõ
phương án thực tế chưa thay đổi.

## Bằng chứng đã chạy

- pnpm shared-types lint và test coordination — 9 tests pass.
- Python pytest situation-analysis và field-update-intent — 7 tests pass.
- Backend focused mission/notification/AI/WebSocket — 24 suites / 153 tests pass.
- Targeted ESLint backend/frontend đã sửa và backend build — pass.
- Prisma Client đã generate; SQL diff được review và schema đã push vào PostgreSQL local.
  Backfill notification kết thúc unscoped: 0.
- Runtime: GET /api/health trả HTTP 200, database và Redis đều up; login ADMIN seed trả
  access/refresh token hợp lệ.

Các test khóa các biên quan trọng: What-if không thay baseline; cầu/tuyến chưa xác định
không bị đoán; geometry tuyến phải giao buffer cầu đã xác minh; mưa 72 giờ không bị hiểu sai
là thời lượng mission; provider AI hỏng không làm mất evidence; output autoDispatch bị bỏ;
số người/hộ/thời lượng phải khớp literal quote và fallback bỏ qua clause prompt injection.
Notification REST/WebSocket tách organization + role, retry field update không tạo alert trùng,
và race snapshot cùng requestId trả winner khi fingerprint giống nhau.

AiClientService chỉ log metadata operation, correlationId, durationMs và outcome. Không log raw
audio, request body, token, số điện thoại hoặc provider error detail.

## Gate runtime còn mở

1. BrowserOS tải được login local nhưng action fill/click/type không ghi vào input sau hai lần
   thử; vì vậy chưa có claim browser refresh/relogin hay multi-role UI acceptance từ driver này.
2. Database hiện hành không có mission (GET /api/missions trả []), nên chưa chạy phép so sánh
   DB operational tables trước/sau baseline hoặc What-if trên dataset tách biệt.
3. Galaxy S23 Ultra, private-LAN, native voice permission/retry và rehearsal hai lần vẫn là
   gate thiết bị thật.

Không dùng pnpm be:db trên database cần giữ dữ liệu vì lệnh đó seed/reset. Khi nghiệm thu trên
clone/demo dataset, review pnpm be:schema:diff trước mọi pnpm be:schema.
