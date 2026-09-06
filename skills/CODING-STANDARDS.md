# CODING STANDARDS

## Bộ quy tắc phát triển phần mềm dành cho đội ngũ kỹ thuật

**Phiên bản:** 1.0
**Áp dụng cho:** Frontend, Backend, API, Database, AI Service, IoT Service
**Mục tiêu:** Tạo mã nguồn dễ đọc, dễ kiểm thử, dễ mở rộng, dễ bảo trì và hạn chế lỗi khi nhiều thành viên cùng phát triển.

---

# 1. Nguyên tắc chung

Mọi thành viên phải tuân thủ các nguyên tắc sau:

* Code được viết để con người đọc trước, máy tính chạy sau.
* Ưu tiên rõ ràng hơn ngắn gọn.
* Không viết code chỉ để "chạy được".
* Không lặp lại logic nếu có thể tái sử dụng hợp lý.
* Không tối ưu khi chưa xác định được điểm nghẽn.
* Một hàm, một class hoặc một module chỉ nên có một trách nhiệm chính.
* Không để business logic nằm trong controller, route hoặc giao diện.
* Mọi dữ liệu đầu vào đều phải được kiểm tra.
* Mọi lỗi đều phải được xử lý hoặc ghi nhận rõ ràng.
* Không commit code chưa chạy, code debug hoặc thông tin bí mật.

Áp dụng ba mức quy tắc:

* **MUST:** Bắt buộc tuân thủ.
* **SHOULD:** Nên tuân thủ, chỉ bỏ qua khi có lý do hợp lý.
* **MAY:** Có thể áp dụng tùy từng trường hợp.

---

# 2. Quy ước ngôn ngữ

## 2.1. Ngôn ngữ trong mã nguồn

Tên biến, hàm, class, database field và API endpoint **MUST sử dụng tiếng Anh**.

Không sử dụng tiếng Việt không dấu để đặt tên.

```ts
// Không nên
const danhSachNguoiDung = [];
const tinhTongTien = () => {};

// Nên
const users = [];
const calculateTotalAmount = () => {};
```

Comment có thể viết bằng tiếng Việt hoặc tiếng Anh, nhưng toàn bộ dự án phải thống nhất một ngôn ngữ.

Quy tắc này có cổng chạy được: `pnpm lint:naming` (và bước `Reject Vietnamese identifiers` trong CI). Chi tiết cách đặt tên, từ điển nghiệp vụ và cách đặt tên test: [english-identifiers/SKILL.md](english-identifiers/SKILL.md).

## 2.2. Encoding

Tất cả file mã nguồn **MUST sử dụng UTF-8**.

## 2.3. Định dạng

* Sử dụng formatter tự động.
* Không căn chỉnh thủ công bằng nhiều khoảng trắng.
* Không trộn tab và space.
* Khuyến nghị sử dụng 2 spaces đối với JavaScript và TypeScript.
* Mỗi file phải có một dòng trống ở cuối.

---

# 3. Quy ước đặt tên

## 3.1. Biến và hàm

Sử dụng `camelCase`.

```ts
const currentUser = {};
const totalAmount = 150000;

function calculateOrderTotal() {}
function getUserById() {}
```

Tên phải mô tả được ý nghĩa.

```ts
// Không nên
const d = new Date();
const x = users.filter((u) => u.active);

// Nên
const currentDate = new Date();
const activeUsers = users.filter((user) => user.isActive);
```

Không sử dụng tên quá chung chung như: `data`, `item`, `value`, `temp`, `obj`, `result`, `info`, `test`, `abc`, `xyz`.

Chỉ sử dụng các tên trên khi phạm vi biến rất nhỏ và ý nghĩa đã rõ ràng.

## 3.2. Boolean

Tên biến boolean **MUST bắt đầu bằng**: `is`, `has`, `can`, `should`, `was`, `will`.

```ts
const isActive = true;
const hasPermission = false;
const canEditOrder = true;
const shouldSendNotification = false;
```

