# Báo cáo xác thực dự án "Ứng phó nhanh" — sẵn sàng đi thi chưa?

**Ngày:** 2026-07-24 · **Phạm vi:** review toàn bộ monorepo, xác minh bằng **code thật** (file:line), không tin dấu tick trong tài liệu.
**Câu hỏi:** (a) Thực tế code có chạy đúng như mô tả? (b) Có khớp mục đích cuộc thi? (c) Đủ yêu cầu đi thi chưa?

---

## 1. Kết luận nhanh

| Trục | Đánh giá | Ghi chú |
|---|---|---|
| **Thực tế (code vs mô tả)** | ✅ Khớp cao ở backend + frontend web; ⚠️ mobile mô tả cao hơn code | 5/5 P0 bảo mật là thật; mobile chỉ ~35-40% lời hứa |
| **Mục đích (DSS ứng phó, AI không bịa số)** | ✅ Đúng nguyên tắc | Số liệu từ backend/rule engine; AI chỉ viết định tính; offline Ollama+PhoWhisper+RAG |
| **Yêu cầu đi thi** | ⚠️ Đủ để demo, **chưa đủ vận hành production** | Thiếu CI, migrations, rate-limit; mobile chưa build APK |

**Tóm gọn:** Lõi nghiệp vụ (kho, nhiệm vụ, readiness, sự cố, báo cáo) **chắc và có test**. Điểm mạnh nổi bật là **tính toàn vẹn dữ liệu dưới đồng thời** (atomic + lock, có e2e Promise.all). Rủi ro đi thi tập trung ở **mobile** (mô tả > code, chưa có APK) và **thiếu lưới hạ tầng** (CI/migration/rate-limit).

---

## 2. Backend — an toàn & toàn vẹn (✅ mạnh)

### 5/5 P0 bảo mật đã vá THẬT (xác minh trực tiếp)

| P0 | Nội dung | Bằng chứng |
|---|---|---|
| P0-1 | WebSocket xác thực server-side, room do server gán | `auth/websocket-auth.service.ts` (verify JWT + load user + chặn actor mô phỏng); `simulation.gateway.ts` & `notification.gateway.ts` (`handleConnection` join room theo principal, KHÔNG có handler client tự join) |
| P0-2 | Cô lập simulator | `simulation.controller.ts` (`PermissionGuard` + `SIMULATION_VIEW/MUTATE` mọi endpoint); `config/env.validation.ts:51-61` (mutation chỉ bật khi `runtime=demo` + `STACK_NAME=safestock_demo` + `BIND_ADDRESS=127.0.0.1`) |
| P0-3 | Điều chuyển tách lô nguyên tử + chống IDOR | `inventory-transfer.ts:125-173` (optimistic lock `updateMany ... quantity gte`, `claim.count===0`→`throwStaleTransfer`); scope kép `assertWarehouseInScope` + org/commune check `:87-98`; bọc `$transaction` tại `inventory.service.ts:223` |
| P0-4 | Chuẩn bị nhiệm vụ nguyên tử | `mission.service.ts:415-462` (toàn bộ trong `$transaction`, CAS `PENDING_WAREHOUSE→READY`, `bulkExportInTx` cùng tx, idempotent retry, `assertWarehouseInScope`) |
| P0-5 | Duyệt báo cáo nguyên tử + phân bổ mọi lô | `report.service.ts:91-218` (`$transaction`, CAS `PENDING→APPROVED`, `lockLoanTableForApproval`, phân bổ qua **tất cả** batch FEFO, org-scope, `reconcileInTx` có snapshot guard) |

### Gap bảo mật MỚI phát hiện (nên biết trước khi thi)

1. **Không rate-limit đăng nhập** — `auth.service.ts:19` không đếm/khóa số lần sai; không có `@nestjs/throttler`. → brute-force mật khẩu không bị chặn.
2. **Refresh token không rotation/revocation** — `auth.service.ts:31-45` chỉ verify chữ ký + user tồn tại rồi cấp token mới; không lưu/blacklist, không có logout thật. Token 7 ngày lộ dùng lại được.
3. **CORS mở toàn bộ + không Helmet** — `main.ts:8` `app.enableCors()` cho mọi origin; không security header. (Giảm nhẹ nhờ JWT auth, nhưng vẫn là gap.)

