# Ứng phó nhanh - Dashboard UI Design Brief

## Mục Đích Tài Liệu

Tài liệu này mô tả chi tiết các màn hình UI, vị trí từng khu chức năng, cách phân bố layout và định hướng thiết kế dashboard cho Ứng phó nhanh. Dùng tài liệu này để trao đổi với designer khi thiết kế lại web admin.

Ứng phó nhanh không phải phần mềm tồn kho thông thường. Mục tiêu chính của dashboard là giúp cán bộ kho cứu hộ biết:

- Kho có sẵn sàng phản ứng khi thiên tai xảy ra không.
- Vật tư nào thực sự dùng được ngay.
- Điểm nghẽn nằm ở đâu.
- Cảm biến hoặc kiểm kê đang báo vấn đề gì.
- Với một tình huống cụ thể, kho đáp ứng được bao nhiêu và thiếu gì.

Thiết kế cần ưu tiên thao tác vận hành, độ tin cậy và khả năng đọc nhanh hơn hiệu ứng trình diễn.

---

## 1. Định Hướng Thiết Kế Chung

### Kiểu Dashboard

Dashboard nên theo hướng **modern operations dashboard**:

- Hiện đại, sạch, chuyên nghiệp.
- Data-dense, nhưng không rối.
- Dễ scan trong 5 giây.
- Các trạng thái quan trọng nổi bật ngay.
- Hành động chính rõ ràng, không bị giấu sâu.

Không thiết kế như landing page. Không dùng hero lớn, gradient trang trí, card marketing, hiệu ứng phô diễn.

### Visual Language

Nên dùng:

- Nền trắng hoặc xám rất nhạt.
- Surface card trắng.
- Border nhẹ.
- Shadow rất ít hoặc không dùng shadow.
- Radius nhất quán khoảng 8px.
- Font sans-serif dễ đọc.
- Số liệu dùng tabular/mono để dễ so sánh.

Màu:

- Accent chính: xanh emerald, dùng cho hành động chính và trạng thái tốt.
- Semantic status:
  - Xanh: sẵn sàng.
  - Vàng: cần chú ý.
  - Cam: suy giảm.
  - Đỏ: nguy cấp.
  - Xám: offline, chưa có dữ liệu, disabled.

Không dùng nhiều màu accent khác nhau. Màu trạng thái chỉ dùng để truyền tải ý nghĩa.

### Mật Độ Thông Tin

Dashboard dành cho người vận hành kho, nên mật độ thông tin cao hơn app consumer. Tuy vậy, mỗi màn chỉ nên trả lời một câu hỏi chính:

- Tổng quan: Kho có sẵn sàng không?
- Kho vật tư: Có gì, ở đâu, tình trạng nào?
- Mô phỏng: Cảm biến thay đổi thì hệ thống phản ứng ra sao?
- Mission: Tình huống này cần gì, kho đáp ứng được bao nhiêu?
- Sự cố: Có bất thường gì, bằng chứng nào?
- Kiểm kê: Sổ và thực tế lệch ở đâu?
- Hậu kiểm: Ai đã làm gì, vì sao?

---

## 2. Layout Tổng Thể

### Desktop Layout

Desktop là viewport chính.

```text
┌────────────────────┬──────────────────────────────────────────────┐
│ Sidebar            │ Topbar                                       │
│                    ├──────────────────────────────────────────────┤
│ Main navigation    │ Page header                                  │
│                    │                                              │
│ Status card        │ Main content grid                            │
│                    │                                              │
└────────────────────┴──────────────────────────────────────────────┘
```

Thông số gợi ý:

- Sidebar: 240-260px.
- Topbar: 56-64px.
- Content max-width: 1440px.
- Content padding: 24px desktop, 16px mobile.
- Grid chính: 12 columns.
- Gap: 16px hoặc 20px.

### Mobile Layout

Mobile là phụ nhưng vẫn phải dùng được.

```text
┌──────────────────────────────┐
│ Topbar                       │
├──────────────────────────────┤
│ Mobile tabs                  │
├──────────────────────────────┤
│ 1-column content             │
│ Cards                        │
│ Tables with horizontal scroll│
└──────────────────────────────┘
```

Quy tắc mobile:

- Sidebar biến thành tab ngang hoặc bottom nav.
- Table phải horizontal scroll.
- Drawer chuyển thành full-screen sheet.
- Form nhạy cảm có sticky action footer.
- Không để text hoặc nút bị wrap xấu.

---

## 3. Sidebar

### Vị Trí

Sidebar nằm cố định bên trái desktop, chiếm toàn chiều cao.

### Cấu Trúc

```text
┌────────────────────┐
│ Logo Ứng phó nhanh   │
│ Kho cứu hộ xã      │
├────────────────────┤
│ Tổng quan          │
│ Kho vật tư         │
│ Mô phỏng           │
│ Nhiệm vụ           │
│ Sự cố              │
│ Kiểm kê            │
│ Mượn - trả         │
│ Hậu kiểm           │
│ Cấu hình           │
├────────────────────┤
│ Hậu kiểm bật       │
│ Audit 5W...        │
└────────────────────┘
```

### Navigation Items

Các mục chính:

1. Tổng quan / Readiness.
2. Kho vật tư.
3. Mô phỏng cảm biến.
4. Nhiệm vụ cứu hộ.
5. Sự cố & cảnh báo.
6. Kiểm kê & đối chiếu.
7. Mượn - trả.
8. Nhật ký hậu kiểm.
9. Cấu hình.

### Active State

Item active:

- Nền xám nhạt.
- Text đậm.
- Icon rõ hơn.
- Không cần dùng nền xanh mạnh.

Item inactive:

- Text xám.
- Hover có nền nhẹ.

### Status Card Trong Sidebar

Vị trí: cuối nhóm navigation.

Nội dung:

- Icon shield.
- Title: `Hậu kiểm bật`.
- Text: `Sửa tay, reconcile và xuất lô đều cần lý do, ghi audit 5W.`

Mục đích: nhắc user rằng hệ thống dùng hậu kiểm, không duyệt trước 2 bước.

---

## 4. Topbar

### Vị Trí

Topbar nằm trên cùng phần content, sticky khi scroll.

```text
┌──────────────────────────────────────────────────────────────┐
│ [Warehouse icon] Bảng điều hành kho cứu hộ       [status] [user] │
│                  admin · ADMIN                              │
└──────────────────────────────────────────────────────────────┘
```

### Bên Trái

Hiển thị:

- Icon kho.
- Tên khu vực: `Bảng điều hành kho cứu hộ`.
- Email user + role.

Ví dụ:

```text
Bảng điều hành kho cứu hộ
admin · ADMIN
```

### Bên Phải

Hiển thị:

- API/Realtime status.
- Kho đang chọn nếu có nhiều kho.
- Notification icon.
- User menu hoặc logout icon.

Gợi ý status:

```text
● API online
● WS connected
Last sync 08:57
```

Nếu mất kết nối:

- Chấm đỏ/xám.
- Text ngắn: `Offline`, `API down`, `WS disconnected`.

---

## 5. Màn Tổng Quan Readiness

### Mục Tiêu

Màn này trả lời câu hỏi: **Kho hiện có đủ sẵn sàng để phản ứng không? Nếu không, nghẽn ở đâu?**

Đây là màn quan trọng nhất.

### Bố Cục Desktop

```text
Page Header

┌────────────┬────────────┬────────────┬────────────┐
│ Metric 1   │ Metric 2   │ Metric 3   │ Metric 4   │
└────────────┴────────────┴────────────┴────────────┘

┌──────────────────────┬────────────────────────────────┐
│ Readiness Score      │ 6-component Chart              │
│ Big number           │                                │
└──────────────────────┴────────────────────────────────┘

┌────────────────────────────────┬───────────────────────┐
│ Warehouse Map                  │ Sensor Mini Timeline  │
└────────────────────────────────┴───────────────────────┘

┌────────────────────────────────────────────────────────┐
│ Critical Inventory Table                               │
└────────────────────────────────────────────────────────┘
```

### Page Header

Vị trí: đầu content.

Nội dung:

- Tên kho: `Kho cứu trợ trung tâm Đồng Xuân`.
- H1: `Readiness và vận hành kho`.
- Subtitle: `Điểm sẵn sàng, điểm nghẽn và trạng thái tổng quan.`
- Bên phải: API endpoint hoặc trạng thái đồng bộ.