## 3.3. Hàm

Tên hàm phải bắt đầu bằng động từ: `getUserById()`, `createOrder()`, `updateInventory()`, `deleteProduct()`, `validateToken()`, `calculateTotalPrice()`, `sendNotification()`.

Hàm kiểm tra điều kiện: `isValidEmail()`, `hasAvailableStock()`, `canAccessResource()`.

## 3.4. Class, Interface và Type

Sử dụng `PascalCase`. Không thêm tiền tố `I` vào interface.

```ts
class UserService {}
interface UserRepository {}
type CreateOrderInput = {};
```

## 3.5. Constant

Constant dùng chung toàn hệ thống sử dụng `UPPER_SNAKE_CASE`.

```ts
const MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_PAGE_SIZE = 20;
const ACCESS_TOKEN_EXPIRES_IN = '15m';
```

Biến local không cần viết hoa toàn bộ chỉ vì sử dụng `const`.

## 3.6. Enum

Tên enum sử dụng `PascalCase`.

```ts
enum OrderStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Cancelled = 'cancelled',
}
```

## 3.7. Tên file

Sử dụng `kebab-case`: `user.service.ts`, `order.controller.ts`, `create-order.dto.ts`, `inventory.repository.ts`.

Tên component React sử dụng `PascalCase` nếu dự án đã thống nhất: `UserProfile.tsx`, `OrderDetail.tsx`.

Không dùng: `Utils.ts`, `Helpers.ts`, `Common.ts`, `NewFile.ts`, `Test2.ts`, `FinalService.ts`.

## 3.8. Database

Khuyến nghị `snake_case`: `users`, `user_profiles`, `order_items`, `created_at`, `updated_at`, `deleted_at`. Primary key: `id`. Foreign key: `user_id`. Boolean: `is_active`, `has_verified_email`.

---

# 4. Cấu trúc dự án

Tổ chức theo module hoặc domain, không gom toàn bộ file theo loại.

## 4.3. Quy tắc phụ thuộc

```text
modules → common: Được phép
common → modules: Không được phép
```

Không import trực tiếp vào file nội bộ của module khác nếu module đó đã cung cấp public API.

---

# 5. Quy tắc viết hàm

## 5.1. Một hàm chỉ thực hiện một nhiệm vụ

## 5.2. Giới hạn độ dài

Một hàm **SHOULD không vượt quá 30–40 dòng**. Một file **SHOULD không vượt quá 300–400 dòng**.

## 5.3. Số lượng tham số

Một hàm không nên có quá 3 tham số riêng lẻ. Nhiều hơn → dùng object.

## 5.4. Early return

Ưu tiên trả về sớm để giảm số tầng lồng nhau.

```ts
function processOrder(order?: Order) {
  if (!order) return null;
  if (!order.isActive) return null;
  if (order.items.length === 0) return null;
  return calculateOrder(order);
}
```

## 5.5. Không sử dụng magic number và magic string

## 5.6. Hàm không được gây side effect ngoài dự kiến

Tên hàm `getUser` không được tự động cập nhật database hoặc gửi email.

---

# 6. Kiểu dữ liệu

## 6.1. Không sử dụng `any` — dùng type cụ thể hoặc `unknown`. Chỉ dùng `any` khi tích hợp thư viện không có type, kèm comment.

## 6.2. Không lạm dụng optional. Trường bắt buộc trong domain phải khai báo bắt buộc.

## 6.3. Không dùng một type cho mọi tầng. Phân biệt Request / Input / Entity / Response / ViewModel. Không trả trực tiếp database entity ra API.

---

# 7. Controller, Service và Repository

* **Controller:** nhận request, validate, gọi service, chuyển kết quả thành response, chuyển lỗi cho error handler. KHÔNG chứa business logic.
* **Service:** xử lý nghiệp vụ.
* **Repository:** chỉ truy cập dữ liệu. Không gửi email, không xử lý quyền, không chứa logic giao diện.

