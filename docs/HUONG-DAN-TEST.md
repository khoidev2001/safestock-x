# Hướng dẫn kiểm thử Ứng phó nhanh

_Cập nhật: 2026-07-31 · Không yêu cầu Playwright_

Tài liệu này dành cho người kiểm thử trực tiếp trên giao diện. Thực hiện theo thứ tự để kiểm tra từ dữ liệu kho, AI, Readiness đến điều phối cứu hộ.

> Muốn test theo **luồng công việc xuyên web · điện thoại · desktop** thì xem
> [HUONG-DAN-TEST-3-UNG-DUNG.md](HUONG-DAN-TEST-3-UNG-DUNG.md). Khi hai tài liệu
> mâu thuẫn, lấy tài liệu đó làm chuẩn vì nó bám sát vai trò và luồng hiện tại.

## 1. Baseline mong đợi

Sau khi seed, hệ thống phải có:

| Dữ liệu | Số lượng |
|---|---:|
| Kho trung tâm | 1 |
| Kho thôn | 17 |
| Người dùng | 20 |
| Mặt hàng/SKU | 17 |
| Lô hàng | 126 |
| Bản kiểm kê | 126 |
| Phiếu mượn đang mở | 2 |
| Thiết bị ảo | 68 |
| Sự cố | 2 |
| Giao dịch lịch sử | 190 |

Tọa độ 17 kho thôn phải để trống. Số lượng vật tư là dữ liệu mô phỏng phục vụ demo, không phải số liệu kiểm kê chính thức.

## 2. Chuẩn bị lần đầu

Yêu cầu:

- Node.js 20 trở lên và pnpm 10 trở lên.
- Docker Desktop đang chạy.
- Python virtual environment của `apps/ai-service` đã cài dependencies.
- Ollama đã cài model `qwen3.5:4b`.

Kiểm tra model:

```powershell
ollama list
```

Nếu chưa có `qwen3.5:4b`:

```powershell
ollama pull qwen3.5:4b
```

Khởi tạo hạ tầng và database tại thư mục gốc dự án:

```powershell
pnpm install
pnpm infra:up
pnpm --filter @safestock/backend prisma:push
pnpm --filter @safestock/backend seed
```

> `seed` xóa toàn bộ dữ liệu demo hiện tại rồi tạo lại baseline. Không chạy trên database cần giữ dữ liệu thật.

Kết quả seed đúng phải có dòng chính:

```text
warehouses: 18
hamlets: 17
items: 17
batches: 126
inventoryCounts: 126
```

## 3. Khởi động hệ thống

Mở bốn cửa sổ PowerShell riêng.

Terminal 1 - Ollama:

```powershell
ollama serve
```

Nếu Ollama đã chạy dưới dạng Windows service và báo cổng `11434` đang được dùng, không cần chạy thêm.

Terminal 2 - AI service:

```powershell
pnpm ai:dev
```

Terminal 3 - Backend:

```powershell
pnpm be:dev
```

Terminal 4 - Frontend:

```powershell
pnpm fe:dev
```

Kiểm tra dịch vụ:

```powershell
Invoke-RestMethod http://localhost:3100/api/health
Invoke-RestMethod http://localhost:8000/health
Invoke-WebRequest http://localhost:3200 -UseBasicParsing
```

Kết quả đạt:

- Backend `status = ok`, database và Redis `up`.
- AI service báo provider `ollama`, model `qwen3.5:4b`.
- Frontend trả HTTP `200`.