### Metric Cards

Vị trí: ngay dưới page header, 4 card nằm ngang.

#### Metric 1: Điểm Nghẽn

- Label: `Điểm nghẽn`.
- Value: tên thành phần yếu nhất, ví dụ `Số lượng khả dụng`.
- Note: `50/100`.
- Icon: gauge hoặc alert.

#### Metric 2: Lô Sắp Thiếu

- Label: `Lô sắp thiếu`.
- Value: số lượng lô dưới ngưỡng.
- Note: `Ngưỡng: <= 10 đơn vị`.
- Icon: package/search.

#### Metric 3: Sự Cố Mở

- Label: `Sự cố mở`.
- Value: số incident open.
- Note: `Từ incident engine`.
- Icon: warning triangle.

#### Metric 4: Khuyến Nghị

- Label: `Khuyến nghị`.
- Value: thành phần cần xử lý.
- Note: câu khuyến nghị rút gọn.
- Icon: clipboard/list.

Card metric không nên quá cao. Ưu tiên label nhỏ, value lớn vừa đủ, note tối đa 2 dòng.

### Readiness Score Card

Vị trí: hàng 2, bên trái, chiếm khoảng 35% chiều ngang.

Nội dung:

- Label: `Readiness toàn kho`.
- Big number: `78`.
- Suffix: `/100`.
- Badge vùng: `Cần chú ý`.
- Progress bar.
- Last updated.
- Button `Tính lại`.

Ví dụ layout:

```text
┌────────────────────────────┐
│ Readiness toàn kho [Cần chú ý] │
│                              │
│ 78 /100                      │
│ ███████████░░░░              │
│                              │
│ Cập nhật 08:57 16-07 [Tính lại] │
└────────────────────────────┘
```

Màu badge/progress theo vùng:

- >=80 xanh.
- 70-79 vàng.
- 50-69 cam.
- <50 đỏ.

### Chart 6 Thành Phần

Vị trí: hàng 2, bên phải, chiếm khoảng 65% chiều ngang.

Nên dùng horizontal bar chart nếu label tiếng Việt dài. Bar chart đứng cũng được nếu có đủ không gian.

Thành phần:

1. Số lượng khả dụng.
2. Tình trạng vật tư.
3. Thời hạn.
4. Tiếp cận.
5. Môi trường.
6. Độ tin cậy dữ liệu.

Mỗi bar hiển thị:

- Score 0-100.
- Tooltip có trọng số.
- Tooltip có lý do trừ điểm.

Nên có small legend:

```text
Xanh >=80 · Vàng 70-79 · Cam 50-69 · Đỏ <50
```

### Khuyến Nghị / Lý Do Trừ Điểm

Có thể đặt ngay dưới chart hoặc trong drawer khi click component.

Nội dung:

- Thành phần yếu.
- Lý do trừ điểm.
- Khuyến nghị xử lý.
- Link tới vật tư/kệ/khu liên quan.

Ví dụ:

```text
Số lượng khả dụng thấp
5 lô dưới ngưỡng an toàn. Kiểm kê thực tế chưa xác nhận đủ số lượng.
Action: Xem lô sắp thiếu
```

---

## 6. Sơ Đồ Kho

### Mục Tiêu

Trả lời câu hỏi: **Khu/kệ nào có vấn đề, vật tư nằm ở đâu?**

### Vị Trí

Trong màn Tổng quan: hàng 3, bên trái.

Trong màn Kho vật tư: có thể đặt bên phải hoặc trên table như map phụ.

### Bố Cục

```text
┌────────────────────────────────────────┐
│ Sơ đồ kho                         [2 khu] │
│ Grid theo khu và kệ                     │
│                                        │
│ ┌──────────────────┐ ┌────────────────┐ │
│ │ Khu vật tư cứu hộ│ │ Khu y tế       │ │
│ │ A                │ │ B              │ │
│ │ ┌────┐ ┌────┐    │ │ ┌────┐ ┌────┐  │ │
│ │ │ A1 │ │ A2 │    │ │ │ B1 │ │ B3 │  │ │
│ │ │2 lô│ │4 lô│    │ │ │2 lô│ │3 lô│  │ │
│ │ └────┘ └────┘    │ │ └────┘ └────┘  │ │
│ └──────────────────┘ └────────────────┘ │
└────────────────────────────────────────┘
```