> Cả 3 chấp nhận được cho **demo nội bộ/offline**; README đã tự cảnh báo "chưa an toàn mở Internet production".

---

## 3. Frontend web (Next.js) — app chính, đầy đủ nhất (✅ mạnh)

- **49 file nguồn**, là giao diện vận hành chính. Route-guard đúng: `app/page.tsx:102-104` redirect `/login` khi mất token, `:178` chặn render.
- **Auto-refresh 401 không nuốt lỗi:** `lib/api.ts:24-35` gặp 401 → `tryRefresh` → nếu fail thì `clear()` + ném `ApiError`. Lỗi hiển thị lên UI (planError/workflowError/parseError trong `mission-view.tsx`).
- **Luồng nhiệm vụ đủ 3 vai + persist mission id:** `mission-view.tsx:89,106-113` (state + focus-store mở đúng mission từ chuông), refetch 5s, nút hành động theo role/trạng thái (`RoleActions`), đủ dispatch/confirm/prepare/complete/defer/resend/cancel.
- **NL→plan + voice offline:** `mission-view.tsx:838-1014` — ghi âm mic → WAV 16kHz → PhoWhisper local; AI trích xuất điền form để người xem lại/sửa (con người quyết).
- **Ghi kho THẬT (không chỉ đọc):** `stocktake-view.tsx:53-65` reconcile số đếm thật + invalidate cache; `warehouse-api.ts:16-22` PATCH toạ độ kho.
- ⚠️ **0 test** ở frontend (không jest/vitest). Verify bằng `next build` (type-check) — không có unit/component test.

---

## 4. AI service (Python FastAPI) — đúng nguyên tắc "không bịa số" (✅, có gap nhỏ)

- **RAG trích xuất có nguồn thật** (11 chunk, corpus thật), **voice PhoWhisper local offline**, **forecast EWMA+std** — đều chạy thật, 42 ca test (`tests/test_*.py`: knowledge 17, rag 12, embedding 8, transcribe 5).
- AI chủ động **chặn đơn vị hành chính cũ**: `knowledge.py` có regex chặn từ "huyện" trong corpus.
- ⚠️ Gap: `/explain` và `parse` **thiếu hàng rào cứng hậu kiểm số** (dựa vào prompt); "cache parse" là claim rỗng; `_patch_english` hardcode ~35 cặp regex.

---

## 5. Mobile (Expo) — RỦI RO CAO, mô tả > code (⚠️)

**Ước lượng ~35-40% lời hứa.** Phần làm thật thì tốt, nhưng một nửa tính năng cốt lõi được hứa **không có trong code**.

| Lời hứa dự thi | Thực tế trong code |
|---|---|
| Nhận nhiệm vụ + confirm/reject/complete | ✅ CÓ (`MissionDetail.tsx`, `api.ts:83/99/117`) |
| Nhận thông báo realtime | ✅ CÓ (`App.tsx:127-142` WebSocket) |
| Quét QR nhập/xuất/kiểm kê | ❌ KHÔNG (không có expo-camera/barcode-scanner) |
| Ghi nhận sự cố | ❌ KHÔNG (chỉ có ô "lý do từ chối" text) |
| Offline-read | ❌ KHÔNG (mất mạng → trắng màn hình) |
| Chạy trên điện thoại thật (APK) | ❌ **Không build được** (`app.json` thiếu android/ios, không EAS/prebuild) |

- Token chỉ giữ trong RAM (`App.tsx:11`, không SecureStore) → đóng app mất phiên.
- URL backend hard-code `localhost:3100` (`config.ts:6`) → muốn chạy phone phải sửa code.
- WebSocket có gửi token nhưng **không refresh** khi Unauthorized (khác desktop).

> **Hướng demo an toàn:** chỉ demo luồng nhận-thông-báo → nhận/từ chối/hoàn thành nhiệm vụ realtime. Trình bày QR/inventory/offline là **roadmap**, KHÔNG nói "đã có".

---

## 6. Desktop (Electron Simulator) — điểm mạnh, rủi ro thấp (✅ ~85-90%)

