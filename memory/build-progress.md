---
name: build-progress
description: Con trỏ tiến độ build SafeStock X — đang ở phase nào, làm tiếp gì
metadata:
  type: project
---

**ĐỘI 2 NGƯỜI** (user + 1 người nữa) → ngân sách ~10-12 người-tuần (không phải 6 tuần 1 người). Thứ tự ưu tiên trong plan vẫn đúng, chỉ dư thời gian hơn cho polish. Cuộc thi: ai.daklak.gov.vn (chưa đọc được thể lệ — SSL lỗi + chưa index; cần user cấp tiêu chí chấm/deadline/hình thức nộp để tinh chỉnh).

PRD hoàn chỉnh v2.0 ở **docs/PRD.md** (khớp 3 vòng review). Kế hoạch build end-to-end (resume-able) ở **docs/BUILD-PLAN.md** (tài liệu gom vào docs/) — có mọi phase A→I, trạng thái ✅/⬜, verify từng lát, thứ tự ưu tiên nếu thiếu thời gian. LUÔN đọc file đó trước khi làm tiếp [[project-safestock-x]].

**Tiến độ (2026-07-15):**
- Phase A0 (nền móng monorepo) ✅ verify pass
- Phase A1 (Auth JWT + Inventory CRUD/scan/txn + audit) ✅ verify pass — login admin/admin123@ → token → export chạy, chặn over-export
- **Phase B (Sensor Simulator) B0-B3 ✅ verify pass**: schema VirtualDevice/SensorEvent/SimulationScenario/SimulationRun + Shelf.isBlocked/isLocked + InventoryCount; 10 device seed; SimulationService.emit (ngưỡng lọc + update DeviceState.currentValue); RunnerService timeline-scrubber (buildTimeline từ @safestock/scenario-definitions, mulberry32 seeded RNG, play/pause/reset, x1/x10, cursorMs resume); SimulationGateway Socket.IO room `wh:{id}`; UI tối thiểu `apps/api/public/sim.html` serve qua ServeStaticModule. Verify: WS <650ms, reproducible 27 event cùng seed. 6 scenario ở packages/scenario-definitions.
- **Phase B-plus (mới thêm 2026-07-15)**: nhập/xuất kho ĐA NGUỒN 4 tầng — (1)quét QR đã có A1, (2)Bp0 xuất lô/cả kệ 1 chạm chế độ khẩn cấp, (3)Bp1 loadcell/RFID event→tự sinh InventoryTransaction (nối B↔Inventory, field source SCAN/BULK/LOADCELL/RFID/MANUAL), (4)Bp2 sửa tay adjust + reconcile kiểm kê (kiểm kê tháng=nguồn sự thật cao nhất, ghi đè). Độ lệch nguồn→feed dataReliability của Readiness. Chưa code. Chi phí thật để trả lời giám khảo: RFID tag ~1-3k/món, reader ~3-10tr/cổng, loadcell ~100-300k/kệ.
- **Bất cập thực tế đã bàn + chốt vào plan (2026-07-15):**
  - **Loadcell** định vị lại = TÍN HIỆU TRIGGER phát hiện biến động, KHÔNG phải nguồn đếm (áo phao ướt nặng gấp đôi...). 4 tầng đối chiếu bắt lỗi. Kể: "cân phát hiện biến động→đối chiếu 3 nguồn".
  - **Trạng thái vật tư 2 CHIỀU** (C-minus): tình trạng NEW/USED/NEEDS_CHECK/DAMAGED × lưu hành IN_STOCK/ON_LOAN/RETURNED. ON_LOAN=đang mượn, không trừ tổng kho nhưng trừ "khả dụng ngay". Vòng đời mượn-trả là luồng CHÍNH kho cứu hộ.
  - **Ngưỡng hành động** (C3, mới): 4 vùng ≥80🟢/70-79🟡/50-69🟠 tự báo quản lý/<50🔴 chặn lập nhiệm vụ. Biến điểm thành mệnh lệnh tự động. Configurable. = "AI hỗ trợ quyết định" thật.
  - **Offline 3 tình huống** (F2): A=mất net→Ollama (production LUÔN Ollama, Gemini chỉ demo); B=mất LAN→offline-ĐỌC cache + trao đổi ngoài (bộ đàm/SMS) + nhập bù tay (BỎ offline-ghi sync tự động — dễ âm kho); C=mất điện→offline-đọc + phiếu giấy PDF in sẵn (I-sớm) + UPS máy chủ (kể). Câu trả lời "công nghệ hỗ trợ không thay thế quy trình".
  - **#13 Field `consumable` cho Item**: true=tiêu hao (nước/lương thực/pin, xuất=mất); false=tái sử dụng (áo phao/xuồng/đèn, xuất=ON_LOAN mượn-trả).
  - **#3 Đa kho**: seed 2 kho (gần Đồng Xuân + xa, field `distanceKm`), Mission ưu tiên kho gần → chứng minh AI chọn đúng. Greedy đủ.
  - **#12 Seed bẩn**: vật tư không hạn dùng/sai vị trí/DAMAGED/kệ blocked/chưa kiểm kê → chứng minh xử lý thực tế lộn xộn + tôn Readiness.
  - **#6 Concurrency**: dùng atomic `updateMany WHERE quantity>=x` (DB tuần tự hóa) thay đọc-tính-ghi → 2 người xuất cùng lúc không âm kho. Áp export thường + bulk.
  - **#11 Phân quyền**: adjust/bulk-export/reconcile chỉ MANAGER (@Roles) + audit + lý do bắt buộc. Workflow duyệt 2 bước → lộ trình.
  - **#7 Nguồn định mức**: DẪN Sphere Handbook (nước 15L/người/ngày...) + nghị định PCTT + CTĐ vào bảng định mức + báo cáo (~1-2h research). Không chỉ disclaimer.
  - **#10 Ollama**: PC xã 16GB RAM+CPU (KHÔNG cần GPU) chạy Qwen 2.5 3B Q4 ~3-8s/câu, đủ. GPU chỉ để nhanh.
  - **#8 Bản đồ thiên tai: BỎ** (trang trí không data).
  - Lát mới: Bp3 (seed 2 kho + dữ liệu bẩn). C thêm C3 (ngưỡng hành động).
  - **#11 RBAC chỉnh chu (Phase A2 MỚI, làm trước Bp — nền cho mọi endpoint):** 4 trụ. (1) Permission hạt mịn (bảng Permission + role→perms map, guard đọc permission không `if role==X`, `@RequirePermission`). (2) Scope theo kho (bảng UserWarehouse, guard 2 tầng: có quyền + trên kho này). (3) Duyệt 2 bước (ApprovalRequest, thao tác nhạy cảm vượt ngưỡng cấu hình → PENDING → ADMIN duyệt). (4) Audit 5W (reason bắt buộc, GET /audit). Thêm role **ADMIN** (admin/admin123@) tách khỏi MANAGER cấp kho. KHÔNG làm: SSO/LDAP/ca trực/chain>2/field-level (lộ trình). ~4 ngày, ăn điểm giám khảo quản lý nhà nước.
  - **TỐI ƯU LẠI (2026-07-15, sau review "tốt nhất chưa"):**
    - **THỨ TỰ SỬA — quan trọng nhất**: Differentiator TRƯỚC, nền bồi sau. Mới: A✅→B✅→**C (Readiness NGAY)**→G0+G1→A2-core→Bp→D→F→G2. KHÔNG để RBAC/Bp chắn Readiness (C chủ yếu đọc/tính, guard bồi sau dễ). C xong tuần 3-4 thay vì 5-6.
    - **A2 chia 2 đợt**: A2-core (permission + audit 5W, ~1.5 ngày, trước Bp) · A2-plus (scope kho + duyệt 2 bước, sau C, nên-có). Permission = **HẰNG SỐ CODE** (object ROLE_PERMISSIONS), KHÔNG bảng DB (DB động = lộ trình). Nhẹ 1 ngày.
    - **#17 Mượn-trả = bảng LoanRecord** (Bp4), làm ĐẦY ĐỦ trả từng phần (ok/hỏng/mất). Giữ ItemBatch nguyên. status ON_LOAN/PARTIALLY_RETURNED/CLOSED. Chỉ consumable=false. ok→USED, damaged→DAMAGED, lost→trừ tổng kho.
    - **#22 Reconcile chỉ đếm IN_STOCK** (trừ ON_LOAN khỏi kỳ vọng) — sửa bug "làm mất số đang mượn".
    - **#21 Đáp ứng %/roll-up theo TỪNG loại**: Readiness gộp điểm chuẩn hóa 0-100 (không cộng đơn vị thô); Mission đáp ứng = MIN qua các loại (mắt xích yếu nhất, "thiếu nước thì đủ áo phao vô nghĩa").
    - **#15 Duyệt chắn demo**: ngưỡng cao khi demo (~200) + 1 kịch bản khoe riêng.
    - **#19 kho xa seed LỆCH loại** có chủ đích (nhiều áo phao ít nước) → điều chuyển có kịch bản.
    - **#20 giữ RESCUE** thu hẹp 3 việc (yêu cầu vật tư, xem phương án, mượn-hoàn).
  - **Review vòng 3 (2026-07-15) — bất cập mới, đã chốt vào plan:**
    - **3 ROLE** (gộp từ 4): **WAREHOUSE** (phụ trách kho, gộp staff+manager — xã 1 người lo hết) · **RESCUE** (đội cứu hộ) · **ADMIN** (quản trị/hậu kiểm). admin/admin123@ = ADMIN.
    - **#27 BỎ duyệt 2 bước** (pre-approval). Xã ít người không có "người thứ 2". Thay = **HẬU KIỂM**: quyền chặt + audit 5W + double-confirm (1 người, thao tác rất nhạy). A2 bỏ Trụ 3. Duyệt 2 bước→lộ trình (kho tỉnh nhiều tầng). Nhẹ ~2 ngày.
    - **#30 Đa xã TỰ TRỊ**: mỗi xã 1 máy chủ độc lập, KHÔNG sync DB. AI gợi ý mượn liên xã (bảng NeighborWarehouse nhập tay) → con người tự gọi bộ đàm → xuất đánh dấu source=LOAN_OUT/IN. Xóa bài toán đồng bộ đa kho. Sửa #3.
    - **#29 Backup** Supabase cron 17:00 hằng ngày, giữ 3 bản, skip nếu mất net (Bp5, BullMQ).
    - **#23 Recalc 3 tầng** (CỨU khoảnh khắc vàng): event-driven cho môi trường (slider→điểm rớt <2s) + on-write giao dịch + lazy expiry. Cache invalidate theo zone.
    - **#24 Expiry PHÁI SINH** từ expiryDate vs now (không lưu cứng status thời-gian, khỏi cron).
    - **#25 Sensor updatedAt→độ tươi→dataReliability** (>30ph/offline = không dùng giá trị ma).
    - **#26 Mission done ≠ Loan done** (2 vòng đời tách, complete→nhắc chưa hoàn).
    - **#31 Server = nguồn timestamp DUY NHẤT** (client không gửi time, Incident timeline không lệch).
    - **#32 Tách "lõi diễn 6 bước" vs "đạn Q&A"** (Phase I) — chống khoe hết hời hợt. RBAC/mượn-trả/offline... chỉ trả lời khi hỏi, không diễn.
    - **#33 Import Excel/CSV** onboarding (I-polish). **#28 RESCUE scope theo nhiệm vụ** không theo kho.