### Khu

Mỗi khu hiển thị:

- Tên khu.
- Mã khu.
- Số kệ.
- Readiness khu nếu có.
- Tổng số lô.

### Kệ

Mỗi kệ hiển thị:

- Mã kệ.
- Số lô.
- Readiness kệ nếu có.
- Icon khóa nếu `isLocked`.
- Icon chặn nếu `isBlocked`.

Màu nền kệ:

- Trắng: bình thường.
- Xanh nhạt: sẵn sàng.
- Vàng nhạt: cần chú ý.
- Cam nhạt: suy giảm.
- Đỏ nhạt: bị khóa/chặn/nguy cấp.

### Interaction

Click kệ mở right drawer.

Drawer kệ gồm:

- Tên kệ.
- Khu.
- Readiness kệ.
- Danh sách lô trên kệ.
- Cảm biến gắn với kệ.
- Lịch sử event gần đây.
- Actions:
  - Kiểm kê kệ.
  - Xuất lô.
  - Chuyển kệ.
  - Xem audit.

---

## 7. Màn Kho Vật Tư

### Mục Tiêu

Trả lời câu hỏi: **Kho có gì, ở đâu, số lượng bao nhiêu, tình trạng nào?**

### Bố Cục Desktop

```text
Page Header + Action Buttons

┌────────────────────────────────────────────────────────┐
│ Search + Filters                                       │
└────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┬─────────────────┐
│ Inventory Table                       │ Summary / Map   │
└──────────────────────────────────────┴─────────────────┘
```

### Header

Bên trái:

- H1: `Kho vật tư`.
- Subtitle: `Danh sách lô, vị trí kệ và tình trạng vật tư hiện có.`

Bên phải:

- Button `Nhập kho`.
- Button `Xuất kho`.
- Button `Xuất lô khẩn cấp`.
- Button `Kiểm kê`.
- Button `Import Excel`.

Chỉ một button primary. Các button còn lại secondary/outline.

### Filter Bar

Vị trí: dưới header, trên table.

Controls:

- Search input: tên vật tư/SKU.
- Select khu.
- Select kệ.
- Select danh mục.
- Select tình trạng.
- Select lưu hành.
- Toggle `Sắp hết hạn`.
- Toggle `Sắp thiếu`.
- Button reset filter.

### Inventory Table

Cột:

1. Vật tư.
   - Tên.
   - SKU.
   - Danh mục.
2. Lô.
3. Vị trí.
   - Khu.
   - Kệ.
4. Số lượng.
5. Đơn vị.
6. Tình trạng vật lý.
7. Lưu hành.
8. Hạn dùng.
9. Readiness.
10. Actions.

Actions dạng icon:

- Xem chi tiết.
- Sửa tay.
- Chuyển kệ.
- Xuất.

### Row Click

Click row mở right drawer vật tư.

### Detail Drawer Vật Tư

Vị trí: trượt từ phải sang, rộng 420-520px desktop.

Nội dung:

- Header:
  - Tên vật tư.
  - SKU.
  - Status badges.
- Tabs:
  - Tổng quan.
  - Giao dịch.
  - Kiểm kê.
  - Readiness.
  - Audit.

Tổng quan:

- Số lượng.
- Đơn vị.
- Khu/kệ.
- Hạn dùng.
- Tình trạng vật lý.
- Trạng thái lưu hành.
- Có đang mượn không.

Actions trong drawer:

- Nhập kho.
- Xuất kho.
- Chuyển kệ.
- Sửa tay.
- Reconcile.

---

## 8. Nhập/Xuất Đa Nguồn

### Mục Tiêu

UI cần thể hiện rõ hệ thống có 4 tầng nhập/xuất:

1. Quét QR.
2. Xuất lô khẩn cấp.
3. Cảm biến tự động.
4. Kiểm kê + sửa tay.

### Vị Trí

Các action nằm trong:

- Màn Kho vật tư.
- Drawer vật tư.
- Màn Kiểm kê.
- Màn Mission khi xuất theo phương án.

### Transaction Source Badge

Mỗi giao dịch cần badge nguồn:

- `SCAN`.
- `BULK`.
- `LOADCELL`.
- `RFID`.
- `MANUAL`.