- Slider chỉnh cảm biến + chạy scenario x1/x10/reset + readiness/incident/log realtime — **đầy đủ, chạy tốt**.
- WebSocket gửi token + **auto-refresh khi Unauthorized** (`socket.ts:47-55`) — bài bản hơn cả mobile.
- **Đã có sẵn `.exe` portable ~74MB** (`release/SafeStock Simulator 0.1.0.exe`) — demo được ngay.
- ⚠️ Thiếu nút **pause** (chỉ play/reset); **hard-code mật khẩu admin** trong renderer (`App.tsx:46-47`) — nên đưa vào ô nhập/env trước khi thi để tránh trừ điểm bảo mật.

---

## 7. Test / CI / Hạ tầng / Seed

| Mặt | Kết luận | Bằng chứng |
|---|---|---|
| Test backend | ✅ mạnh | 48 `.spec.ts` (~302 ca) + 5 `.e2e-spec.ts` (~43 ca) trên **Postgres thật** |
| Test đồng thời | ✅ rất mạnh | `Promise.all` kiểm âm tồn/double-ledger/lost-update (transfer, prepare, approve) |
| Test frontend/desktop/mobile | ❌ 0 test | Không jest/vitest ở 3 app |
| Test AI | ⚠️ một phần | 42 ca (4 file) |
| **CI** | ❌ **KHÔNG** | Không có `.github/workflows` — không gate lint/test/build khi merge |
| **Prisma migrations** | ❌ **KHÔNG** | Chỉ `db push` (`be:schema`), không version schema, không rollback |
| Docker/infra | ✅ có | `infrastructure/docker-compose.yml` (Postgres16+Redis7, healthcheck, volume); Windows autostart; runtime demo tách biệt hoàn toàn khỏi vận hành |
| Seed đi thi | ✅ rất mạnh | Idempotent, có `validateSeedDataset`, 18 kho/17 SKU, lịch sử EXPORT 60 ngày, lô cận hạn/hết hạn/hỏng, sự cố, mượn-trả, báo cáo chờ duyệt; **2 cấp hành chính đúng (tỉnh/xã, không "huyện")** |
| Offline | ✅ mạnh | 1486 tile bản đồ đóng gói; Ollama + PhoWhisper local; Haversine local. ⚠️ font icon còn gọi CDN Google (`layout.tsx:37`); backup phụ thuộc Supabase cloud |

---

## 8. Việc nên xử lý TRƯỚC khi thi (ưu tiên)

**Chặn/cao:**
1. **Mobile**: bỏ claim QR/inventory/offline khỏi mô tả dự thi, hoặc chỉ demo luồng mission realtime. Không hứa "app điện thoại thật" vì chưa build APK.
2. **Desktop**: bỏ hard-code mật khẩu admin (`App.tsx:46-47`) → ô nhập/env.
3. Đồng bộ số liệu tài liệu: `HUONG-DAN-TEST.md` ghi "25 suite/168 test" (cũ) → thực tế 48+5; README nói mobile "chưa scaffold" (đã có code).

**Nên có (tăng điểm kỹ thuật):**
4. Thêm 1 workflow CI tối thiểu (`pnpm lint` + `pnpm --filter backend test`) để có bằng chứng test tự động.
5. Cân nhắc rate-limit login (`@nestjs/throttler`) + Helmet — hoặc chuẩn bị câu trả lời "đã biết, ngoài phạm vi demo offline".
6. Self-host font icon để offline trọn vẹn.

**Ngoài phạm vi thi (ghi nhận):** Prisma migration history, backup local thay Supabase, test frontend/desktop/mobile.

---

## 9. Trả lời trực tiếp câu hỏi

- **Thực tế?** ✅ Backend + frontend web + desktop + AI: code khớp mô tả, xác minh được. ⚠️ Mobile: mô tả cao hơn code thật.
- **Mục đích?** ✅ Đúng là DSS ứng phó thiên tai, AI không bịa số, offline-first, 2 cấp hành chính chuẩn 2026.
- **Đủ yêu cầu đi thi?** ⚠️ **Đủ để DEMO tốt** (đặc biệt lõi kho/nhiệm vụ/toàn vẹn dữ liệu + desktop exe + seed thật). **Chưa đủ chuẩn vận hành production** (thiếu CI, migration, rate-limit; mobile chưa APK). Nếu kiểm soát tốt phần trình bày mobile và dọn 3 điểm "chặn/cao" ở trên thì **rủi ro đi thi ở mức thấp-trung bình**.