---

# 8. Xử lý lỗi

## 8.1. Không nuốt lỗi — phải xử lý, ghi log hoặc throw lại.

## 8.2. Sử dụng custom error. Nhóm lỗi: ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, BusinessRuleError, IntegrationError, InternalServerError.

## 8.3. Không trả lỗi kỹ thuật cho người dùng.

```json
{ "code": "EMAIL_ALREADY_EXISTS", "message": "Email này đã được sử dụng.", "details": null }
```

Chi tiết kỹ thuật chỉ ghi trong log nội bộ.

---

# 9. Quy chuẩn API

## 9.1. Endpoint — danh từ số nhiều, không động từ.

```text
GET /api/v1/users · GET /api/v1/users/:id · POST /api/v1/users · PATCH /api/v1/users/:id · DELETE /api/v1/users/:id
```

Hành động nghiệp vụ đặc biệt: `POST /api/v1/orders/:id/cancel`, `POST /api/v1/inventory/:id/adjust`.

## 9.2. HTTP status code

200 OK · 201 Created · 204 No Content · 400 Bad Request · 401 Unauthorized · 403 Forbidden · 404 Not Found · 409 Conflict · 422 Unprocessable · 429 Too Many Requests · 500 Internal Error.

## 9.3. Response format

```json
{ "data": {}, "meta": null }
```

Danh sách kèm `meta` phân trang. Lỗi: `{ "error": { "code", "message", "details", "requestId" } }`.

## 9.4. Versioning — API public phải có version. Không phá response contract đang dùng.

---

# 10. Validation

Mọi dữ liệu từ bên ngoài đều không đáng tin cậy: request body, query, params, header, cookie, file upload, MQTT message, dữ liệu ESP32, webhook, response API bên thứ ba, **nội dung do AI tạo ra**.

Validation phải thực hiện tại boundary của hệ thống. Kiểm tra cả kiểu dữ liệu và nghiệp vụ.

---

# 11. Database

* **11.1. Migration:** mọi thay đổi DB MUST bằng migration. Không sửa trực tiếp production. Migration đã chạy không được sửa — tạo migration mới.
* **11.2. Transaction:** dùng khi một nghiệp vụ thay đổi nhiều dữ liệu liên quan. Thất bại 1 bước → rollback toàn bộ.
* **11.3. Index:** thêm cho FK, trường tìm kiếm/sort/unique/WHERE thường xuyên. Không thêm tùy tiện (chậm ghi).
* **11.4. Query:** không query trong vòng lặp (N+1) — lấy theo batch.
* **11.5. Soft delete:** thống nhất điều kiện `deleted_at IS NULL`.

---

# 12. Logging

Log có cấu trúc và đủ ngữ cảnh. Cấp độ: debug / info / warn / error / fatal.

Không log: password, access/refresh token, API secret, private key, OTP, thông tin thẻ, dữ liệu cá nhân nhạy cảm.

Mỗi request nên có `requestId` hoặc `correlationId`.

---

# 13. Bảo mật

* **13.1. Secret:** không hard-code. Dùng env var / secret manager. Không commit `.env`, `*.pem`, `*.key`, `credentials.json`. Cung cấp `.env.example`.
* **13.2. Password:** hash bằng thuật toán phù hợp, không mã hóa ngược, không plain text, không log, có rate limit đăng nhập.
* **13.3. Authorization:** kiểm tra quyền TRÊN TÀI NGUYÊN, không chỉ đăng nhập. Frontend ẩn nút KHÔNG phải kiểm soát quyền — quyền kiểm ở backend.
* **13.4. Upload file:** kiểm tra size, MIME, extension, tên, nội dung, quyền, nơi lưu. Không dùng tên file người dùng làm đường dẫn.
* **13.5. Dependency:** không cài package không rõ nguồn, khóa version bằng lock file, kiểm tra lỗ hổng, xóa dependency thừa.

---

# 14. Quy tắc dành cho AI