Badge này xuất hiện trong:

- Transaction history.
- Audit log.
- Detail drawer.
- Incident evidence nếu liên quan.

### Xuất Lô Khẩn Cấp

UI nên là modal hoặc page riêng.

Form:

- Chọn khu/kệ hoặc chọn danh sách lô.
- Preview các lô sẽ xuất.
- Input số lượng từng lô.
- Lý do bắt buộc.
- Cảnh báo rollback nếu có lô không đủ tồn.
- Button `Xác nhận xuất lô`.

Nên có warning:

```text
Thao tác này nhạy cảm. Hệ thống sẽ ghi audit 5W và không thể xóa.
```

---

## 9. Sửa Tay Số Lượng

### Mục Tiêu

Cho phép WAREHOUSE/ADMIN chỉnh số lượng khi kiểm kê thực tế khác hệ thống, nhưng phải có kiểm soát.

### Vị Trí

Mở từ:

- Drawer vật tư.
- Table row action.
- Màn Kiểm kê.

### Modal Layout

```text
┌─────────────────────────────────────┐
│ Sửa tay số lượng                    │
│ Vật tư: Áo phao người lớn           │
│ Lô: LIFE-ADULT-A1                   │
│                                     │
│ Số hiện tại: 96                     │
│ Số mới: [____]                      │
│                                     │
│ Lý do bắt buộc:                     │
│ [textarea]                          │
│                                     │
│ [Hủy] [Xác nhận]                    │
└─────────────────────────────────────┘
```

### Rules

- Không có lý do thì disabled submit hoặc báo lỗi.
- Nếu thay đổi lớn, yêu cầu double-confirm.
- Hiển thị before/after.
- Sau submit show toast + link audit.

---

## 10. Reconcile / Đối Chiếu Kiểm Kê

### Mục Tiêu

Đối chiếu số hệ thống với số đếm thực tế, tránh tính nhầm vật tư đang cho mượn.

### Vị Trí

Màn riêng: `Kiểm kê & đối chiếu`.

### Bố Cục

```text
Tabs: Kiểm kê mới | Chênh lệch | Lịch sử

┌────────────────────────────┬────────────────────────────┐
│ Counting workspace          │ Difference preview         │
└────────────────────────────┴────────────────────────────┘
```

### Counting Workspace

Controls:

- Chọn kho.
- Chọn khu.
- Chọn kệ.
- Danh sách lô cần đếm.
- Input số đếm thực tế.
- Button scan QR.
- Button nhập SKU tay.
- Progress: `Đã đếm 6/12 lô`.

### Difference Preview

Mỗi dòng hiển thị:

- Số hệ thống.
- Số đang cho mượn.
- Số kỳ vọng trong kho.
- Số kiểm kê thực tế.
- Chênh lệch.
- Action:
  - Recount.
  - Apply override.
  - Ignore.

Nếu apply override:

- Modal xác nhận.
- Bắt buộc lý do.
- Hiển thị ảnh hưởng đến readiness/data reliability.

---

## 11. Mượn - Trả

### Mục Tiêu

Quản lý vật tư tái sử dụng đã giao cho đội cứu hộ, không tính nhầm là mất kho.

### Vị Trí

Màn riêng: `Mượn - trả`.

### Tabs

```text
Đang mượn | Tạo phiếu mượn | Trả vật tư | Lịch sử
```

### Đang Mượn

Bảng:

- Phiếu.
- Đội nhận.
- Vật tư.
- Số lượng.
- Ngày mượn.
- Nhiệm vụ liên quan.
- Trạng thái.

### Tạo Phiếu Mượn

Form:

- Đội cứu hộ.
- Nhiệm vụ liên quan.
- Vật tư tái sử dụng.
- Số lượng.
- Người bàn giao.
- Ghi chú.

Không cho mượn vật tư tiêu hao. Nếu chọn nước/pin, UI báo:

```text
Vật tư tiêu hao không tạo phiếu mượn. Vui lòng dùng xuất kho.
```

### Trả Vật Tư

Form:

- Chọn phiếu.
- Số trả tốt.
- Số trả hỏng.
- Số mất.
- Ghi chú.

Preview:

- Tốt quay về kho.
- Hỏng chuyển cần kiểm tra/hư hỏng.
- Mất bị trừ khỏi tổng kho.

---

## 12. Màn Mô Phỏng Cảm Biến

### Mục Tiêu

Cho phép tạo event cảm biến và chạy scenario để thấy readiness/cảnh báo thay đổi realtime.

### Bố Cục Desktop

```text
Page Header

┌────────────────────┬────────────────────────────────────┐
│ Control Panel      │ Device Grid                         │
│ - Scope            │                                    │
│ - Manual controls  │                                    │
│ - Scenario runner  │                                    │
└────────────────────┴────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Event Timeline                                          │
└─────────────────────────────────────────────────────────┘
```

### Control Panel

Vị trí: bên trái, rộng 360-420px.

#### Scope

- Select kho.
- Select khu.
- Select kệ.
- Select device.

#### Manual Controls

- Slider nhiệt độ.
- Slider độ ẩm.
- Slider trọng lượng/loadcell.
- Toggle cửa mở/đóng.
- Toggle gateway online/offline.
- Button `Bắn event`.

#### Scenario Runner

- Select scenario:
  - Normal.
  - Suspected loss.
  - Sensor fault.
  - Bad storage.
  - Disconnect.
  - Misplaced.
- Seed input.
- Speed segmented control: `x1`, `x10`.
- Buttons:
  - Play.
  - Pause.
  - Reset.

#### Impact Preview

Hiển thị:

- Readiness hiện tại.
- Vùng hiện tại.
- Cảnh báo nếu event có thể làm readiness rớt.

### Device Grid

Vị trí: bên phải.

Card thiết bị:

- Device code.
- Device type.
- Current value.
- Unit.
- Last updated.
- Online/offline.
- Zone/shelf.

Màu:

- Online: xanh.
- Stale >30 phút: vàng/cam.
- Offline: xám/đỏ.

### Event Timeline

Vị trí: dưới control + device grid.

Cột:

- Time.
- Device.
- Event type.
- Value.
- Unit.
- Scenario.
- Run.
- Saved/skipped.

Nên có filter theo device/scenario.

---

## 13. Màn Mission-To-Kit

### Mục Tiêu

Từ mô tả tình huống thiên tai, hệ thống sinh phương án vật tư, tính thiếu đủ và cho người phụ trách duyệt.

### Bố Cục Desktop

```text
┌────────────────────────────┬────────────────────────────┐
│ Situation Input             │ Parsed Requirements        │
└────────────────────────────┴────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Allocation Plan                                         │
└─────────────────────────────────────────────────────────┘

┌────────────────────────────┬────────────────────────────┐
│ Shortage + Neighbor Stores │ Readiness Before/After     │
└────────────────────────────┴────────────────────────────┘

Sticky approval footer
```

### Situation Input

Vị trí: top-left.

Nội dung:

- Textarea lớn.
- Button ghi âm voice.
- Button tình huống mẫu.
- Button phân tích.

Lưu ý thiết kế:

- Voice chỉ chuyển thành text.
- User phải sửa text trước khi gửi AI.
- Có note: `AI chỉ parse ngôn ngữ; số liệu do backend tính.`

### Parsed Requirements

Vị trí: top-right.

Hiển thị dạng readable cards:

- Loại tình huống.
- Số người.
- Thời gian cô lập.
- Trẻ em.
- Người già.
- Ca y tế.
- Ghi chú.

Nên có toggle `JSON view` cho technical users, nhưng mặc định không show JSON raw.

### Allocation Plan

Vị trí: giữa màn, full width.

Bảng:

- Vật tư.
- Nhu cầu.
- Có thể cấp.
- Thiếu.
- Mức đáp ứng.
- Lô lấy.
- Vị trí.
- Hạn dùng.

Mức đáp ứng chung:

- Hiển thị lớn.
- Tính theo mắt xích yếu nhất, không dùng trung bình.

Ví dụ:

```text
Đáp ứng chung: 14%
Điểm nghẽn: Nước uống
```

### Neighbor Stores

Vị trí: dưới, bên trái.

Hiển thị khi thiếu:

- Tên kho.
- Khoảng cách.
- Vật tư có thể mượn.
- Số lượng.
- Liên hệ.
- Button `Đánh dấu cần liên hệ`.

