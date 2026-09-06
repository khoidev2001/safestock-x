---
name: english-identifiers
description: Enforces English-only identifiers in SafeStock X source code. Use whenever writing or renaming any variable, function, class, type, constant, database field, API field, file, or npm script — in TypeScript, JavaScript, Python, or Prisma. Vietnamese belongs in comments, UI strings and data, never in names.
---

# Đặt tên bằng tiếng Anh

## Quy tắc

**Mọi định danh trong mã nguồn MUST viết bằng tiếng Anh.** Áp dụng cho biến, tham số,
hàm, class, interface, type, enum, hằng số, field của database và của API, tên tệp,
tên script npm.

**Tiếng Việt vẫn giữ nguyên ở ba chỗ** — đây không phải ngoại lệ mà là yêu cầu:

| Chỗ | Ví dụ đúng |
|---|---|
| Chú thích | `// Trừ phần đã hứa ra khỏi danh sách lô khả dụng.` |
| Chuỗi hiển thị cho người dùng | `` `Kho ${name} còn ${stock} nhưng đã hứa ${promised}` `` |
| Dữ liệu nghiệp vụ | regex bắt lời kể `"nguoi bi thuong"`, tên thôn trong seed |

Ranh giới: **tên do lập trình viên đặt** thì tiếng Anh; **chữ người dùng đọc hoặc
người dùng gõ vào** thì tiếng Việt.

## Trước khi viết một tên

Tự hỏi: *tên này có phải là tiếng Việt không dấu không?* Nếu có, dịch ngay — đừng
để lại "sửa sau", vì không ai quay lại sửa.

```ts
// SAI
const soLuongTon = 10;
const danhSachNguoiDung = [];
const thieuMotPhan = items.filter(...);
function tinhTongTien() {}
const KHO_MOI_TRANG = 9;

// ĐÚNG
const stockQuantity = 10;
const users = [];
const partiallyShort = items.filter(...);
function calculateTotalAmount() {}
const WAREHOUSES_PER_PAGE = 9;
```

```python
# SAI
def kiem_cau_tra_loi(cau, payload): ...
so_nguoi = 5
_MA_VAT_TU = re.compile(...)

# ĐÚNG
def ensure_safe_answer(answer, payload): ...
people_count = 5
_ITEM_CODE_RE = re.compile(...)
```

## Từ điển nghiệp vụ của dự án

Dùng đúng những từ này để cả repo gọi cùng một thứ bằng cùng một tên:

| Tiếng Việt | Tiếng Anh |
|---|---|
| kho | warehouse |
| thôn | hamlet |
| xã | commune |
| tồn (kho) | stock |
| lô hàng | batch |
| vật tư / món | item |
| số lượng | quantity |
| nhiệm vụ | mission |
| phiếu (yêu cầu kho) | warehouse request |
| đã hứa / cam kết | promised / commitment |
| thiếu hụt | shortfall |
| cho mượn (liên xã) | inter-commune loan |
| người dùng | user |
| trưởng thôn | hamlet leader |
| điều phối | coordination |
| bản tin | briefing |
| ký nhận | pickup confirmation |
| chuẩn bị xong | prepared |
| ảnh bằng chứng | evidence photo |
| bỏ dấu | strip diacritics |
| ngưỡng | threshold |
| mốc thời gian | timestamp |

Từ chưa có trong bảng: chọn từ tiếng Anh phổ thông nhất rồi **bổ sung vào bảng này**
trong cùng PR, để người sau không đặt một tên khác cho cùng khái niệm.

## Đặt tên test

Tên test cũng là định danh. Câu mô tả tiếng Việt thì để trong `it(...)` / `describe(...)`
— đó là chuỗi, không phải tên.

```ts
// ĐÚNG: tên hàm tiếng Anh, câu mô tả tiếng Việt
const failTimes = (times: number) => { ... };
it("đúng lần thứ 10 mới khoá, lần thứ 9 vẫn cho thử", () => { ... });
```

Python không có chỗ để câu mô tả, nên **tên hàm test phải tự mô tả bằng tiếng Anh**:

```python
# SAI
def test_khong_nap_lai_khi_ca_hai_model_dang_o_trong_vram(): ...

# ĐÚNG
def test_no_reload_when_both_models_are_in_vram(): ...
```

## Tự kiểm trước khi báo xong

```bash
pnpm lint:naming
```

Lệnh này soi **vị trí khai báo** trong mọi tệp `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py` mà
git đang theo dõi, và không đụng tới chú thích, chuỗi hay chữ trong JSX. Nó cũng
chạy trong CI (`Reject Vietnamese identifiers`), nên bỏ qua ở máy chỉ là dời lỗi
sang PR.

Tên riêng có thật (địa danh `dongXuan`, `tuyAn`, mã ngôn ngữ `vi`, tên model
`phoWhisper`) đã nằm trong danh sách cho phép của
[`scripts/check-identifier-language.mjs`](../../scripts/check-identifier-language.mjs).
Gặp tên riêng mới thì thêm vào `ALLOWED` ở đó, kèm một dòng nói vì sao — đừng nới
danh sách âm tiết tiếng Anh, vì nới một lần là bộ lọc mất tác dụng vĩnh viễn.

## Khi đọc mã cũ

Thấy tên tiếng Việt trong tệp đang sửa thì **đổi luôn**, cùng mọi chỗ dùng nó. Đổi
tên là thao tác không đổi hành vi; để lại là ép người sau đọc hai thứ tiếng trong
cùng một hàm.

Nhưng **đừng mở rộng sang tệp khác** chỉ để dọn tên — một PR đổi tên rải khắp repo
thì không ai review được. Sửa trong phạm vi mình đang chạm là đủ.