**AI output luôn được xem là dữ liệu không đáng tin cậy.**

Không cho phép AI tự động: thực thi SQL tùy ý, chạy shell command, xóa dữ liệu, gửi email, chuyển tiền, thay đổi quyền, điều khiển thiết bị nguy hiểm.

Mọi output có cấu trúc phải được validate (schema). Prompt quản lý như source code (version, mục tiêu, input/output schema, ví dụ, giới hạn, test case). Không gửi dữ liệu bí mật/cá nhân không cần thiết đến AI bên thứ ba.

---

# 15. Quy tắc dành cho ESP32 và IoT

Mọi thiết bị có mã định danh duy nhất. Payload có `deviceId`, `timestamp`, `sequence`/message ID, firmware version nếu cần, dữ liệu cảm biến, trạng thái.

Backend KHÔNG tin tuyệt đối dữ liệu cảm biến — kiểm: giá trị trong phạm vi hợp lý, timestamp không quá cũ, không trùng message, thiết bị có quyền, dữ liệu không thiếu.

Mất mạng: thiết bị lưu đệm + sequence → gửi lại khi có kết nối → backend xử lý idempotent. Không phụ thuộc thiết bị luôn online.

---

# 16. Comment và tài liệu

Comment giải thích **tại sao**, không mô tả lại code. Không để code chết (đã comment) — xóa, Git lưu lịch sử.

Public function/module quan trọng nên có tài liệu: mục đích, input, output, exception, side effect, ví dụ.

---

# 17. Frontend

* **17.1. Component:** một vai trò chính. Tách Page / Container / Presentational / Hook / API service / Schema / Store.
* **17.2. Props:** không truyền quá nhiều props qua nhiều tầng. Không truyền cả object chỉ để dùng 1 trường.
* **17.3. State:** không lưu dữ liệu suy ra được từ state khác.
* **17.4. Loading và error state:** mọi chức năng gọi API phải xử lý loading / empty / error / success / retry. Không màn hình trắng hoặc spinner vô thời hạn.

---

# 18. Testing

Loại: Unit / Integration / API / E2E. Cấu trúc Arrange–Act–Assert. Tên test mô tả hành vi (`should throw UserNotFoundError when user does not exist`).

Không test phụ thuộc thứ tự chạy. Không gọi API production trong test. Không dùng thời gian thực nếu mock được.

---

# 19. Git convention

## 19.1. Branch

```text
main · develop · feature/user-authentication · fix/order-total-calculation · hotfix/login-security · refactor/user-service · chore/update-dependencies
```

Viết thường, gạch ngang, mô tả đúng mục đích. Không dùng tên cá nhân, không `test`/`new`/`final`/`fix2`.

## 19.2. Commit message — Conventional Commits

```text
feat: add inventory alert configuration
fix: prevent duplicate sensor records
refactor: extract order pricing service
test: add tests for authentication service
docs: update API documentation
chore: upgrade dependencies
perf: reduce inventory query time
```

Commit nhỏ, độc lập, một mục tiêu. Không commit `update`/`fix`/`done`/`sua loi`/`final`.

## 19.3. Không commit code hỏng. Trước commit chạy: `lint`, `typecheck`, `test`, `build`.

---

# 20. Pull Request

Mỗi PR có: Mục tiêu · Thay đổi chính · Cách kiểm thử · Ảnh hưởng (migration / breaking change / env mới) · Checklist.

PR không quá lớn — **dưới 400 dòng thay đổi có ý nghĩa**. Không trộn feature + refactor + format toàn dự án trong cùng PR.

---

# 21. Code Review

Reviewer kiểm: đúng yêu cầu · xử lý lỗi · bảo mật · N+1 query · API contract · test · tên rõ ràng · duplicate · log nhạy cảm · đơn giản hóa được không.

Quy ước comment: **BLOCKING** (phải sửa) · **SUGGESTION** (đề xuất) · **QUESTION** (hỏi) · **NIT** (góp ý nhỏ).