- Phase A2 (RBAC 2 đợt) + Bp (Bp0-Bp5) + C → I: chưa code. **Lát tiếp: Phase C (Readiness) ngay sau B** — bắt đầu C-minus (schema: trạng thái 2 chiều condition×circulation, consumable, distanceKm/NeighborWarehouse, LoanRecord).

**Lát kế tiếp:** Phase B (sensor simulator) — chốt làm trước C để feed dữ liệu môi trường + có slider sớm.

**Review kỹ gắn thực tế (2026-07-15) — plan đã sửa theo bản "1 người / 5-6 tuần code":**
- **B**: đổi sang **timeline-scrubber** (list event có offsetMs, KHÔNG virtual-clock động). Thêm **nhiễu seed** ở scenario normal (chống "vòng tròn tự chứng minh"). Tốc độ **x1/x10** (bỏ x5/x20). Gọi "mô phỏng lớp cảm biến", KHÔNG khoe "Digital Twin công nghiệp". B3 = kéo slider UI tối thiểu lên làm SỚM (khoảnh khắc vàng).
- **C**: thêm bước **C-minus** bổ sung schema nền TRƯỚC (schema A thiếu 47% trọng số: Shelf.isBlocked/isLocked, bảng InventoryCount, DeviceState current). Định nghĩa 6 CÔNG THỨC CON cụ thể bằng số trước khi code. Trọng số **configurable + disclaimer "tham khảo nghiên cứu"**. ~1.5-2 tuần, đổ công nhất.
- **D**: **BỎ OR-Tools** khỏi MVP → greedy+FEFO (~30 dòng, đủ, giải thích dễ). OR-Tools → "hướng phát triển". Thêm **D1b cache parse câu demo** (chống Gemini rate-limit/mất mạng).
- **E**: Incident = nên-có, cắt được. Ngưỡng cụ thể. Push→in-app alert (WS).
- **F**: phase trượt tiến độ nhất (~2.5-3t). Offline-GHI + Expo push → **POLISH**. Giữ offline-đọc. QR có nút nhập tay fallback. Tính 1 ngày setup Android toolchain.
- **G**: phình nhất → **xé nhỏ**: G2-core lên B3, G1 làm cùng C, rest=polish. SVG grid thay React Flow.
- **H (Drill): CẮT HẲN** khỏi kế hoạch chính → chỉ ghi "hướng phát triển".
- **I**: làm RẢI, KHÔNG dồn cuối. Deploy skeleton tuần 3-4. Quay video mỗi module khi xong. Bản demo chạy 100% offline/localhost.

