# Rehearsal và release gate — Ứng phó nhanh

Ngày cập nhật: 2026-07-28. Tài liệu này là runbook cho bản thi, không phải
hướng dẫn triển khai Internet production.

## Quyết định go/no-go

Code chỉ được gọi là **sẵn sàng đem đi thi** khi cả hai lớp sau đều Pass:

1. **Source gate**: CI/local gate trong mục 2, audit production không có
   advisory, artifact Android được build từ đúng commit.
2. **Rehearsal gate**: chạy hai lượt liên tiếp trên Samsung Galaxy S23 Ultra
   và private LAN, không dùng terminal/API/script trong câu chuyện nghiệp vụ.

Không được suy ra rehearsal gate từ unit test. Nếu một bước không có bằng
chứng, trạng thái là **No-go tạm thời**, không phải Pass.

## 1. Phạm vi trình diễn đã chốt

- Một tenant Đồng Xuân; kho trung tâm và kho thôn thuộc cùng tenant.
- Bốn vai trò: REPORTER, ADMIN, WAREHOUSE, **Lực lượng hiện trường**
  (`RESCUE`). Không có phân công đội/cá nhân tự động.
- Digital Twin chỉ áp dụng kho trung tâm. Simulator desktop là nguồn event
  JSON mô phỏng; không tuyên bố đã kết nối cảm biến IoT thật.
- Liên xã chỉ là điểm liên hệ đã ghim: số điện thoại, vị trí, tuyến/ETA và
  nhãn `đề xuất liên hệ, chưa xác nhận có hàng`. Không check tồn xã khác,
  không cộng fulfillment, không tự gọi và không tạo giao dịch liên xã.
- "Offline" ở phần thi nghĩa là public Internet bị tắt nhưng điện thoại và
  dịch vụ cùng private Wi-Fi/LAN. Nếu điện thoại mất cả LAN, ứng dụng chỉ
  offline-read/cache/stale; không có offline-write/sync.

## 2. Source gate từ clean checkout

Chạy trên commit sẽ đóng gói, với Node 20.13.1 và pnpm 10.32.1:

```powershell
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level=low
pnpm lint
# Build shared workspace packages TRƯỚC: backend/frontend build resolve chúng qua
# main: dist/index.js, mà dist bị gitignore → clean checkout phải build lại trước.
pnpm --filter @safestock/shared-types build
pnpm --filter @safestock/scenario-definitions build
pnpm --filter @safestock/backend exec prisma validate
pnpm --filter @safestock/backend exec jest --runInBand
pnpm --filter @safestock/backend build
pnpm --filter @safestock/shared-types test:coordination
pnpm --filter @safestock/frontend test:mission-inbox
pnpm --filter @safestock/frontend test:map-marker-state
pnpm --filter @safestock/frontend build
pnpm --filter @safestock/mobile test:state
pnpm --filter @safestock/mobile test:resolution
pnpm --filter @safestock/desktop typecheck
pnpm --filter @safestock/desktop build
pnpm osrm:test
```

AI contract gate dùng Python 3.12:

```powershell
python -m pip install --upgrade pip pytest
python -m pip install -r apps/ai-service/requirements.txt
Push-Location apps/ai-service
python -m pytest -q
Pop-Location
```

GitHub Actions chạy cùng các gate tại
[`competition-quality.yml`](../.github/workflows/competition-quality.yml).
Không tắt audit hoặc bỏ qua test để lấy trạng thái xanh.

## 3. Đóng gói artifact

1. Xác nhận `git status --short` chỉ gồm thay đổi đã được review. Không chạy
   `pnpm be:db`: lệnh này seed/reset dữ liệu. Demo reset chỉ được dùng **trước**
   buổi diễn tập và chỉ cho demo stack cô lập.
2. Build APK release:

   ```powershell
   pnpm --filter @safestock/mobile android:release
   Get-FileHash apps/mobile/android/app/build/outputs/apk/release/app-release.apk -Algorithm SHA256
   ```

3. Xác minh APK bằng `apksigner verify --verbose --print-certs <apk>` từ Android
   SDK. Ghi SHA-256, fingerprint certificate, Git commit, ngày giờ và URL API
   private-LAN vào biên bản. Không dùng APK debug.
4. Chỉ build portable desktop nếu cần mang simulator sang máy khác:

   ```powershell
   pnpm --filter @safestock/desktop package
   ```

## 4. Cấu hình an toàn cho buổi thi

- Backend chỉ bind private LAN/tunnel cần thiết; PostgreSQL, Redis, AI service
  và Ollama không public.