Mở giao diện: [http://localhost:3200](http://localhost:3200).

## 4. Tài khoản test

| Tài khoản | Mật khẩu | Dùng để test |
|---|---|---|
| `admin` | `admin123@` | Toàn xã, bản đồ, người dùng, lập Mission |
| `staff@ungphonhanh.life` | `staff123` | Vận hành kho trung tâm |
| `rescue@ungphonhanh.life` | `rescue123` | Vai trò đội cứu hộ |
| `truongthon@ungphonhanh.life` | `reporter123` | Phụ trách kho thôn, kiêm báo cáo tình huống |
| `truongthon1@ungphonhanh.life` | `truongthon123` | Kho thôn Long Châu |
| `truongthon2@ungphonhanh.life` ... `truongthon17@ungphonhanh.life` | `truongthon123` | Các kho thôn còn lại theo thứ tự seed |

## 5. Smoke test 10 phút

Thực hiện phần này trước mỗi buổi demo.

| ID | Thao tác | Kết quả đạt |
|---|---|---|
| S01 | Đăng nhập `admin` | Vào dashboard, kho mặc định là **Kho cứu trợ trung tâm Đồng Xuân** |
| S02 | Mở **Tổng quan** | Có trạng thái vận hành, sáu mặt đánh giá, lý do và hành động; điểm chỉ hiển thị phụ |
| S03 | Mở **Kho vật tư** | Có dữ liệu lô, vị trí kệ, số lượng, tình trạng và hạn dùng |
| S04 | Mở **Ngày thường** | Có dự báo cho 17 mặt hàng và có cảnh báo hạn dùng |
| S05 | Mở **Trợ lý**, hỏi `Kho sẵn sàng đáp ứng được chưa?` | BOT trả lời từ trạng thái, blocker và hành động hiện tại; không báo `Failed to fetch` |
| S06 | Mở **Sự cố** | Có một lỗi cảm biến đang mở và một sự cố bảo quản đã xử lý |
| S07 | Mở **Mượn-trả** | Có hai phiếu đang mở: áo phao và bộ đàm |
| S08 | Mở **Bản đồ kho** | Danh sách có 18 kho; 17 kho thôn hiển thị `chưa ghim` |
| S09 | Mở **Báo cáo tháng** | Có báo cáo mẫu của kho thôn Long Hà đang chờ duyệt |
| S10 | Mở **Người dùng** | Có 20 tài khoản; mục này chỉ ADMIN nhìn thấy |

Nếu một trong S01-S05 thất bại, chưa nên tiếp tục demo Mission.

## 6. Kiểm thử chi tiết theo tính năng

### T01 - Đăng nhập và phân quyền

1. Đăng nhập `admin`: phải thấy menu **Người dùng** và **Bản đồ kho** có chế độ ghim.
2. Đăng xuất, đăng nhập `staff@ungphonhanh.life`: không được thấy chức năng quản trị người dùng.
3. Đăng nhập `truongthon1@ungphonhanh.life`: dữ liệu phải thuộc **Kho thôn Long Châu**, không được sửa kho thôn khác.
4. Đăng nhập `rescue@ungphonhanh.life`: không được có quyền quản trị hoặc xuất kho tùy ý.

Đạt khi quyền và phạm vi kho thay đổi đúng theo vai trò, không chỉ ẩn nút mà API cũng trả `403` cho thao tác trái quyền.

### T02 - Danh sách 17 thôn và pin tọa độ

Đăng nhập `admin`, mở **Bản đồ kho**:

1. Kiểm tra tổng số là 18 kho.
2. Kiểm tra đủ 17 thôn: Long Châu, Long Thăng, Long Hà, Long Bình, Long Mỹ, Long Thạch, Long Hòa, Kỳ Đu, Phước Huệ, Tân Bình, Tân An, Tân Hòa, Tân Phước, Tân Phú, Tân Vinh, Phú Sơn, Triêm Đức.
3. Bật **Chế độ ghim tọa độ**.
4. Chọn một kho thôn, click vị trí trên bản đồ hoặc kéo marker.
5. Bấm **Lưu**.
6. Tải lại trang; tọa độ vừa lưu phải còn nguyên.

Nên pin kho trung tâm và ít nhất hai kho thôn trước khi test điều phối theo khoảng cách. Chạy seed lại sẽ xóa các tọa độ vừa pin.

### T03 - Readiness vận hành

Mở **Tổng quan**:

1. Kiểm tra hệ thống dùng nhãn **Sẵn sàng**, **Cần xử lý** hoặc **Không thể điều phối** làm kết luận chính.
2. Kiểm tra có sáu mặt: số lượng, tình trạng, hạn dùng, tiếp cận, môi trường và độ tin cậy dữ liệu.
3. Kiểm tra mỗi vấn đề có lý do và hành động đề xuất.
4. Kiểm tra lô hết hạn, lô hỏng, lô cần kiểm tra và lô trên kệ bị khóa không được tính như hàng cấp phát bình thường.

Không đánh giá đạt chỉ vì điểm cao. Nếu có blocker nghiêm trọng thì trạng thái vẫn phải chặn điều phối.

### T04 - Kho vật tư và kiểm kê

Mở **Kho vật tư**, chọn một lô dễ nhận biết và ghi lại số lượng. Sau đó mở **Kiểm kê**:

1. Nhập số đếm thực tế khác số hệ thống một đơn vị.
2. Kiểm tra giao diện hiển thị chênh lệch `+1` hoặc `-1`.
3. Bấm **Ghi đè**.
4. Quay lại **Kho vật tư**, số lượng phải đổi.
5. Mở **Hậu kiểm**, phải có log của thao tác kiểm kê.

Ca này làm thay đổi dữ liệu. Reseed sau khi test nếu cần baseline sạch.

### T05 - Mượn và trả vật tư

Đăng nhập `staff@ungphonhanh.life`, mở **Mượn-trả**:

1. Chọn phiếu áo phao và bấm **Ghi nhận trả**.
2. Nhập một tổ hợp hợp lệ, ví dụ hoàn tốt `10`, hoàn hỏng `1`, mất `1` nếu số còn nợ cho phép.
3. Tổng ba ô không được vượt số còn nợ.
4. Bấm **Xác nhận trả**.
5. Kiểm tra số còn nợ giảm; phần mất phải làm giảm tồn thực tế.
6. Kiểm tra **Hậu kiểm** có log tương ứng.

### T06 - Sự cố kho

Đăng nhập `admin` hoặc `staff`, mở **Sự cố**:

1. Xác nhận có sự cố `Cảm biến tải kệ C2 cần kiểm tra` đang mở.
2. Bấm **Tiếp nhận**; trạng thái chuyển sang đang xử lý.
3. Bấm **Xử lý xong**; trạng thái chuyển sang đã xử lý.
4. Kiểm tra **Hậu kiểm** và thông báo liên quan.

Để tạo thêm sự kiện mô phỏng, đặt `SIMULATION_MUTATION_ENABLED=true` trong
`.env`, restart backend rồi chạy `pnpm desktop:dev`. Đăng nhập admin tại
`localhost:3100`, `ungphonhanh.life` hoặc hostname/IP LAN, kéo slider rồi bấm
**Xác nhận và gửi**. Web poll sẽ thấy timeline; khi vượt ngưỡng, kiểm tra chuông
cục bộ và Incident/email outbox. Đặt cờ về `false` khi xong.

### T07 - AI quản trị ngày thường

Mở **Ngày thường** và kiểm tra:

- Dự báo cạn kho có dữ liệu từ lịch sử xuất.
- Có tối thiểu một mặt hàng cần chú ý.
- Có ba cảnh báo lô sắp/đã hết hạn ở baseline.
- Báo cáo tháng có xu hướng tăng/giảm và diễn giải.
- Thời tiết lỗi hoặc kho chưa có tọa độ không được làm cả trang thất bại.

### T08 - Trợ lý AI

Mở **Trợ lý** hoặc bong bóng chat góc phải dưới và hỏi lần lượt:

1. `Kho sẵn sàng đáp ứng được chưa?`
2. `Còn bao nhiêu áo phao người lớn có thể cấp ngay?`
3. `Còn bao nhiêu áo phao trẻ em có thể cấp ngay?`
4. `Kho còn bao nhiêu nước uống đóng chai?`
5. `Còn bao nhiêu gạo cứu trợ?`
6. `Còn bao nhiêu bộ sơ cứu có thể cấp ngay?`
7. `Vật tư nào có hạn dùng gần nhất?`
8. `Kho đang có sự cố gì?`
9. `Ba ngày tới có cảnh báo mưa lớn không?`
10. `Thủ đô nước Pháp là gì?`

Tiêu chí đạt:

- Câu 1-9 trả lời dựa trên dữ liệu kho, không tự bịa số.
- Câu 10 phải từ chối hoặc nói ngoài phạm vi kho.
- Nếu Ollama vừa khởi động, câu đầu có thể chậm hơn do model được nạp vào RAM.
- Không được hiện `Trợ lý AI tạm thời không phản hồi` khi cả Ollama và AI service đang khỏe.

### T09 - Lập phương án Mission-to-Kit

Điều kiện: đã pin ít nhất kho trung tâm, một kho thôn và một điểm nạn.

Đăng nhập `admin`, mở **Nhiệm vụ**:

1. Chọn mẫu **Lũ lụt 100 người**.
2. Click bản đồ để ghim điểm nạn.
3. Bấm **Lập phương án phân bổ**.
4. Kiểm tra nhu cầu gồm các SKU phù hợp tình huống.
5. Kiểm tra bảng cho biết cần bao nhiêu, cấp được bao nhiêu, thiếu bao nhiêu và kho cấp.
6. Kiểm tra panel khả năng đáp ứng hiển thị **Đủ khả năng đáp ứng**, **Đáp ứng một phần** hoặc **Chưa thể điều phối**.
7. Bấm **Sinh phương án cứu hộ**.
8. Kiểm tra Action Plan có mục tiêu, các giai đoạn thời gian, cảnh báo và câu hỏi cần xác minh.
9. Nếu trạng thái không bị chặn, bấm **Gửi cho đội cứu hộ**.

Số liệu định lượng phải do backend tính. AI chỉ diễn giải, không được thay đổi số người, số vật tư, tỷ lệ đáp ứng hoặc ETA do backend cung cấp.

### T10 - Workflow liên vai trò

Backend đã có mission list/scope và web đã có **Hộp nhiệm vụ** với URL `?mission=...`. Phần này chỉ được tính browser acceptance hoàn chỉnh sau khi chạy đủ các phiên độc lập:

1. Đăng nhập ADMIN, mở **Nhiệm vụ**, chọn một thẻ trong **Đang xử lý** và ghi nhận URL có `?mission=`.
2. Nhấn F5 rồi mở URL đó ở tab mới; chi tiết phải vẫn là cùng mission, không hiện empty giả.
3. Đăng xuất, đăng nhập RESCUE; mở mission từ notification hoặc inbox, không copy ID, rồi xác nhận/từ chối theo trạng thái.
4. Đăng xuất, đăng nhập WAREHOUSE; mission được phân bổ cho kho phải nằm trong inbox, việc cần kho xử lý đứng trước.
5. Sau khi kho prepare, trở lại RESCUE/ADMIN bằng phiên độc lập và tìm lại mission từ inbox/notification.
6. ID không thuộc actor phải hiện lỗi 403/404 rõ, không biến thành danh sách rỗng hoặc thành công giả.

Luồng đúng:

```text
DRAFT
  -> ADMIN duyệt và phát hành thẳng tới kho
PENDING_WAREHOUSE
  -> WAREHOUSE tiếp nhận và chuẩn bị TỪNG vật tư
READY
  -> RESCUE đi giao và báo kết quả thực tế
COMPLETED
```

Xã phát hành phương án thẳng tới kho; lực lượng hiện trường không tham gia bước
phát hành mà **đóng** nhiệm vụ ở cuối. Không có bước đóng thì nhiệm vụ nằm mãi ở
`READY` trong khi vật tư đã trừ khỏi kho, và không ai biết hàng tới nơi hay chưa.

Kho chuẩn bị **theo từng mã vật tư**, không phải cả nhiệm vụ một lần: một nhiệm vụ
có thể lấy hàng từ nhiều kho, nếu gộp thì kho A phải chờ kho B mới ghi nhận được
phần việc của mình.

Đạt khi mỗi vai trò chỉ thực hiện được bước của mình; gọi sai vai trò phải trả `403`, gọi sai trạng thái phải bị từ chối.

### T11 - Báo cáo tháng

Kiểm tra nhanh bằng dữ liệu seed:

1. Đăng nhập `admin`, mở **Báo cáo tháng**.
2. Xác nhận có báo cáo kho Long Hà ở trạng thái **Chờ duyệt**.
3. Bấm duyệt hoặc từ chối.
4. Trạng thái phải cập nhật và có hậu kiểm.

Kiểm tra upload:

1. Đăng nhập một tài khoản phụ trách kho thôn (ví dụ `truongthon@ungphonhanh.life`).
2. Chuẩn bị file `.xlsx` gồm bảy cột: SKU, Tên vật tư, Số lượng, Đơn vị, Hạn dùng, Tình trạng, Ghi chú.
   Khi một mã nằm ở nhiều lô, dòng phải ghi rõ lô đã kiểm đếm — hệ thống từ chối số tổng.
3. Chọn kỳ báo cáo và gửi file.
4. Đăng nhập lại ADMIN để duyệt.
5. Chỉ sau khi duyệt, tồn kho mới được reconcile.

## 7. Kiểm thử kỹ thuật trước khi commit

Không cần Playwright. Chạy:

```powershell
# Dùng `exec jest`, KHÔNG dùng `test -- --runInBand`: pnpm 10.32.1 chuyển tiếp "--"
# thành tham số của jest, jest hiểu nhầm là mẫu đường dẫn và báo "No tests found".
pnpm --filter @safestock/backend exec jest --runInBand
pnpm --filter @safestock/backend build
pnpm --filter @safestock/frontend exec tsc --noEmit
pnpm --filter @safestock/frontend build
```

Baseline hiện tại (2026-07-31):

- Backend: **100 suite, 588 test** pass (unit + contract).
- Backend e2e trên PostgreSQL thật: **7 suite, 58 test** pass — chạy bằng
  `pnpm --filter @safestock/backend test:e2e`.
- Mobile 21, desktop 7, AI service 74, định tuyến offline 8 — đều pass.
- Backend, frontend và desktop production build pass.

## 8. Reset sau khi test

Các ca pin tọa độ, kiểm kê, trả vật tư, xử lý sự cố, duyệt báo cáo và tạo Mission đều làm thay đổi database.

Để trả về baseline:

1. Dừng thao tác trên frontend và chờ request đang chạy hoàn tất.
2. Chạy:

```powershell
pnpm --filter @safestock/backend seed
```

3. Tải lại frontend và đăng nhập lại.

Sau reset, hệ thống phải quay lại 18 kho, 17 kho thôn chưa ghim, hai phiếu mượn mở, hai sự cố và không có Mission test.

## 9. Ghi nhận kết quả

| ID | Đạt/Không đạt | Bằng chứng | Ghi chú lỗi |
|---|---|---|---|
| S01-S10 |  |  |  |
| T01 |  |  |  |
| T02 |  |  |  |
| T03 |  |  |  |
| T04 |  |  |  |
| T05 |  |  |  |
| T06 |  |  |  |
| T07 |  |  |  |
| T08 |  |  |  |
| T09 |  |  |  |
| T10 |  |  |  |
| T11 |  |  |  |

Khi báo lỗi, ghi tối thiểu: tài khoản, màn hình, dữ liệu đã nhập, kết quả thực tế, kết quả mong đợi và log Console/Network nếu có.
