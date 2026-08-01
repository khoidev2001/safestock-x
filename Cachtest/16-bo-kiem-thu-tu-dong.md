# 16 · Bộ kiểm thử tự động

Phần này không cần bấm tay. Chạy lệnh và đọc kết quả.

## Chuẩn bị một lần

```bash
pnpm install --frozen-lockfile
pnpm --filter @safestock/backend exec prisma generate
pnpm --filter @safestock/shared-types build
```

Hai bước sau **bắt buộc**, không phải tuỳ chọn:

- Gói `@prisma/client` cài về chỉ là vỏ rỗng. Các kiểu dữ liệu sinh từ lược đồ chỉ tồn
  tại **sau khi** chạy lệnh sinh mã. Bỏ qua thì lint, kiểm thử và biên dịch đều hỏng.
- Gói kiểu dùng chung phát hành qua thư mục biên dịch (không đưa vào kho mã). Các ứng
  dụng khác trỏ vào đó nên phải dựng **trước**.

## Kiểm thử máy chủ

```bash
pnpm --filter @safestock/backend exec jest --runInBand
```

**Kỳ vọng:** toàn bộ bộ kiểm thử xanh (tại thời điểm viết tài liệu: 94 bộ, 588 phép
thử).

**Đừng gõ `pnpm --filter @safestock/backend test -- --runInBand`.** Trình quản lý gói
phiên bản đang dùng chuyển tiếp dấu `--` thành tham số của trình chạy kiểm thử, bị
hiểu thành đường dẫn tệp, và trả về *"không tìm thấy phép thử nào"* kèm mã lỗi. Dùng
`exec` như trên.

## Kiểm thử từ đầu tới cuối (cần cơ sở dữ liệu thật)

```bash
pnpm infra:up
pnpm be:db
pnpm --filter @safestock/backend exec jest --config test/jest-e2e.config.js --runInBand
```

Bảy kịch bản được phủ:

| Tệp | Kiểm chuyện gì |
|---|---|
| `mission-workflow` | vòng đời nhiệm vụ, không nhảy cóc trạng thái |
| `mission-prepare-atomic` | kho chuẩn bị theo từng vật tư, hỏng thì hoàn tác sạch |
| `mission-complete` | bước đóng nhiệm vụ, đóng hai lần bị chặn |
| `mission-report-flow` | báo cáo → phương án → giao → đóng, trọn vòng |
| `inventory-transfer-atomic` | chuyển kho không tạo hàng từ hư không |
| `report-approve-atomic` | duyệt kiểm kê, một lô lỗi thì cả phiếu hoàn tác |
| `simulation-isolation` | dữ liệu mô phỏng không rò sang dữ liệu thật |

Điểm chung của nhóm "nguyên tử": chúng cố tình **làm hỏng ở giữa** rồi kiểm tra không
còn dấu vết nửa vời. Đây là loại lỗi mà kiểm thử đơn vị không bắt được.

## Kiểm thử các ứng dụng khác

```bash
pnpm --filter @safestock/shared-types test:coordination
pnpm --filter @safestock/frontend test:mission-inbox
pnpm --filter @safestock/frontend test:map-marker-state
pnpm --filter @safestock/mobile test:state
pnpm --filter @safestock/mobile test:resolution
pnpm --filter @safestock/desktop test:state
pnpm osrm:test
```

`test:resolution` của điện thoại đáng chú ý: nó kiểm tra **cây phụ thuộc giải được**,
bắt lỗi lệch phiên bản trước khi phát hiện lúc dựng bản cài đặt.

## Kiểm thử dịch vụ AI

```bash
cd apps/ai-service
python -m pytest -q
```

Bộ này **không cần mô hình chạy**. Nó kiểm tra hợp đồng dữ liệu và hành vi an toàn:
đúng khuôn dạng trả về, không bịa số, hỏng thì lui về phương án dự phòng.

## Kiểm tra chất lượng mã

```bash
pnpm lint
pnpm --filter @safestock/backend exec prisma validate
pnpm --filter @safestock/backend build
pnpm --filter @safestock/frontend build
pnpm --filter @safestock/desktop typecheck
pnpm --filter @safestock/desktop build
pnpm audit --prod --audit-level=low
```

## Bài học đã trả giá: giống lệnh chưa chắc giống môi trường

Có lần toàn bộ kiểm thử xanh trên máy nhưng đỏ trên máy chủ tích hợp. Nguyên nhân:
một phép thử nạp cấu hình ứng dụng, và tệp biến môi trường **trên máy lập trình** đã
âm thầm che mất chỗ thiếu. Máy chủ tích hợp không có tệp đó.

Cách kiểm chứng đúng: **đổi tên tạm tệp biến môi trường** rồi chạy lại.

```bash
mv apps/backend/.env apps/backend/.env.bak
pnpm --filter @safestock/backend exec jest --runInBand
mv apps/backend/.env.bak apps/backend/.env
```

Chạy đúng lệnh mà máy chủ tích hợp chạy **không đồng nghĩa** với chạy trong đúng môi
trường mà nó có.

## Những gì máy chủ tích hợp **không** chạy

Nó chạy lint, kiểm thử đơn vị, dựng ứng dụng, kiểm lược đồ, rà lỗ hổng phụ thuộc và
hợp đồng AI.

Nó **không** chạy:
- kiểm thử từ đầu tới cuối (cần cơ sở dữ liệu thật)
- kiểm tra định dạng mã

Nghĩa là hai nhóm này phải **chạy tay trước khi nộp**. Xanh trên máy chủ tích hợp
không phải bằng chứng rằng luồng nghiệp vụ còn nguyên.

---

Quay lại [mục lục](README.md).