### Readiness Before/After

Vị trí: dưới, bên phải.

So sánh:

- Readiness hiện tại.
- Readiness sau khi xuất.
- Thành phần giảm mạnh.
- Cảnh báo nếu tụt vùng.

### Approval Footer

Vị trí: sticky bottom trong màn Mission.

Buttons:

- Lưu nháp.
- Duyệt phương án.
- Từ chối.
- Xuất theo phương án.

---

## 14. Màn Sự Cố & Cảnh Báo

### Mục Tiêu

Biến event cảm biến thành sự cố có bằng chứng, trạng thái xử lý và giải thích.

### Bố Cục

```text
┌────────────────────────────┬────────────────────────────┐
│ Incident List              │ Incident Detail            │
└────────────────────────────┴────────────────────────────┘
```

### Incident List

Vị trí: bên trái hoặc full table nếu màn rộng.

Mỗi item:

- Severity.
- Title.
- Kind.
- Confidence.
- State.
- Detected time.

Filters:

- Open.
- Acknowledged.
- Assigned.
- Resolved.
- Severity.
- Device/khu.

### Incident Detail

Vị trí: bên phải.

Nội dung:

- Title.
- Severity badge.
- Confidence score.
- State flow:
  - Open.
  - Acknowledged.
  - Assigned.
  - Resolved.
- Evidence timeline.
- AI explanation.
- Action notes.

### Evidence Timeline

Mỗi dòng:

- Time.
- Sensor/device.
- Event.
- Value.
- Weight.
- Meaning.

Ví dụ:

```text
21:02 - Door opened
21:03 - Loadcell decreased 4kg
21:03 - RFID detected item through gate
No matching export transaction
```

### Actions

- Acknowledge.
- Assign.
- Resolve.
- Add note.

Ngôn ngữ UI nên dùng “nghi thất thoát”, không dùng “trộm cắp” như kết luận chắc chắn.

---

## 15. Nhật Ký Hậu Kiểm

### Mục Tiêu

Cho ADMIN tra soát thao tác nhạy cảm.

### Bố Cục

```text
Filter Bar

┌────────────────────────────────────────────────────────┐
│ Audit Table                                            │
└────────────────────────────────────────────────────────┘

Right detail drawer
```

### Filter Bar

Controls:

- User.
- Action.
- Entity.
- Time range.
- Source.
- Sensitive only.

### Audit Table

Cột:

- Time.
- Actor.
- Action.
- Entity.
- Reason.
- Before/after.
- Source.
- Risk level.

### Detail Drawer

Nội dung:

- Full metadata.
- Before/after JSON.
- Lý do.
- Link tới vật tư/mission/incident liên quan.

---

## 16. Cấu Hình

### Mục Tiêu

Cho ADMIN cấu hình hệ thống mà không sửa code.

### Sections

1. Readiness weights.
2. Action thresholds.
3. Mission norms.
4. Neighbor warehouses.
5. Users & roles.
6. Devices.
7. Backup/offline.

### Layout

Dạng settings page:

```text
┌───────────────┬──────────────────────────────┐
│ Settings nav  │ Settings form                │
└───────────────┴──────────────────────────────┘
```

---

## 17. Presentation Mode / Sức Khỏe Kho

### Mục Tiêu

Màn một trang để trình chiếu khi demo hoặc báo cáo nhanh.

### Vị Trí

Có thể là route riêng hoặc nút trong dashboard: `Màn sức khỏe kho`.

### Nội Dung

- Readiness score lớn.
- Vùng trạng thái.
- Top 3 điểm nghẽn.
- Top 5 vật tư nguy cơ thiếu.
- Cảnh báo mở.
- Mission đang chờ duyệt.
- Trạng thái cảm biến.
- Nút xuất PDF.
- Nút in phiếu khẩn cấp.

### Layout

```text
┌──────────────────────┬────────────────────────┐
│ Big readiness score  │ Top blockers           │
├──────────────────────┼────────────────────────┤
│ Critical inventory   │ Open alerts            │
├──────────────────────┴────────────────────────┤
│ Sensor status + latest events                  │
└───────────────────────────────────────────────┘
```

---

## 18. PDF Và Phiếu Giấy Dự Phòng

### Mục Tiêu

Hỗ trợ tình huống mất điện/mất mạng.