- `CORS_ALLOWED_ORIGINS` liệt kê chính xác origin web/LAN, phân tách bằng dấu
  phẩy. Không dùng `*` khi gửi cookie.
- Chỉ đặt `AUTH_COOKIE_SECURE=true` nếu web chạy HTTPS. Với HTTP private LAN,
  dùng cookie `HttpOnly; SameSite=Lax` và giữ mạng không công khai.
- Secret JWT/SMTP/Gemini/Ollama để trong secret manager hoặc `.env` ngoài Git.
  Không quay màn hình hoặc gửi log chứa token/cookie.
- Simulator vận hành phải có `SIMULATION_MUTATION_ENABLED=false`; simulator demo
  dùng database/Redis/port/volume tách riêng.

## 5. Kịch bản 5–7 phút, hai lượt liên tiếp

| Thời lượng | Người thao tác | Bằng chứng phải thấy |
|---:|---|---|
| 0:00–0:40 | Desktop simulator | Một chỉ số kho trung tâm vượt ngưỡng; web nhận alert/realtime và email test có timestamp thật. |
| 0:40–1:30 | REPORTER trên APK | Gửi tình huống text hoặc voice; nếu dùng voice, nội dung PhoWhisper chỉ điền sẵn và người dùng xác nhận trước khi gửi. |
| 1:30–2:40 | ADMIN trên web | Mở phân tích AI/provenance, tạo Mission-to-Kit và xem allocation/readiness/thiếu hụt. |
| 2:40–3:30 | ADMIN trên web | Mở What-if, so baseline/delta; nguồn ngoài xã nếu xuất hiện phải có nhãn chưa xác nhận. |
| 3:30–4:30 | WAREHOUSE trên web | Mở inbox, prepare/fulfill đúng phần kho của mình. |
| 4:30–5:20 | Lực lượng hiện trường trên APK | Mở mission từ notification/inbox ở chế độ CHỈ ĐỌC (không đổi trạng thái nhiệm vụ); gửi field update text/voice rồi xác nhận trước khi gửi. |
| 5:20–6:20 | ADMIN trên web | Xem timeline, audit, readiness trước/sau và state cuối. |
| 6:20–7:00 | Cả nhóm | F5 hoặc mở tab mới ở web, restart APK, xác nhận state/mission vẫn tìm lại được. |

Lượt thứ hai chạy ngay sau đó với cùng artifact và không reset/reseed/restart các
dịch vụ lõi giữa câu chuyện. Reset demo chỉ được ghi rõ trước khi bắt đầu lượt 1.

## 6. Private-LAN/device acceptance bắt buộc

Trước khi gọi Go, lưu một biên bản gồm:

- Model Samsung Galaxy S23 Ultra, Android/One UI, dung lượng trống, build APK,
  SHA-256 và signer fingerprint.
- Fresh install, camera permission, microphone permission và flow voice fallback
  gõ tay.
- API/Socket.IO qua private-LAN khi public Internet bị tắt; login, thông báo,
  QR, report và mission hoạt động.
- Reload/tab mới/logout-login web khôi phục/thu hồi session đúng; web không lưu
  refresh token trong localStorage.
- Desktop slider/scenario tạo event, web/mobile nhận đúng; alert chatbot và SMTP
  có evidence thời gian nhận.
- Tắt Wi-Fi ở điện thoại: cache/stale hiện rõ, mutation bị chặn; bật lại Wi-Fi:
  dữ liệu realtime phục hồi không tạo double-write.

Một item fail phải có nguyên nhân, ảnh/video/log đã redaction, cách tái hiện và
quyết định go/no-go. Không thay dấu pass bằng mô tả miệng.

## 7. Bảng ký biên bản

| Gate | Lượt 1 | Lượt 2 | Người xác nhận | Evidence path/link | Ghi chú |
|---|---|---|---|---|---|
| Source/CI |  |  |  |  |  |
| APK signature + fresh install |  |  |  |  |  |
| Web session + role guard |  |  |  |  |  |
| Simulator → alert → email |  |  |  |  |  |
| Mission bốn vai trò |  |  |  |  |  |
| Public Internet off, private LAN on |  |  |  |  |  |
| LAN lost/read-only/recovery |  |  |  |  |  |

## 8. Điều kiện dừng

Dừng hoặc chuyển sang video dự phòng nếu database/Redis không healthy, audit
không xanh, APK signature không khớp, một role cần terminal/API thủ công, IoT
simulator chạm dữ liệu vận hành, hoặc source external bị diễn giải là tồn kho
đã xác nhận. Những điều này là lỗi vận hành/demo, không nên che bằng lời hứa
về tính năng ngoài phạm vi.