Review tập trung vào code, không công kích người viết.

---

# 22. Dependency và thư viện

Trước khi thêm: dự án có thực sự cần? tự viết đơn giản được? còn maintain? license phù hợp? lỗ hổng? bundle size? hỗ trợ TypeScript? cộng đồng đủ lớn? Không thêm nhiều thư viện cùng nhiệm vụ.

---

# 23. Cấu hình môi trường

Môi trường: development / test / staging / production. Không kiểm tra env rải rác — dùng config service (`appConfig.isProduction`). Kiểm tra biến env khi khởi động (schema); thiếu biến bắt buộc → dừng ngay.

---

# 24. Hiệu năng

Không tối ưu theo cảm giác. Quy trình: Đo → xác định điểm nghẽn → tối ưu → đo lại → so sánh.

Ưu tiên kiểm: DB query, N+1, response size, upload, image size, render thừa, memory leak, vòng lặp dữ liệu lớn, request bên thứ ba, AI token usage, MQTT frequency.

Không cache nếu chưa xác định: cache key, TTL, invalidation, độ cũ cho phép, hành vi khi cache lỗi.

---

# 25. Definition of Done

Task hoàn thành khi: đúng yêu cầu · đã format · không lỗi lint/type · build thành công · test liên quan pass · có test mới cho nghiệp vụ quan trọng · không `console.log` debug · không secret · đã xử lý loading/empty/error · đã kiểm authorization · đã kiểm migration nếu đổi DB · đã cập nhật tài liệu nếu API đổi · đã tự review · PR được duyệt · đã kiểm staging nếu cần.

---

# 26. Những hành vi bị cấm

Không merge code có: `@ts-ignore` không lý do · `/* eslint-disable */` toàn bộ · `catch (error) {}` nuốt lỗi · hard-code secret · `console.log` debug · SQL nối chuỗi input chưa xử lý · `function handleData(data: any)` · delay giả `setTimeout` để chờ xử lý.

Bắt buộc bỏ qua rule phải có: comment giải thích + phạm vi nhỏ nhất + issue/kế hoạch nếu tạm thời.

```ts
// eslint-disable-next-line library-rule
// SDK hiện chưa cung cấp type cho response này.
// TODO(PROJ-215): Xóa khi SDK phiên bản 3 được nâng cấp.
```

---

# 27. Checklist trước khi tạo Pull Request

```text
[ ] Tên biến, hàm và class rõ ràng.
[ ] Hàm không xử lý quá nhiều trách nhiệm.
[ ] Không có duplicate logic rõ ràng.
[ ] Không có any không cần thiết.
[ ] Không có magic number hoặc magic string.
[ ] Input đã được validate.
[ ] Error đã được xử lý.
[ ] Không trả lỗi kỹ thuật ra client.
[ ] Authorization đã được kiểm tra.
[ ] Không ghi log dữ liệu nhạy cảm.
[ ] Không có secret trong source code.
[ ] Database query không có N+1.
[ ] Transaction được sử dụng khi cần.
[ ] API response đúng contract.
[ ] Có loading, empty và error state.
[ ] Có test cho logic quan trọng.
[ ] Lint / Typecheck / Test / Build thành công.
[ ] Đã xóa code debug.
[ ] Đã tự review toàn bộ thay đổi.
```

---

# 28. Quy tắc cuối cùng

Khi đứng trước nhiều giải pháp, ưu tiên theo thứ tự:

1. Đúng nghiệp vụ.
2. An toàn.
3. Dễ hiểu.
4. Dễ kiểm thử.
5. Dễ bảo trì.
6. Dễ mở rộng.
7. Hiệu năng.
8. Viết ít dòng code.

> Code ngắn hơn không đồng nghĩa với code tốt hơn. Một đoạn code tốt phải giúp thành viên khác đọc, hiểu, sửa và kiểm thử mà không cần hỏi người viết ban đầu.