### Vị Trí

Buttons trong:

- Mission.
- Kho vật tư.
- Presentation mode.

### Các Loại PDF

1. Phiếu xuất khẩn cấp.
2. Danh sách vật tư theo nhiệm vụ.
3. Báo cáo readiness.
4. Audit report.
5. Danh sách vị trí kệ để đi lấy hàng.

Phiếu xuất nên có:

- Tên nhiệm vụ.
- Danh sách vật tư.
- Vị trí.
- Số lượng.
- Ô ký nhận.
- Ô ghi chú tay.

---

## 19. Component System Cần Chuẩn Hóa

Designer nên tạo bộ component:

- App shell.
- Sidebar nav item.
- Topbar.
- Metric card.
- Score card.
- Status badge.
- Data table.
- Filter bar.
- Right drawer.
- Confirm modal.
- Timeline.
- Device card.
- Warehouse grid cell.
- Chart card.
- Empty state.
- Error state.
- Skeleton loading.
- Segmented control.
- Sticky action footer.
- Toast.

---

## 20. Loading, Empty, Error States

### Loading

Không dùng spinner đơn độc cho vùng dữ liệu lớn. Dùng skeleton giống layout thật:

- Skeleton metric cards.
- Skeleton table rows.
- Skeleton chart.
- Skeleton map cell.

### Empty

Empty state phải nói rõ bước tiếp theo:

- Chưa có vật tư -> `Nhập kho` hoặc `Import Excel`.
- Chưa có event -> `Chạy scenario` hoặc `Bắn event`.
- Chưa có readiness -> `Tính lại readiness`.

### Error

Error state cần:

- Lý do ngắn.
- Action retry.
- Nếu lỗi quyền, nói rõ thiếu quyền.

---

## 21. Responsive Rules

### Desktop

- Sidebar fixed.
- Content 12-column.
- Drawer bên phải.
- Table full width.

### Tablet

- Sidebar có thể collapse thành icon rail.
- Drawer rộng 420px.
- Metric cards 2x2.

### Mobile

- Topbar + nav tabs.
- Content 1 column.
- Metric cards stack.
- Table horizontal scroll.
- Drawer full-screen.
- Sticky footer cho form.

---

## 22. Khoảnh Khắc Demo Chính

Designer cần làm nổi flow này:

1. User nhìn dashboard readiness.
2. Simulator kéo độ ẩm khu y tế lên cao.
3. Timeline xuất hiện event cảm biến.
4. Readiness tụt vùng trong dashboard.
5. Khuyến nghị xuất hiện.
6. Incident/cảnh báo mở.
7. User thấy hệ thống không chỉ lưu kho, mà phản ứng realtime.

Đây là “khoảnh khắc vàng” của sản phẩm.

---

## 23. Trạng Thái Frontend Hiện Tại

Đã có:

- Login.
- Sidebar/tab navigation.
- Dashboard Readiness cơ bản.
- Metric cards.
- Chart 6 thành phần.
- Sơ đồ kho grid.
- Bảng vật tư.
- Panel simulator device/timeline.
- Loading/error/empty state cơ bản.

Chưa có đầy đủ:

- CRUD vật tư.
- Adjust form.
- Reconcile form.
- Mission UI.
- Incident UI đầy đủ.
- Audit log UI.
- Simulator controls đầy đủ.
- Socket.IO realtime frontend đầy đủ.
- PDF/report.
- Chatbot.
- Presentation mode.

---

## 24. Checklist Cho Designer

Khi thiết kế xong cần tự kiểm:

- [ ] Nhìn 5 giây biết readiness kho đang ở vùng nào.
- [ ] Biết điểm nghẽn lớn nhất là gì.
- [ ] Biết nên xử lý gì tiếp theo.
- [ ] Biết vật tư nằm ở khu/kệ nào.
- [ ] Biết event cảm biến mới nhất là gì.
- [ ] Biết thao tác nhạy cảm nào cần lý do/audit.
- [ ] Table đọc được trên desktop.
- [ ] Mobile không vỡ layout.
- [ ] Không dùng visual style marketing/generic AI.
- [ ] Màu trạng thái nhất quán toàn hệ thống.
- [ ] Empty/error/loading state được thiết kế đầy đủ.