**3 vấn đề xuyên suốt:** (1) con số bịa (trọng số Readiness + định mức Mission) → configurable + disclaimer; (2) phần "luật/công thức" phải cụ thể hóa trước khi code; (3) demo lỗi live (mất mạng/rate-limit) là sát thủ số 1 → cache + bản offline.

**Quyết định kỹ thuật đã chốt (2026-07-15):**
- Voice input Mission: Web Speech API `vi-VN` ở admin web → text → user SỬA → mới parse. KHÔNG bắn thẳng voice→Claude. Backend /missions/parse nhận TEXT, không đụng voice. Phải có nút gõ tay + tình huống mẫu phòng mất mạng.
- Chatbot hỏi-đáp kho (Phase G4): **context injection, KHÔNG phải RAG thật**. Kho MVP nhỏ (~vài KB JSON) → nhét snapshot JSON kho vào prompt LLM mỗi câu hỏi, không vector DB/embedding. Prompt ràng chỉ trả lời từ JSON, không bịa. Lộ trình: scale lên RAG khi kho phình to. Ưu tiên thấp — cắt nếu core chưa xong.
- **AI provider PLUGGABLE** (Phase D0): interface LLMProvider chung, đổi bằng env `AI_PROVIDER`. Default **gemini** (free tier, user cấp GEMINI_API_KEY khi tới lát D). Adapter khác: ollama (local qwen2.5, 0đ+offline+an toàn dữ liệu — điểm cộng cơ quan nhà nước), claude (trả phí, cao cấp). KHÔNG khóa cứng 1 nhà cung cấp. Lý do: cơ quan ngại phí API định kỳ. Validation+retry schema áp mọi provider (model nhỏ dễ lệch). Đừng hứa "chính xác như Claude" — nói "đủ chính xác, 0đ, chạy nội bộ được".

Config port + lệnh dev xem [[dev-environment]].
