# SafeStock X — Kế hoạch build end-to-end (resume-able)

> Mục đích: chia dự án thành các **lát cắt dọc** (vertical slice). Mỗi lát chạy được + verify được rồi mới sang lát sau. Nếu bỏ dở giữa chừng, đọc file này biết đang ở đâu, làm tiếp không mất mạch.
>
> **Cách dùng:** mỗi lát có `Trạng thái`, `Đầu ra`, `File tạo`, `Verify`. Đánh dấu `[x]` khi xong. Cột trạng thái: ⬜ chưa làm · 🟡 đang làm · ✅ xong+verify.
>
> Tài liệu liên quan: [PRD.md](PRD.md) (yêu cầu chi tiết) · [thu-quan-tam-CTD-DongXuan.md](thu-quan-tam-CTD-DongXuan.md) (thư quan tâm).

---

## 0. Quyết định đã chốt (không đổi trừ khi ghi lại đây)

| Hạng mục | Quyết định | Ghi chú |
|---|---|---|
| Mobile framework | **React Native + Expo (TypeScript)** | Share `shared-types` với backend. Build iOS qua Expo EAS sau |
| Backend | NestJS + Prisma + PostgreSQL + Redis | |
| AI service | Python + FastAPI | Lát muộn. **OR-Tools BỎ khỏi MVP** (greedy+FEFO đủ) — ghi "hướng phát triển" |
| AI provider | **Pluggable** — đổi bằng env `AI_PROVIDER`. Default **Gemini** (free tier) | `gemini` (mặc định, free) / `ollama` (local, 0đ, offline, an toàn dữ liệu) / `claude` (cao cấp, trả phí). Cùng interface + schema JSON. Cần key Gemini → hỏi user cấp |
| Web admin + Simulator | Next.js + Tailwind + shadcn/ui | |
| Monorepo | pnpm workspace | Không dùng Turborepo (giữ đơn giản) |
| DB (production) | Supabase (Postgres) | Dev vẫn Docker Postgres local; đổi DATABASE_URL khi deploy |
| Ảnh/file storage | Cloudflare R2 | Lát Attachment/ảnh — chưa tới |
| Deploy web | Vercel + domain random | Backend KHÔNG chạy Vercel → Railway/Render |
| Admin login | `admin` / `admin123@` (role ADMIN) | Đã seed |
| Roles | **WAREHOUSE** (phụ trách kho, gộp staff+manager) · **RESCUE** (đội cứu hộ) · **ADMIN** (quản trị/hậu kiểm) | Xã 1 người lo kho → 3 role |
| Kiểm soát | **Hậu kiểm** (quyền chặt + audit 5W + double-confirm), KHÔNG duyệt 2 bước | Xã ít người, khẩn cấp cần nhanh |
| Kiến trúc đa xã | Mỗi xã 1 máy chủ ĐỘC LẬP. AI gợi ý mượn liên xã, con người tự liên hệ + xuất đánh dấu (#30) | Không sync DB — xóa bài toán đồng bộ |
| Backup | Supabase 17:00 hằng ngày, giữ 3 bản, skip nếu mất net (#29) | |
| Thời gian | **Server là nguồn timestamp DUY NHẤT** (giờ VN +07:00). Client KHÔNG gửi timestamp (#31) | Incident timeline không lệch |
| Phần cứng | Mock hết qua Digital Twin. HW thật xuất JSON = schema `SensorEvent` | Định vị "lộ trình", không phải thiếu tiền |

### ⚠️ Ràng buộc thực tế (đội 1 người, ~5-6 tuần code thật)

10 tuần trừ thiết kế + trình bày + buffer = **~5-6 tuần code**. Plan này đã cắt theo đó. Nguyên tắc:
- **1 khoảnh khắc vàng > 6 module**: kéo slider độ ẩm → điểm rớt 91→78 → cảnh báo bắn xuống mobile. Cần B + C + WS + 1 màn mobile. Mọi thứ khác bổ trợ.
- **Cái giết đội thi = demo lỗi live** (mất mạng, rate-limit, token hết hạn), KHÔNG phải thiếu tính năng. Mọi call AI của demo phải **cache sẵn**; chuẩn bị bản chạy **100% localhost/offline**.
- **Con số phải chỉnh được + có disclaimer** (trọng số Readiness, định mức Mission) — "định mức tham khảo nghiên cứu", cho manager tinh chỉnh trong UI.
- **Deploy sớm, deploy thường** (từ tuần 3-4), **quay video mỗi module khi xong** — không dồn cuối.

**Ngân sách thời gian core (không dư):** B(0.5t) → C(2t, đổ công nhất) → D(1t) → F-core(2.5t) → G trộn vào B/C. E + polish + H = chỉ khi dư.

### Port dev (máy chạy nhiều docker project → dùng port lệch)
| Dịch vụ | Host port | Trong container |
|---|---|---|
| Postgres | **55433** | 5432 |
| Redis | **56380** | 6379 |
| API | **3100** | — |

Cấu hình ở `.env` root. Docker compose phải chạy `--env-file .env` (scripts root đã set). `apps/backend/.env` riêng chỉ chứa `DATABASE_URL` cho Prisma CLI.

### Lệnh hay dùng
```bash
pnpm infra:up                              # bật Postgres + Redis
pnpm infra:down                            # tắt
pnpm --filter @safestock/backend start:dev     # API watch mode (port 3100)
pnpm --filter @safestock/backend build         # build API
pnpm --filter @safestock/backend seed          # seed dữ liệu mẫu
# reset DB: cd apps/backend && npx prisma db push --force-reset --skip-generate
# health: curl http://localhost:3100/api/health
```

### Tài khoản seed
| Login | Password | Role |
|---|---|---|
| `admin` | `admin123@` | MANAGER |
| `manager@safestock.vn` | `manager123` | MANAGER |
| `staff@safestock.vn` | `staff123` | WAREHOUSE_STAFF |
| `rescue@safestock.vn` | `rescue123` | RESCUE_TEAM |

---

## PHASE A — Backend nền tảng

### A0. Nền móng monorepo ✅
- [x] pnpm workspace, root package.json, .gitignore, .env.example
- [x] docker-compose Postgres + Redis (healthcheck)
- [x] packages/shared-types (enums: ItemStatus, TransactionType, UserRole, IncidentType, Priority, VirtualDeviceType; READINESS_WEIGHTS; SensorEvent)
- [x] apps/backend NestJS scaffold + PrismaModule + HealthController
- [x] Prisma schema core: Organization, User, Warehouse, WarehouseZone, Shelf, ItemCategory, Item, ItemBatch, InventoryTransaction, AuditLog
- [x] seed: org CTĐ Đồng Xuân, 2 zone, 4 shelf, 8 category/item/batch
- **Verify:** ✅ `GET /api/health` → `{status:ok, database:up, redis:up}`; seed 4 users / 8 batches
- **File:** `pnpm-workspace.yaml`, `package.json`, `infrastructure/docker-compose.yml`, `packages/shared-types/`, `apps/backend/{prisma,src/{prisma,health}}`

### A1. Auth + Inventory ✅
- [x] Auth: bcryptjs, JWT access(15m)/refresh(7d), login, refresh, /me
- [x] JwtAuthGuard (passport-jwt) + RolesGuard + @Roles()
- [x] seed admin/admin123@ + hash bcrypt thật
- [x] Inventory read: cây kho (warehouse→zone→shelf), list batch, scan theo SKU
- [x] Inventory write: import/export/transfer atomic ($transaction) + audit log; chặn xuất quá tồn
- [x] ValidationPipe global (whitelist, transform)
- **Verify:** ✅ login→token→/me; no-token→401; scan; export 96→86; over-export bị chặn; audit ghi before/after
- **File:** `apps/backend/src/{auth,inventory}/`

### A2. RBAC chỉnh chu — phân quyền mang thi (CHIA 2 ĐỢT) ⬜
> Phân quyền là chỗ giám khảo quản lý nhà nước hỏi sâu (chống gian lận, an toàn dữ liệu công). ĐÚNG LIỀU — không nhồi enterprise vô ích.
> **⚠️ THỨ TỰ QUAN TRỌNG:** A2 KHÔNG chắn trước Readiness. Chia 2 đợt: **A2-core** (nhẹ, trước Bp) · **A2-plus** (sau C, nên-có). Differentiator (C) đi trước.
> **KHÔNG làm (thừa cho MVP, chỉ ghi lộ trình):** OAuth/SSO/LDAP · phân quyền theo ca · **duyệt 2 bước/approval workflow** (BỎ — xã 1 người phụ trách kho, không có "người thứ 2" để duyệt → dùng HẬU KIỂM) · permission-map động DB · field-level.
>
> **3 ROLE (gộp từ 4 — xã chỉ 1 người lo kho):**
> | Role | Quyền | |
> |---|---|---|
> | **WAREHOUSE** (phụ trách kho) | Toàn bộ vận hành: quét, xuất/nhập, kiểm kê, báo hỏng, **xuất lô, sửa tay, reconcile, cho mượn, duyệt phương án** | Gộp STAFF+MANAGER cũ. Tự làm + tự chịu |
> | **RESCUE** (đội cứu hộ) | Xem phương án, mượn-hoàn, yêu cầu vật tư | Khách, không quản trị kho |
> | **ADMIN** (quản trị/giám sát) | + quản lý user, xem audit toàn bộ, cấu hình, **HẬU KIỂM** | Cấp trên/kỹ thuật |
>
> **Kiểm soát = HẬU KIỂM, không pre-approval:** WAREHOUSE tự làm thao tác nhạy cảm (ghi lý do bắt buộc + audit 5W) → ADMIN soi audit sau. Phù hợp quy mô xã, không cản cứu hộ khẩn cấp. Câu trả lời giám khảo: "kho xã ít người, duyệt 2 bước bất khả thi → phân quyền chặt + nhật ký không chối bỏ + hậu kiểm."

#### A2-core (làm trước Bp — ~1.5 ngày)
**Trụ 1 — Permission-based (map role→perms là HẰNG SỐ CODE, không bảng DB):**
- [ ] `ROLE_PERMISSIONS` object TS trong code (đổi role không cần bảng DB — đủ MVP; DB động = lộ trình)
- [ ] Quyền: `inventory:read/export/import/bulk_export/adjust/reconcile` · `mission:view/create/request/approve` · `readiness:view` · `admin:users` · `audit:view` · `warehouse:manage` · `loan:manage`
- [ ] Bó quyền: **WAREHOUSE** (mọi quyền kho) · **RESCUE** (mission:view/request, loan mượn-hoàn) · **ADMIN** (tất cả + admin:users, audit:view)
- [ ] `@RequirePermission('inventory:adjust')` + PermissionGuard (check permission, KHÔNG `if role==X`) thay dần `@Roles`

**Trụ 4 — Audit 5W + double-confirm thao tác rất nhạy:**
- [ ] Thao tác nhạy cảm ghi đủ: ai · gì · trên gì · khi nào · **vì sao(reason BẮT BUỘC)** + before/after
- [ ] **Double-confirm** (1 người, bấm 2 lần + gõ lý do) cho thao tác rất nhạy (ghi đè lớn >X%, xóa) — chống bấm nhầm, KHÔNG phải chống gian lận
- [ ] GET /audit (chỉ `audit:view` — ADMIN hậu kiểm)
- **Verify:** adjust không lý do → reject; audit 5W đủ; không quyền → 403; ADMIN xem audit, WAREHOUSE không

#### A2-plus (SAU Phase C — nên-có, ~1 ngày; đã BỎ duyệt 2 bước)
**Trụ 2 — Scope theo kho:**
- [ ] Bảng **UserWarehouse** (user ↔ warehouse): WAREHOUSE phụ trách kho của họ, không đụng kho khác. **RESCUE KHÔNG gắn scope-kho** — thấy vật tư qua nhiệm vụ được giao (#28)
- [ ] Guard 2 tầng: (1) có quyền? (2) trên KHO NÀY? ADMIN = mọi kho
- **Verify:** WAREHOUSE kho Đồng Xuân gọi adjust kho xã khác → 403
- **Lộ trình (báo cáo):** duyệt 2 bước/approval workflow (cho kho TỈNH nhiều tầng), SSO/LDAP, permission-map động DB, chữ ký số
- **File:** `apps/backend/src/auth/`, `apps/backend/src/rbac/`

---

## PHASE B — Mô phỏng lớp cảm biến (Sensor Simulator) ⬜

> Gọi ĐÚNG TÊN: "mô phỏng lớp cảm biến / thay thế IoT" — KHÔNG khoe "Digital Twin công nghiệp" (bị hỏi vặn "twin đồng bộ với cái gì"). Trả lời chuẩn: "tái tạo luồng dữ liệu cảm biến để kiểm thử logic AI trước khi có phần cứng; schema event = đúng thứ HW thật xuất ra".
> **Mô hình chọn: timeline-scrubber, KHÔNG virtual-clock động.** Scenario = danh sách event có `offsetMs` tính sẵn (deterministic tự nhiên). Runner = con trỏ chạy qua list (như video player). Pause = dừng con trỏ. Tua = nhân offset. Tránh mâu thuẫn setInterval/pause/reproducible.
> **Ước lượng: 2-3 ngày** (nếu ôm virtual-clock đầy đủ → 1 tuần đầy bug, đừng).

### B0. Schema + CRUD thiết bị ảo + trạng thái current ⬜
- [ ] Prisma: VirtualDevice, SensorEvent, SimulationScenario, SimulationRun
- [ ] **DeviceState** (hoặc field current trên VirtualDevice): giá trị mới nhất mỗi device — Readiness đọc cái này, KHÔNG query MAX(timestamp) mỗi lần tính (chậm)
- [ ] Field cho Readiness (đồng bộ với C-minus): `Shelf.isBlocked`, `Shelf.isLocked` (khả năng tiếp cận)
- [ ] CRUD virtual devices (gắn warehouse/zone/shelf); seed: loadcell mỗi shelf, temp/humidity mỗi zone, door, gateway
- [ ] **Ngưỡng lọc trước khi lưu DB**: chỉ lưu event có nghĩa (đổi trạng thái / vượt ngưỡng), không lưu mỗi tick 25.0→25.1 → tránh phình bảng
- **Verify:** list devices theo warehouse trả đúng cây; DeviceState cập nhật khi có event

### B1. Scenario (list event offset) + runner scrubber ⬜
- [ ] Scenario JSON trong `packages/scenario-definitions`: mỗi event có `offsetMs` + `deviceId` + `value`. 6 kịch bản: normal, suspected-loss, sensor-fault, bad-storage, disconnect, misplaced (≥5, PRD 3.4)
- [ ] **Nhiễu ngẫu nhiên CÓ SEED** ở kịch bản "normal": giá trị cảm biến dao động nhẹ (seeded) → Incident engine phải phân biệt nhiễu vs sự cố thật → chứng minh AI không chỉ đọc script (chống "vòng tròn tự chứng minh")
- [ ] Runner: play/pause/reset, tốc độ **x1/x10** (bỏ x5/x20 khỏi MVP), con trỏ chạy qua list, seed cố định → reproducible
- [ ] Mỗi run độc lập (2 run cùng lúc không đè event nhau)
- **Verify:** chạy 1 scenario 2 lần cùng seed → dãy event giống hệt kể cả nhiễu (NFR-04)

### B2. WebSocket realtime + control ⬜
- [ ] Socket.IO gateway (NestJS): room theo warehouseId; emit event khi runner phát
- [ ] Endpoint: POST runs/:id/{play,pause,reset}, POST events (thủ công cho slider ở G2)
- **Verify:** client ws nhận event < 2s sau khi runner phát (NFR-02)
- **File:** `apps/backend/src/simulation/`, `packages/scenario-definitions/`

### B3. ⭐ Simulator UI tối thiểu (kéo G2-core lên đây, làm NGAY) ✅
> Khoảnh khắc vàng phải xong SỚM + chắc, KHÔNG đợi hết Phase G. Chỉ cần đủ để kéo slider bắn event — trang đẹp để sau.
- [x] 1 trang web thô: slider độ ẩm/nhiệt + nút chạy scenario + nút reset (`apps/backend/public/sim.html`)
- [x] Kéo slider → POST events → WS bắn → (sau khi có C) điểm rớt
- **Verify:** ✅ kéo slider → event realtime; 6 scenario chạy; bad_storage đẩy humid→90
- **File:** `apps/backend/public/sim.html` (serve qua ServeStaticModule)

---

## PHASE B-plus — Nhập/xuất kho ĐA NGUỒN (4 tầng + sửa tay) ⬜

> **Bối cảnh:** thiên tai khẩn cấp — không ai kịp quét QR từng món. Giải: 4 tầng bổ trợ, mỗi tầng bắt cái tầng trên sót. Kiểm kê tháng = nguồn sự thật cao nhất, ghi đè tất cả. Đây chính là "độ tin cậy = số nguồn đồng thuận" của Readiness. Tận dụng loadcell/RFID event ĐÃ có ở Phase B + AuditLog/InventoryCount sẵn.
>
> 4 tầng: (1) quét QR — có rồi A1 · (2) xuất lô 1 chạm — Bp0 · (3) loadcell/RFID tự động — Bp1 · (4) kiểm kê tháng + sửa tay — Bp2 (UI dashboard ở G1).
>
> **Chi phí thật (trả lời giám khảo):** RFID tag giấy passive ~1-3k/món · reader ~3-10tr/cổng (1 lần) · loadcell ~100-300k/kệ. Kho ~700 món ≈ 6-7tr tổng. Giai đoạn 1 (QR + xuất lô + kiểm kê tay) chạy NGAY 0đ phần cứng — hợp tiêu chí "triển khai ngắn hạn" của đề.

### Bp0. Xuất lô / cả kệ 1 chạm — chế độ khẩn cấp ⬜
- [ ] Endpoint POST /inventory/bulk-export: xuất nhiều batch cùng lúc (theo kệ hoặc danh sách) trong 1 $transaction + audit từng dòng; không vượt tồn
- [ ] **#6 Atomic conditional update chống race**: dùng `updateMany WHERE quantity >= x` (DB tự tuần tự hóa) thay vì đọc-tính-ghi → 2 người xuất cùng lúc không âm kho. Áp cho cả export thường (A1) + bulk. Verify bằng 2 request song song
- [ ] **#11 Quyền `inventory:bulk_export`** (WAREHOUSE/ADMIN) + scope kho + lý do bắt buộc + audit 5W (hậu kiểm, KHÔNG duyệt trước — khẩn cấp cần nhanh)
- [ ] (Sau khi có D) "xuất cả cơ số theo nhiệm vụ" — trừ hết batch trong phương án 1 xác nhận, gắn missionId
- **Verify:** bulk-export 1 kệ → mọi batch giảm đúng + audit 5W; bắn 2 export song song 1 lô → không âm kho; không quyền → 403
- **File:** `apps/backend/src/inventory/`

### Bp1. Loadcell/RFID → tự sinh giao dịch (nối B ↔ Inventory) ⬜
- [ ] Handler nhận `WEIGHT_CHANGED`: delta khối lượng ÷ khối lượng đơn vị → suy số lượng ra → tự tạo InventoryTransaction (EXPORT, source LOADCELL)
- [ ] Handler `RFID_DETECTED` qua cổng: map tag→item → tự tạo transaction (chính xác món, source RFID)
- [ ] Field `source` cho InventoryTransaction: SCAN / BULK / LOADCELL / RFID / MANUAL → phục vụ "độ tin cậy" Readiness + đối chiếu nguồn
- [ ] Cấu hình: 1 kệ/1 loại + khối lượng đơn vị mỗi item (loadcell suy đúng); map tag cho RFID
- **Verify:** chạy scenario suspected_loss (loadcell giảm ~4kg) → tự sinh transaction xuất ~ đúng SL; DB cập nhật
- **⚠️ ĐỊNH VỊ LẠI loadcell = TÍN HIỆU TRIGGER, KHÔNG phải nguồn đếm.** Cách kể: "cân phát hiện biến động → kích hoạt đối chiếu 3 nguồn còn lại", KHÔNG nói "cân tự đếm chính xác". Lý do: áo phao ướt nặng gấp đôi, người/thùng đặt tạm lên kệ, sai số ±2% → không đáng chốt số. Con số chốt vẫn do quét/kiểm kê. 4 tầng đối chiếu bắt lỗi loadcell.
- **File:** `apps/backend/src/inventory/`, nối `apps/backend/src/simulation/`

### Bp2. Điều chỉnh thủ công + đối chiếu kiểm kê (lưới an toàn) ⬜
- [ ] POST /inventory/adjust: sửa tay số lượng batch (lý do BẮT BUỘC) + AuditLog 5W. **Quyền `inventory:adjust`** (WAREHOUSE/ADMIN) + scope kho + double-confirm nếu lệch lớn (hậu kiểm, không duyệt trước)
- [ ] POST /inventory/reconcile: nhập kiểm kê (InventoryCount) → so hệ thống → hiện độ lệch → xác nhận ghi đè (kiểm kê tháng = nguồn sự thật cao nhất). **Quyền `inventory:reconcile`**
- [ ] **#22 Reconcile chỉ đếm IN_STOCK**: kỳ vọng-trong-kho = quantity − (Σ đang mượn). So countedQty vs kỳ-vọng-trong-kho, KHÔNG vs tổng quantity (nếu không → "làm mất" số ON_LOAN khỏi sổ)
- [ ] Độ lệch nguồn tự động (loadcell/RFID) vs kiểm kê → feed "độ tin cậy dữ liệu" của Readiness
- [ ] UI sửa tay + reconcile ở dashboard → Phase G1
- **Verify:** adjust 1 batch có audit 5W; reconcile lệch → ghi đè + lệch vào dataReliability; không quyền → 403; adjust không lý do → reject
- **File:** `apps/backend/src/inventory/`, UI ở `apps/admin-web/` (G1)

### Bp3. Kho lân cận + dữ liệu "bẩn" (#3, #12, #19, #30) ⬜
> **#30 KIẾN TRÚC ĐA XÃ TỰ TRỊ (quan trọng):** mỗi xã = 1 máy chủ AI ĐỘC LẬP, KHÔNG nối DB xã khác. AI chỉ **GỢI Ý** liên hệ mượn ("thiếu áo phao, liên hệ xã B gần còn hàng") → con người tự gọi điện/bộ đàm → bên cho mượn (WAREHOUSE xã B) xuất đánh dấu `source=LOAN_OUT_INTERXA`, bên mượn nhập `source=LOAN_IN`. KHÔNG có sync DB tự động — xóa sạch bài toán đồng bộ đa kho. Đúng thực tế cứu hộ (liên xã vốn gọi bộ đàm).
- [ ] **Bảng NeighborWarehouse (kho lân cận, nhập TAY)**: tên xã, distanceKm, tồn kho tóm tắt (cập nhật thủ công định kỳ). AI đọc bảng này để gợi ý mượn — KHÔNG realtime, KHÔNG nối DB thật
- [ ] **#3+#19** Seed dữ liệu kho lân cận **LỆCH loại** (xã B nhiều áo phao ít nước, xã mình ngược lại) → Mission gợi ý mượn có kịch bản
- [ ] **#12** Seed batch "bẩn": không `expiryDate`, MISPLACED, DAMAGED, kệ `isBlocked`, chưa kiểm kê → chứng minh xử lý thực tế lộn xộn + tôn Readiness
- **Verify:** Readiness phản ánh dữ liệu bẩn (điểm thấp có lý do); Mission thiếu → gợi ý liên hệ kho lân cận gần nhất còn hàng
- **File:** `apps/backend/prisma/seed.ts`

### Bp5. Backup đám mây (#29) ⬜
- [ ] Cron **17:00 hằng ngày**: nếu có internet → dump Postgres local → đẩy Supabase, **giữ tối đa 3 bản** (xóa cũ hơn). Mất net → skip, thử hôm sau (không chặn vận hành)
- [ ] Trả lời "mất máy chủ/lũ cuốn thì sao": backup cloud hằng ngày 3 phiên bản → khôi phục tới hôm trước
- **Verify:** chạy job thủ công → thấy dump trên Supabase; bản thứ 4 → xóa bản cũ nhất
- **File:** `apps/backend/src/backup/` (BullMQ scheduled job — Redis đã có)

### Bp4. Mượn-trả vật tư — LoanRecord (#16, #17) ⬜
> Kho cứu hộ: vật tư tái sử dụng (áo phao/xuồng/đèn) MƯỢN chứ không mất. Bảng phiếu mượn riêng, giữ ItemBatch nguyên vẹn (phân mảnh nằm ở phiếu, không lan vào tồn kho). Làm ĐẦY ĐỦ logic trả từng phần.
- [ ] Bảng **LoanRecord**: batchId, quantity mượn, borrowedBy(userId), missionId?, borrowedAt, status (ON_LOAN / PARTIALLY_RETURNED / CLOSED)
- [ ] Trả từng phần: `returnedOk`, `returnedDamaged`, `lost` (cộng ≤ quantity mượn) → cập nhật status
- [ ] Chỉ áp `consumable=false` (áo phao...); consumable=true (nước/pin) → xuất tiêu hao thẳng, không tạo phiếu
- [ ] "Đang mượn" của batch = Σ LoanRecord mở → "khả dụng ngay" = quantity − đang mượn
- [ ] Khi trả: ok → về IN_STOCK (condition USED); damaged → DAMAGED; lost → trừ khỏi tổng kho (mất thật)
- [ ] Endpoint: POST /loans (mượn), POST /loans/:id/return (trả từng phần); quyền `loan:manage`
- [ ] UI: màn "phiếu mượn đang mở" + nút hoàn (rescue app F4)
- **Verify:** mượn 20 áo phao → ON_LOAN, tổng kho không đổi, khả dụng-ngay −20; trả 15 ok+3 mất+2 hỏng → tổng kho −3, 15 về USED, 2 DAMAGED, phiếu CLOSED
- **File:** `apps/backend/src/inventory/` hoặc `apps/backend/src/loan/`

---

## PHASE C — Readiness Score ⬜ (⭐ CỐT LÕI — đổ công nhất, ~1.5-2 tuần)

> Chỉ số sẵn sàng. Rule engine tính điểm 6 thành phần, 4 cấp, kèm nguyên nhân trừ điểm + đề xuất. Differentiator số 1 khi thi.
> **CẢNH BÁO:** schema A hiện KHÔNG tính được 4/6 thành phần (47% trọng số thiếu dữ liệu). Phải làm **C-minus (bổ sung schema)** TRƯỚC, nếu không tắc ngay ngày đầu.

### C-minus. Bổ sung schema nền (BẮT BUỘC trước C0) ⬜
- [x] `Shelf.isBlocked`, `Shelf.isLocked` → thành phần "khả năng tiếp cận" (đã làm ở B0)
- [x] Bảng **InventoryCount** (kiểm kê): batchId, countedQty, countedAt, userId (đã tạo ở B0)
- [x] **DeviceState current** theo zone → "môi trường" (đã có ở B0)
- [ ] **Trạng thái vật tư 2 CHIỀU độc lập trên ItemBatch** (mở rộng ItemStatus hiện tại):
  - **Tình trạng (condition):** `NEW` (mới) · `USED` (cũ, đã dùng) · `NEEDS_CHECK` (cần kiểm tra) · `DAMAGED` (hư hỏng)
  - **Lưu hành (circulation):** `IN_STOCK` (trong kho) · `ON_LOAN` (đang mượn, vẫn thuộc kho — KHÔNG tính "mất") · `RETURNED` (vừa hoàn, chờ kiểm tra)
  - Vòng đời: NEW+IN_STOCK → [mượn] ON_LOAN → [hoàn] USED+RETURNED → [kiểm tra] USED+IN_STOCK (ok) hoặc DAMAGED (hỏng)
  - Readiness: ON_LOAN không trừ tổng kho nhưng trừ "khả dụng NGAY"; USED tính khả dụng (condition thấp hơn NEW); DAMAGED=0
- [ ] **#13 Field `consumable` cho Item** (tiêu hao vs tái sử dụng): quyết xuất = MẤT hay MƯỢN.
  - `consumable=true` (nước, lương thực, pin, băng gạc): xuất = tiêu hao, không hoàn, không ON_LOAN
  - `consumable=false` (áo phao, xuồng, đèn, bộ đàm): xuất = MƯỢN → ON_LOAN → hoàn về
- [ ] **#3 Đa kho: field `distanceKm` cho Warehouse** (khoảng cách tới điểm sự cố/trung tâm) — Mission ưu tiên kho gần
- **Verify:** query đủ input 6 thành phần; mượn 1 áo phao → ON_LOAN, tổng kho không đổi, khả dụng-ngay giảm; xuất nước → tiêu hao thẳng

### C0. Định nghĩa 6 CÔNG THỨC CON cụ thể + schema điểm ⬜
> KHÔNG code "rule engine" chung chung. Viết ra con số rõ ràng trước.
- [ ] Prisma: ReadinessScore, ReadinessScoreComponent, ReadinessRule (trọng số **configurable**, không hardcode), ReadinessRecommendation
- [ ] Bảng công thức cụ thể (ví dụ khởi đầu, tinh chỉnh sau):
  - **Expiry (15%)**: còn>6th=100 · 2-6th=70 · <2th=40 · hết hạn=0
  - **Condition (22%)**: NEW=100 · USED=75 · NEEDS_CHECK=50 · MAINTENANCE=40 · DAMAGED=0. ON_LOAN không trừ tổng nhưng loại khỏi "khả dụng ngay"
  - **Accessibility (15%)**: đúng vị trí +không blocked +không locked=100; mỗi vi phạm trừ
  - **Quantity (28%)**: min(countedQty/systemQty,1)×100; chưa kiểm kê → hạ theo dataReliability
  - **Environment (10%)**: nhiệt/ẩm trong ngưỡng=100; vượt → giảm tuyến tính
  - **DataReliability (10%)**: theo độ mới kiểm kê + số nguồn đồng thuận + sensor online
- [ ] **Trọng số chỉnh được trong UI + disclaimer "định mức tham khảo nghiên cứu"** (chống hỏi vặn "số ở đâu ra")
- [ ] **#24 Expiry = PHÁI SINH** từ `expiryDate` vs now, tính lúc đọc/recalc. KHÔNG lưu cứng status thời-gian (EXPIRING_SOON/OVERDUE) → khỏi cron, luôn đúng
- [ ] **#25 Độ tươi sensor → dataReliability**: DeviceState có `updatedAt`. Sensor cập nhật <5ph=tin đầy đủ · 5-30ph=giảm · >30ph/offline=KHÔNG dùng giá trị + hạ dataReliability (sensor chết = tín hiệu, không phải dữ liệu ma)
- **Verify:** unit test từng công thức con; sensor cũ >30ph → dataReliability giảm

### C1. Tính điểm 4 cấp + breakdown + CHIẾN LƯỢC RECALC ⬜
- [ ] Điểm batch/item → shelf/zone → warehouse (roll-up trọng số theo quantity)
- [ ] **#21 Đơn vị hỗn hợp**: mỗi loại vật tư tính điểm 0-100 THEO ĐƠN VỊ RIÊNG (lít/chiếc/bộ), rồi mới gộp điểm chuẩn hóa — KHÔNG cộng đơn vị thô. Điểm 0-100 gộp được vì đã chuẩn hóa
- [ ] **#23 RECALC 3 tầng (CỨU KHOẢNH KHẮC VÀNG):**
  - **Event-driven cho môi trường**: SensorEvent tới → recalc NGAY zone/kho đó → điểm rớt <2s khi kéo slider. BẮT BUỘC đúng, nếu recalc theo lịch 5ph → demo đứng hình
  - **On-write**: xuất/nhập/sửa tay/mượn → recalc batch/zone liên quan
  - **Lazy**: expiry tính lúc đọc (#24)
  - Cache điểm + invalidate theo ZONE (chỉ recalc phần đổi, không cả kho mỗi lần)
- [ ] Môi trường lấy từ DeviceState (Phase B); chưa có B → giá trị mặc định "bình thường"
- [ ] Lưu breakdown: mỗi điểm truy về 6 thành phần
- **Verify:** GET /warehouses/:id/readiness trả điểm + breakdown; đổi status 1 batch → điểm đổi đúng hướng; **kéo slider độ ẩm (sim) → điểm zone rớt <2s** (khoảnh khắc vàng)

### C2. Nguyên nhân trừ điểm + đề xuất ⬜
- [ ] Mỗi thành phần bị trừ → lý do cụ thể (vd "3 batch EXPIRING_SOON ở kệ B1")
- [ ] Recommendation (vd "kiểm tra 3 bộ sơ cứu sắp hết hạn")
- [ ] POST /readiness/recalculate; GET /readiness/recommendations
- **Verify:** tăng độ ẩm (sim) → điểm environment giảm → có recommendation kiểm tra

### C3. ⭐ Ngưỡng hành động — biến điểm thành mệnh lệnh ⬜
> Điểm tự nó không bảo ai làm gì → trang trí. Ngưỡng gắn mỗi vùng điểm với 1 HÀNH ĐỘNG hệ thống tự làm. Đây mới là "AI hỗ trợ quyết định" thật. Ngưỡng **cấu hình được** mỗi kho.
- [ ] 4 vùng (mặc định, chỉnh được):
  - **≥80** 🟢 Sẵn sàng — hiện xanh, không làm gì
  - **70-79** 🟡 Cần chú ý — cảnh báo vàng dashboard
  - **50-69** 🟠 Suy giảm — **tự gửi thông báo quản lý** + hiện đề xuất khắc phục
  - **<50** 🔴 Không đủ khả năng — **cảnh báo đỏ + chặn/cảnh báo khi lập nhiệm vụ mới** + báo lãnh đạo
- [ ] Bảng `ReadinessThreshold` (configurable) + hook: điểm đổi vùng → trigger notification/chặn
- [ ] Mission (Phase D) đọc ngưỡng: kho <50 → cảnh báo "cân nhắc kho khác" khi lập phương án
- **Verify:** đẩy độ ẩm (sim) → điểm rớt qua ngưỡng 70 → có cảnh báo; rớt <50 → chặn/cảnh báo khi tạo mission
- **File:** `apps/backend/src/readiness/`

---

## PHASE D — Mission-to-Kit Compiler ⬜

> Nhập tình huống ngôn ngữ tự nhiên → JSON → nhu cầu → tối ưu phân bổ → giải thích → duyệt.

### D0. AI service scaffold + provider pluggable (FastAPI) ⬜
- [ ] apps/ai-service: FastAPI + Pydantic + venv
- [ ] **Interface LLM chung** `LLMProvider` (method: parse structured JSON, generate text). 1 hàm factory chọn theo env `AI_PROVIDER`
- [ ] Adapter: **GeminiProvider** (default, `google-generativeai`, free tier) · OllamaProvider (local, HTTP `localhost:11434`) · ClaudeProvider (`anthropic`)
- [ ] Env: `AI_PROVIDER=gemini`, `GEMINI_API_KEY=` (hỏi user cấp), `OLLAMA_MODEL=qwen2.5`, `CLAUDE_API_KEY=`
- [ ] Health endpoint báo provider đang dùng
- [ ] **#10 Cấu hình tối thiểu Ollama (ghi báo cáo):** PC văn phòng xã **16GB RAM + CPU (KHÔNG cần GPU)** chạy được **Qwen 2.5 3B Q4** (~3-8s/câu, chấp nhận được vì parse/giải thích không cần realtime). Có GPU 8GB → Qwen 7B ~1-2s. → giải mâu thuẫn "local offline" vs "hạ tầng xã": khả thi với PC phổ thông
- **Verify:** GET /health trả `{provider: "gemini"}`; đổi env sang ollama/claude không sửa code khác
- **Lộ trình kể khi thi:** **triển khai thật = Ollama local LUÔN** (0đ + offline + dữ liệu không rời cơ quan — an ninh dữ liệu). **Gemini/Claude CHỈ dùng khi demo thi** (khỏi cần máy mạnh lúc trình bày). Không khóa cứng 1 nhà cung cấp

### D1. Parse tình huống (structured JSON output) ⬜
- [ ] Endpoint POST /parse: mô tả (text) → JSON schema (incidentType, affectedPeople, children, elderly, durationHours, priority...) qua `LLMProvider` hiện hành
- [ ] Validation Pydantic; reject + retry nếu sai schema (áp cho MỌI provider — model nhỏ dễ lệch schema hơn, retry quan trọng)
- [ ] NestJS proxy: POST /missions/parse gọi ai-service
- [ ] Input là TEXT — voice chỉ là cách nhập ở UI (xem G3, Web Speech vi-VN → text → sửa → gọi endpoint này). Backend không đụng voice
- **Verify:** nhập mô tả lũ lụt → JSON đúng schema (test với gemini; thử cả ollama nếu có)

### D1b. Cache parse cho câu demo (BẮT BUỘC) ⬜
- [ ] Lưu sẵn kết quả parse của đúng (các) câu tình huống dùng khi demo (input cố định → output cố định) → demo không phụ thuộc Gemini rate-limit/mạng hội trường
- [ ] Đây KHÔNG phải gian lận — là demo an toàn. Live parse chỉ để trình diễn khả năng, có cache đỡ lưng
- **Verify:** rút mạng → parse câu demo vẫn ra JSON

### D2. Định mức + đối chiếu tồn + phân bổ GREEDY (KHÔNG OR-Tools) ⬜
- [ ] Bảng định mức (config): tình huống×điều kiện→vật tư×công thức (PRD 3.3) — **chỉnh được**
- [ ] **#7 DẪN NGUỒN định mức thật** (không chỉ disclaimer): trích từ **Sphere Handbook** (chuẩn cứu trợ nhân đạo quốc tế — vd nước 15 lít/người/ngày) + nghị định/thông tư PCTT VN + tiêu chuẩn Hội CTĐ. Ghi nguồn vào bảng định mức + báo cáo. ~1-2h research, biến "số bịa" → "số có căn cứ"
- [ ] Sinh danh sách nhu cầu từ JSON
- [ ] Đối chiếu tồn kho sẵn sàng (dùng Inventory + Readiness)
- [ ] **Phân bổ GREEDY + FEFO** (~30 dòng): sort batch theo expiry → lấy dần tới đủ → thiếu thì báo thiếu + gợi ý thay thế. KHÔNG vượt tồn (NFR-05). Giải thích được cho giám khảo phi kỹ thuật trong 1 câu
- [ ] **#3 Ưu tiên kho GẦN**: thiếu ở kho gần → bù từ kho xa, sort theo `distanceKm`. Greedy đủ giải (không cần OR-Tools). Chứng minh AI chọn đúng
- [ ] Chỉ lấy từ vật tư `IN_STOCK` khả dụng (bỏ ON_LOAN/DAMAGED); consumable=false thì xuất = tạo ON_LOAN
- [ ] **#21 Mức đáp ứng % tính theo TỪNG loại, tổng = MIN (mắt xích yếu nhất)**, KHÔNG cộng gộp đơn vị (không "88 lít + 96 chiếc"). Thiếu nước thì đủ áo phao vô nghĩa → đáp ứng = loại yếu nhất. Kể mạnh: "báo 60% vì thiếu nước, không tự ru ngủ bằng trung bình đẹp"
- [ ] Validation nghiệp vụ: số người âm / tình huống vô lý → báo lỗi (không chỉ schema)
- **Verify:** ra danh sách cần + thiếu + đáp ứng % = min qua các loại; không vượt tồn; kho gần hết → đề xuất kho xa
- **⚠️ OR-Tools BỎ khỏi MVP.** Greedy cho kết quả gần y hệt ở quy mô demo, code nhanh hơn, giải thích dễ hơn, không rủi ro wheel/infeasible trên Windows. OR-Tools → mục "hướng phát triển" trong báo cáo

### D3. Phương án + giải thích + duyệt ⬜
- [ ] LLM (provider hiện hành) giải thích phương án (tiếng Việt) — có cache cho câu demo
- [ ] NestJS: POST /missions/generate-plan, /approve, /start, /complete; Prisma: Mission, MissionRequirement, MissionAllocation...
- [ ] **#26 Mission done ≠ Loan done**: mission `complete` (đội về) KHÔNG tự đóng LoanRecord. Complete → NHẮC "còn N món chưa hoàn từ nhiệm vụ này". Màn "phiếu mượn quá hạn" cảnh báo giữ đồ lâu. 2 vòng đời tách, liên kết lỏng
- [ ] **#30 Gợi ý mượn liên xã**: kho gần thiếu → đọc NeighborWarehouse → gợi ý "liên hệ xã B (gần, còn hàng)". AI CHỈ gợi ý, con người tự liên hệ + xuất đánh dấu
- **Verify:** tạo phương án < 10s (NFR-01); không vượt tồn (NFR-05); mission complete còn loan mở → có nhắc
- **File:** `apps/ai-service/`, `apps/backend/src/mission/`

---

## PHASE E — Incident Intelligence ⬜ (NÊN-CÓ, cắt được nếu tuần 7 chưa xong C+D)

> Hợp nhất event nhiều nguồn → timeline → chấm điểm nghiêm trọng → giải thích. Đẹp trên slide nhưng KHÔNG core sống-còn. Nếu kẹt: timeline có thể dựng tĩnh trong slide để kể chuyện.

- [ ] Prisma: Incident, IncidentEvidence, IncidentAction
- [ ] Rule engine hợp nhất SensorEvent với **ngưỡng CỤ THỂ** (không mơ hồ): vd loadcell giảm >3kg + door mở + RFID event + không có phiếu xuất trong ±5 phút → nghi thất thoát
- [ ] Giá trị của E phụ thuộc **nhiễu seed ở B1**: engine phải phân biệt dao động bình thường vs sự cố → chứng minh không chỉ đọc script
- [ ] Tính điểm nghiêm trọng theo trọng số
- [ ] **LLM (provider hiện hành)** viết giải thích tiếng Việt (KHÔNG tự kết luận số liệu — chỉ diễn đạt bằng chứng)
- [ ] Timeline dựng từ evidence; GET /incidents/:id/timeline
- [ ] acknowledge/assign/resolve
- [ ] Thông báo tới mobile: **MVP dùng in-app alert qua WebSocket** (đang mở app thì hiện). Expo push notification (device token) → POLISH, đừng ôm sớm
- **Verify:** chạy scenario suspected-loss → tạo incident có timeline + evidence + điểm (NFR-06 mọi kết luận có bằng chứng)
- **File:** `apps/backend/src/incident/`

---

## PHASE F — Mobile App (Expo) ⬜ (⚠️ phase TRƯỢT TIẾN ĐỘ NHẤT, ~2.5-3 tuần)

> App vận hành hiện trường. **Cảnh báo thực tế:** ngày đầu KHÔNG viết được UI — chỉ đánh vật toolchain (Android SDK/emulator hoặc USB debug máy thật, Java version, EAS). Tính 1 ngày setup vào kế hoạch.

### F0. Scaffold + auth (+ setup toolchain) ⬜
- [ ] **Setup Android: emulator hoặc điện thoại thật (USB debug)** — làm trước, đừng để chắn tiến độ sau
- [ ] apps/mobile: Expo + TypeScript + Expo Router
- [ ] TanStack Query + Zustand + axios client (base URL API — LƯU Ý: emulator gọi host qua `10.0.2.2:3100`, máy thật qua IP LAN)
- [ ] Import `@safestock/shared-types`
- [ ] Login screen → lưu token (SecureStore) → refresh flow
- **Verify:** login admin trên điện thoại/emulator → vào được trang chủ

### F1. Trang chủ + kho ⬜
- [ ] Trang chủ: readiness toàn kho, cảnh báo mở, nhiệm vụ, vật tư nguy cơ thiếu
- [ ] Chi tiết kho: danh sách kệ, trạng thái, chênh lệch (sơ đồ khu = list đơn giản, KHÔNG vẽ sơ đồ phức tạp trên mobile)
- **Verify:** hiển thị dữ liệu thật từ API

### F2. Quét QR + giao dịch + chiến lược offline ⬜
- [ ] expo-camera quét QR → SKU → scan API → chi tiết vật tư
- [ ] **Nút "nhập SKU tay" làm fallback** — QR in mờ / ánh sáng hội trường kém hay quét không lên trước giám khảo
- [ ] Xuất/nhập/chuyển/kiểm tra/báo hỏng (≤3 bước xuất, NFR-07)

**Chiến lược offline (3 tình huống — KHÔNG làm sync tự động phức tạp):**
- [ ] **TH-A mất internet, LAN+điện còn:** đổi AI provider sang Ollama (local) → chạy đủ. Giải bằng thiết kế pluggable đã có, không cần code thêm mobile
- [ ] **TH-B mất LAN (thiết bị ra hiện trường):**
  - Offline **ĐỌC**: điện thoại cache snapshot kho (SQLite) → xem "kho có gì, ở đâu" khi mất mạng
  - **KHÔNG làm offline-ghi sync tự động** (đã QUYẾT bỏ — bài toán phân tán, dễ âm kho). Thay bằng: user **trao đổi ngoài luồng** (bộ đàm/SMS — cứu hộ vốn dùng) → **nhập bù tay** khi mạng về (qua API bình thường). Tầng 4 kiểm kê bắt sai sót
  - Badge "đang offline — nhập bù sau" cho rõ trạng thái
- [ ] **TH-C mất điện toàn kho:** (xem thêm Phase I) — offline-đọc trên điện thoại (pin riêng) + **phiếu giấy in sẵn** (nút in PDF ở web, điền tay khi cả điện thoại chết, nhập lại sau). UPS máy chủ = kể, không code
- **Verify:** rớt mạng → vẫn xem được kho (cache); nhập bù tay khi mạng về → DB khớp
- **Kể khi thi:** "3 lớp chịu mất kết nối/điện. Công nghệ hỗ trợ, KHÔNG thay thế hoàn toàn quy trình cứu hộ — luôn có lớp giấy dự phòng." Câu trả lời trưởng thành cho câu hỏi chắc chắn bị hỏi

### F3. Nhiệm vụ + cảnh báo realtime ⬜
- [ ] Nhiệm vụ: danh sách vật tư cần lấy, thứ tự kệ, tiến độ, thay thế
- [ ] Cảnh báo: Socket.IO client nhận realtime (**in-app alert**, đang mở app thì hiện); mức độ, bằng chứng, timeline
- [ ] Expo push notification (device token, nền) → **POLISH**, không cần cho demo (đang mở app lúc demo)
- **Verify:** tạo sự cố ở Simulator → mobile nhận cảnh báo < 2s (in-app)
- **File:** `apps/mobile/`

### F4. Chức năng theo role — khép vòng đời (⭐ CORE cho câu chuyện demo) ⬜

> 3 chức năng CORE tạo vòng tròn khép kín: AI lập phương án → manager duyệt (mobile) → staff chuẩn bị + kiểm kê → rescue nhận bàn giao + báo tình trạng → Readiness cập nhật. Đây là thứ làm hệ thống "sống" trước giám khảo.

**CORE — làm chắc:**
- [ ] **[Staff] Kiểm kê nhanh theo kệ**: quét lần lượt QR cả kệ → app so hệ thống → ra chênh lệch. Nuôi dữ liệu "độ tin cậy" cho Readiness (Phase C)
- [ ] **[Rescue] Xác nhận bàn giao bằng QR**: quét QR nhận hàng thay gõ tay → khép chuỗi trách nhiệm (ai nhận, lúc nào) vào audit
- [ ] **[Rescue] Báo tình trạng vật tư sau nhiệm vụ** (còn/hỏng/mất) → cập nhật status batch → feed lại Readiness
- [ ] **[Manager] Duyệt phương án xuất kho trên mobile**: nhận push "phương án chờ duyệt" → xem → approve/reject (khớp Mission `approve`, Phase D)

**POLISH — thêm nếu dư giờ, cắt nếu thiếu:**
- [ ] [Staff] Lịch sử thao tác của tôi + undo nhầm (đã có audit log)
- [ ] [Staff] Chụp ảnh khi báo hỏng → lưu Cloudflare R2
- [ ] [Rescue] Trạng thái nhiệm vụ realtime (thấy staff chuẩn bị tới đâu, X/Y món)
- [ ] [Manager] Push cảnh báo khi readiness kho tụt dưới ngưỡng (<70)
- [ ] [Mọi role] Badge offline rõ ràng ("đang offline, N thao tác chờ sync") — tăng niềm tin khi mất mạng hội trường

**KHÔNG làm (scope creep):** chat nội bộ, chấm công, GPS đội hình, đa ngôn ngữ, yêu cầu vật tư khẩn từ mobile (mini Mission-to-Kit — để sau).

- **Verify:** chạy trọn vòng: manager duyệt phương án → staff kiểm kê 1 kệ ra chênh lệch → rescue quét nhận + báo hỏng 1 món → readiness kho đổi
- **File:** `apps/mobile/`

---

## PHASE G — Admin Web ⬜ (⚠️ PHÌNH NHẤT — xé nhỏ, trộn vào B/C, đừng làm 1 khối cuối)

> App web hoàn chỉnh thứ 2 bên cạnh mobile. Một mình làm cả 2 front-end trong 5 tuần = không đủ nếu ôm trọn. **Chiến lược: G2-core đã kéo lên B3 (làm sớm); G1 dashboard làm CÙNG C; phần còn lại (voice/PDF/map/chatbot) là POLISH thuần.**

### G0. Scaffold + auth (làm cùng B3) ⬜
- [ ] apps/admin-web: Next.js + Tailwind + shadcn/ui
- [ ] Login + TanStack Query + layout
- **Verify:** login web ok

### G1. Dashboard Readiness (làm CÙNG Phase C) ⬜
- [ ] Tổng quan readiness (Recharts), điểm từng khu/nhóm + breakdown nguyên nhân trừ điểm
- [ ] Quản lý kho/vật tư/định mức, xem cảnh báo/nhiệm vụ
- [ ] **UI sửa tay số lượng + đối chiếu kiểm kê** (Bp2): form adjust có lý do; màn reconcile hiện độ lệch hệ thống vs kiểm kê → xác nhận ghi đè
- [ ] Sơ đồ kho = **SVG grid tô màu theo readiness** (KHÔNG React Flow — learning curve 2-3 ngày cho thứ SVG nửa ngày làm được)
- **Verify:** dashboard hiển thị điểm thật, nguyên nhân trừ điểm; sửa tay 1 batch có audit; reconcile ghi đè

### G2. Simulator UI đầy đủ (nâng cấp từ B3) ⬜
> B3 đã có slider tối thiểu. Đây là bản đẹp/đủ.
- [ ] Chọn kho/khu/cảm biến; chỉnh nhiệt/ẩm/trọng lượng; bật-tắt thiết bị
- [ ] Chạy scenario, tốc độ **x1/x10** (đồng bộ B1), pause/resume/reset
- [ ] Timeline event realtime
- **Verify:** kéo slider độ ẩm → event bắn → readiness rớt trên dashboard + alert mobile (KHOẢNH KHẮC VÀNG)
- **File:** `apps/admin-web/`

### G3. Admin nâng cao — hỗ trợ quyết định & bối cảnh địa phương ⬜

**CORE:**
- [ ] **Voice input Mission (tiếng Việt)**: Web Speech API `lang='vi-VN'` → text hiện ra ô nhập → user SỬA lại → mới gọi /missions/parse. KHÔNG bắn thẳng voice→Claude (STT sai số/tên riêng). Phải có nút "gõ tay" + "tình huống mẫu" phòng mất mạng
- [ ] **So sánh readiness trước/sau khi duyệt phương án**: hiện điểm kho hiện tại vs điểm sau khi xuất lô này → manager quyết có cơ sở. Rất "AI hỗ trợ quyết định"

**POLISH:**
- [ ] ~~Bản đồ thiên tai~~ **#8 BỎ** — tĩnh = trang trí không data, dễ bị chê. Không làm
- [ ] **Xuất báo cáo PDF 1 nút**: readiness + phương án + audit → PDF (react-pdf/print CSS). Ngôn ngữ "số hóa quy trình giấy"
- [ ] **Màn hình "sức khỏe kho" tổng hợp**: 1 trang readiness + cảnh báo mở + vật tư sắp hết hạn + nhiệm vụ chờ duyệt. Màn chiếu lúc thuyết trình
- **Verify:** nói 1 câu tiếng Việt → ra text đúng → sửa → parse ra JSON; duyệt phương án thấy điểm trước/sau
- **File:** `apps/admin-web/`

### G4. Chatbot hỏi-đáp kho (context injection, KHÔNG phải RAG thật) ⬜

> Quy mô kho MVP nhỏ (~vài KB JSON) → nhét thẳng snapshot vào context LLM, không cần vector DB/embedding. Chính xác hơn RAG ở quy mô này (bot thấy toàn bộ, không sót chunk) + luôn tươi (lấy JSON mới nhất mỗi câu hỏi). Dùng provider hiện hành (Gemini/Ollama/Claude).

- [ ] Backend: endpoint POST /assistant/ask — lấy snapshot JSON kho hiện tại (1 query DB nội bộ: tồn + readiness + trạng thái) → nhét vào prompt LLM + câu hỏi
- [ ] Prompt ràng buộc: CHỈ trả lời từ JSON, không có thì nói "không biết" (chống bịa số)
- [ ] UI chat trong admin web (+ có thể mobile sau)
- [ ] Ví dụ: "còn bao nhiêu áo phao trẻ em còn hạn?", "khu nào readiness thấp nhất?"
- **Lộ trình:** MVP = context injection; khi kho phình to thật (JSON vượt context) → nâng lên RAG vector. Kể được thành tầm nhìn scale
- **Verify:** hỏi số liệu → bot trả đúng khớp DB; hỏi ngoài phạm vi → bot nói không biết (không bịa)
- **File:** `apps/backend/src/assistant/`, `apps/admin-web/`
- **⚠️ Ưu tiên: làm sau core. Cắt nếu Readiness+Mission chưa xong.**

---

## PHASE H — Diễn tập AI ❌ ĐÃ CẮT khỏi kế hoạch chính

> **Quyết định: cắt hẳn, KHÔNG "cắt nếu chậm".** Lý do: giá trị trùng phần lớn với Mission (cũng "sinh nhiệm vụ chuẩn bị vật tư"); tách biệt khỏi vòng đời chính; 1 người/5-6 tuần gần như chắc không tới. Giữ trong plan chỉ làm phân tâm ước lượng.
> **Ghi 1 dòng "hướng phát triển" trong báo cáo kỹ thuật.** Chỉ làm nếu thần kỳ dư 1 tuần cuối — đừng lên kế hoạch cho phép màu.

---

## PHASE I — Hoàn thiện & trình bày ⬜ (KHÔNG phải 1 tuần cuối — LÀM RẢI suốt dự án)

> **Cảnh báo:** phần trình bày = 30-40% điểm nhưng hay bị dồn 3 ngày cuối → làm ẩu → mất điểm dễ nhất. Deploy lần đầu ở tuần 10 = tự sát. Kéo lên sớm.

### I-sớm (làm từ tuần 3-4, song song code)
- [ ] **Deploy skeleton NGAY khi có health check** (tuần 3-4): backend Railway/Render, DB Supabase, web Vercel. Deploy sớm/thường — mỗi lần vỡ 1 cái, sửa dần. LƯU Ý: Supabase connection pooling + SSL, CORS, cold start
- [ ] **Quay video từng module NGAY khi xong** (tuần 5 xong Readiness → quay luôn). Cuối chỉ ghép
- [ ] Viết báo cáo kỹ thuật dần mỗi phase (đã có PRD + BUILD-PLAN làm nền)
- [ ] **Phiếu xuất khẩn cấp in PDF** (lớp chịu mất điện TH-C): nút in danh sách vật tư + vị trí + ô điền tay từ web (react-pdf/print CSS). Nửa ngày, ăn điểm "hiểu thực tế — công nghệ chết thì quy trình giấy vẫn chạy"

### I-cuối (tuần 9-10)
- [ ] **Bản demo chạy 100% localhost/offline** — coi mạng hội trường = KHÔNG tồn tại. Mọi call AI cache sẵn (D1b), dữ liệu seed sẵn. Có mạng = bonus
- [ ] **#32 TÁCH "lõi diễn" vs "đạn Q&A"** (chống tham lam khoe hết → hời hợt):
  - **DIỄN (6 bước, 5-7ph) — chỉ 3 trụ:** Dashboard Readiness 91 → nhập tình huống → AI lập phương án → kéo slider độ ẩm → điểm rớt 91→78 realtime → cảnh báo mobile → xuất kho theo phương án → kết
  - **KHÔNG diễn, chỉ TRẢ LỜI khi hỏi (slide phụ lục):** RBAC/hậu kiểm, mượn-trả, offline 3 lớp, phiếu giấy, backup, đa xã, loadcell 4 tầng, kiểm kê. Chiều sâu để chứng minh nghĩ kỹ, KHÔNG để diễn
- [ ] Dữ liệu demo đẹp (kho đầy đủ, readiness 91, scenario mượt) + ≥5 scenario
- [ ] Kịch bản demo 5–7 phút (PRD 11) — **tập dượt nhiều lần trên đúng thiết bị thi** (test độ phân giải máy chiếu)
- [ ] Ghép video demo, slide, poster, hoàn thiện báo cáo
- [ ] Thư quan tâm CTĐ Đồng Xuân (ký + mộc) đính kèm hồ sơ
- **Verify:** demo end-to-end không lỗi khi RÚT MẠNG

### I-polish
- [ ] **#33 Import Excel/CSV** onboarding kho: 1 endpoint import (tên/SKU/SL/vị trí/hạn) → tạo hàng loạt. Trả lời "triển khai thật nhập 700 món sao" → import Excel, cán bộ quen Excel. Nửa ngày

---

## Thứ tự ưu tiên (bản thực-tế-1-người)

**CORE — chắc thắng (ngân sách ~6 tuần). ⚠️ THỨ TỰ TỐI ƯU: DIFFERENTIATOR TRƯỚC, NỀN BỒI SAU:**
`A ✅` → `B ✅` (gồm B3 slider) → **`C-minus + C` (Readiness NGAY — differentiator, đổ công nhất ~2t, gồm C3 ngưỡng + #23 recalc event-driven)** → `G0+G1` (dashboard hiện điểm — hoàn thiện khoảnh khắc vàng) → `A2-core` (permission + audit + hậu kiểm, ~1.5 ngày) → `Bp0+Bp2+Bp3+Bp4` (xuất lô + sửa tay/reconcile + kho lân cận + mượn-trả) → `D` (1t, greedy, dẫn nguồn định mức, đáp ứng=min) → `F0-F2` (2.5t, offline-đọc + nhập bù tay) → `G2` (simulator UI đầy đủ).
**Vì sao:** Readiness là thứ ăn điểm nhất → xong SỚM + chắc (tuần 3-4), không để RBAC/Bp chắn. C chủ yếu đọc/tính → guard bồi sau dễ. Khoảnh khắc vàng (B3+C+G2) hoàn thiện trước, mọi thứ bồi quanh.

**NÊN-CÓ (nếu dư):** `A2-plus` (scope kho — đã bỏ duyệt 2 bước) → `Bp1` (loadcell/RFID tự sinh giao dịch — điểm nhấn IoT) → `Bp5` (backup Supabase) → `E` (Incident) → `F3` alert → `F4 CORE` (khép vòng đời) → `G3 CORE` (voice + readiness trước/sau) → phiếu PDF khẩn cấp (I-sớm).

**POLISH (dư nữa):** `F3 push` → `F4 POLISH` → `G3 POLISH` (map/sức khỏe kho) → `G4` (chatbot).

**ĐÃ CẮT:** `H` (Drill).

> Nguyên tắc: **1 khoảnh khắc vàng chạy mượt > 6 module dở**. Demo lỗi live giết đội thi, không phải thiếu tính năng.

---

## Trạng thái hiện tại

**Đang ở:** hết Phase A (A0 ✅, A1 ✅) + **Phase B (B0-B3 ✅)**. Backend nền + auth + inventory + sensor simulator chạy + verify pass.
**Phase B verify pass (2026-07-15):** 10 device seed; ngưỡng lọc event + DeviceState current OK; runner scrubber x1/x10 play/pause/reset; WS room theo warehouse nhận event <650ms (<2s NFR-02); reproducible 27 event y hệt 2 lần cùng seed (NFR-04); UI tối thiểu tại `/sim.html` (slider + chạy scenario). 6 scenario: normal(+nhiễu), suspected_loss, sensor_fault, bad_storage, disconnect, misplaced.
**Lát kế tiếp:** **Phase C-minus → C** (Readiness Score). C-minus: field DB đã có (Shelf.isBlocked/isLocked ✅ tạo ở B0, InventoryCount ✅). Còn định nghĩa 6 công thức con + tính điểm 4 cấp. Đầu vào môi trường lấy từ DeviceState (đã có).
**Đã review kỹ (2026-07-15):** cắt OR-Tools (D greedy), cắt H, B→scrubber+nhiễu ✅, C thêm C-minus schema nền, F offline-ghi+push→polish, G xé nhỏ trộn B/C, I làm rải + deploy sớm.

_Cập nhật lần cuối: 2026-07-15._
