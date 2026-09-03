# Bàn giao vận hành — đọc trước khi chạm vào máy demo

Cập nhật 2026-08-03. Viết cho người (hoặc AI) tiếp quản: **những cái bẫy đã tốn
nhiều giờ để tìm ra**, cùng cách chạy đúng. Không lặp lại nội dung PRD.

---

## 1. Bốn dịch vụ chạy bằng Windows Scheduled Task

```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -like 'UngPhoNhanh*' }
# UngPhoNhanh-Backend · Frontend · AiService · EdgeProxy
```

Khởi động lại **luôn dùng Stop/Start-ScheduledTask**, đừng kill PID — task có tiến
trình giám sát, giết PID là nó tự bật lại bản cũ.

```powershell
Stop-ScheduledTask -TaskName UngPhoNhanh-Backend
Start-Sleep -Seconds 4
Start-ScheduledTask -TaskName UngPhoNhanh-Backend
```

**Phải build TRƯỚC khi restart.** Backend chạy `dist/src/main.js`, frontend chạy
bản `.next` đã build. Sửa mã mà không build thì restart xong vẫn là mã cũ.

| Dịch vụ | Cổng | Lệnh build trước khi restart |
|---|---|---|
| Backend | 3100 | `pnpm --filter @safestock/backend exec nest build` |
| Frontend | 3200 | `pnpm --filter @safestock/frontend exec next build` |
| AI service | 8000 | không cần (Python) |
| Ollama | 11434 | không phải task, chạy nền riêng |

PostgreSQL và Redis chạy trong **Docker**. Redis cổng **16379** — không dùng 56380,
cổng đó nằm trong dải Windows giữ trước, backend sẽ treo lúc khởi động.

---

## 2. Chuẩn bị trước mỗi lượt diễn tập

**Bấm `CHUAN BI DEMO.bat` ngoài Desktop.** Một lần bấm lo hết tám mảnh phải cùng
sống thì demo mới chạy, rồi in bảng trạng thái:

```
[  OK  ] Docker Desktop
[  OK  ] PostgreSQL (cổng 15432)
[  OK  ] Redis (cổng 16379)
[  OK  ] OSRM (cổng 5000)
[  OK  ] Ollama giữ model trong VRAM     qwen3.5:4b, nomic-embed-text
[  OK  ] Backend (3100)                  đang chạy sẵn
[  OK  ] Frontend (3200)                 đang chạy sẵn
[  OK  ] AI service (8000)               đang chạy sẵn
[  OK  ] Edge proxy (Caddy)
[  OK  ] Nhận dạng giọng nói             2 giây
[  OK  ] Bóc tách tình huống (/parse)    4.7 giây
```

Chạy lại bao nhiêu lần cũng được: mảnh nào đang tốt thì bỏ qua, không đụng tới.
Mã nguồn ở `infrastructure/windows/chuan-bi-demo.ps1`.

**Việc nó làm mà kiểm tay hay bỏ sót:**

- **Bật container Docker.** Postgres và Redis **không tự lên lại sau khi tắt máy**.
  Sáng ra mở lên thì frontend vẫn xanh còn backend chết một mình — nhìn vào tưởng
  app hỏng. Đây là nguyên nhân số một.
- **Bật OSRM.** Thiếu nó vẫn demo được, nhưng quãng đường tính theo đường chim bay
  — mất đúng câu "tuyến tính bằng bản đồ đường thật" khi trình bày. Script báo rõ
  chứ không im lặng đổi cách tính.
- **Hâm nóng hai đường AI bằng lệnh gọi thật**, không chỉ hỏi trạng thái: gửi một
  giây tiếng vào `/transcribe` và một câu vào `/parse`. Trả lời được nghĩa là lát
  nữa bấm micro sẽ ra chữ.
- **Cảnh báo mã nguồn mới hơn bản đã dựng.** Sửa mã mà quên dựng thì restart xong
  vẫn chạy mã cũ, im lặng và rất khó ngờ. Script chỉ cảnh báo, **không tự dựng**:
  dựng mất vài phút và có thể hỏng giữa chừng, không phải việc nên làm ngay trước
  giờ trình bày.
- **Hỏi trước khi xoá dữ liệu.** Bấm nhầm giữa buổi demo là mất sạch, nên bước này
  luôn dừng lại chờ xác nhận.

Chạy tay từng phần khi cần:

```powershell
# Bỏ qua bước xoá, không hỏi
& "D:\Mikitech Project\Kho\infrastructure\windows\chuan-bi-demo.ps1" -KhongXoaDuLieu

# Xoá nhiệm vụ, sự cố, số liệu cảm biến, thông báo, thư cảnh báo.
# GIỮ kho, thiết bị IoT, tồn kho, toạ độ thôn, tài khoản. Hoàn cả vật tư đã xuất.
pnpm --filter @safestock/backend exec ts-node prisma/reset-demo-data.ts

# Ghi kiểm kê toàn kho → 6 tiêu chí sẵn sàng lên xanh (99/100)
pnpm --filter @safestock/backend exec ts-node prisma/record-stocktake.ts
```

**Kiểm sức khoẻ backend phải gọi `/api/health`**, không phải `/health` — đường sau
trả về trang giới thiệu tĩnh, luôn 200 kể cả khi cơ sở dữ liệu đã chết.

**Đừng dùng `pnpm be:db`** để dọn dẹp: lệnh đó dựng lại toàn bộ cơ sở dữ liệu,
cuốn theo toạ độ 17 thôn ghim tay, tài khoản đã đổi tên, và tài khoản `iot@`.

Script khác khi cần: `create-iot-account.ts` (tạo lại tài khoản app IoT),
`sync-hamlet-pins.ts` (đồng bộ toạ độ thôn sau khi ghim thêm trên `/map`).

---

## 3. Tài khoản — MỘT tài khoản một thiết bị

| Nơi làm việc | Thiết bị | Tài khoản | Mật khẩu |
|---|---|---|---|
| Quản trị xã | Máy tính, web | `admin` | `admin123@` |
| Kho trung tâm | Máy tính, web | `staff` | `staff123` |
| Kho trung tâm | Máy tính, app IoT | `iot` | `iot123456` |
| Kho thôn (17 kho) | Điện thoại | `<tênthôn>` | `truongthon123` |
| Lực lượng hiện trường | Điện thoại | `rescue` | `rescue123` |

**Vì sao một tài khoản một thiết bị:** `login()` VÀ `refresh()` đều tăng
`user.tokenVersion`, mà đó là một số duy nhất cho mỗi tài khoản chứ không phải cho
mỗi thiết bị. Đăng nhập lại ở nơi thứ hai là khoá phiên của nơi thứ nhất chết ngay.
Access token sống 15 phút nên máy kia còn chạy một lúc rồi mới rớt — rất khó đoán.

Đó là lý do app IoT có tài khoản riêng: nó là một **thiết bị**, không phải người
vận hành đang ngồi ở web.

IoT chỉ có ở **kho trung tâm** (PRD §945). Kho thôn không có cảm biến, vận hành
bằng điện thoại.

---

## 4. App IoT trên desktop

File `App IoT - Simulator.bat` ngoài Desktop. Nếu phải chạy tay:

```powershell
$env:ELECTRON_RUN_AS_NODE = ""   # BẮT BUỘC
pnpm desktop:dev
```

**`ELECTRON_RUN_AS_NODE`**: VS Code và vài trình khác đặt biến này = 1. Electron
thấy nó thì không bật cửa sổ nào cả, chạy như Node rồi thoát — app "không lên" mà
không báo lỗi gì.

**App chỉ gửi thanh trượt ĐÃ CHỈNH.** Thanh nằm ở giá trị mặc định chưa từng được
gửi, nên web hiện `--`. Kéo rồi bấm **Xác nhận và gửi** (thanh dính đáy, viền đỏ
khi còn thông số chưa gửi).

**Luật nghi cháy cần CẢ HAI**: khói > 30 ppm **và** nhiệt độ tăng ≥ 15 °C so với
mốc nhiệt đầu tiên trong cửa sổ quét. Kéo mỗi khói thì không có gì xảy ra — đúng
thiết kế, chống báo động giả. Cách kích: gửi nhiệt độ nền 28 °C trước, rồi gửi
khói 44 ppm + nhiệt độ 48 °C → sự cố CRITICAL + email.

---

## 5. App điện thoại — bốn cái bẫy

App đã cài sẵn trên hai máy: điện thoại thật `R7AY90BXD3E` (vai kho thôn — có camera
thật để quét QR) và máy ảo `S23_API_36` (vai hiện trường). Máy ảo **không quét được
QR thật** vì camera sau là `virtualscene`; muốn quét thì đổi `hw.camera.back` thành
`webcam0` trong `~/.android/avd/S23_API_36.avd/config.ini` rồi mở lại máy ảo.

Máy ảo mở ở màn hình khác không thấy: bấm `Keo dien thoai ao ve man hinh nay.bat`
ngoài Desktop.

Backend phải mở ra LAN trước:

```
.env:  BIND_ADDRESS=0.0.0.0
       CORS_ALLOWED_ORIGINS=...,http://<IP-LAN>:3200,http://<IP-LAN>:8081
```
kèm rule tường lửa cho cổng 3100 và 8081 (mạng Private).

Điện thoại dùng **IP LAN**, không dùng `ungphonhanh.life` — tên miền đó trả **403**
(Cloudflare), không trỏ về máy này.

### Lệnh dựng đúng

```powershell
cd "…\apps\mobile\android"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"   # JDK 17 có sẵn
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat app:assembleDebug -x lint -x test `
  "-PreactNativeArchitectures=arm64-v8a,x86_64" `
  "-PreactNativeDevServerPort=8082"
```

Ba tham số, mỗi cái sửa một lỗi thật:

1. **`x86_64`** — máy ảo Android là x86_64. `expo run:android` chỉ dựng arm64 theo
   điện thoại thật đang cắm, cài lên máy ảo là chết ngay:
   `SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`.

2. **`DevServerPort=8082`** — Docker giữ cổng 8081 (đừng tắt Docker, cơ sở dữ liệu
   nằm trong đó) nên Metro chạy ở 8082.

   **Bắc cầu cho CẢ HAI máy, kể cả máy ảo.** Trước đây tưởng máy ảo tự hỏi
   `10.0.2.2` là xong, nhưng thử lại sau một lần khởi động lại máy tính thì không:
   app mở ra **màn hình trắng**, Metro không nhận thêm lượt đóng gói nào, logcat
   không có lấy một dòng lỗi. Không có gì để dò cả — chỉ trắng. Cắm `adb reverse`
   vào là chữ hiện ra ngay.

   ```powershell
   foreach ($m in @("<ma-may-that>", "emulator-5554")) {
     adb -s $m reverse tcp:8081 tcp:8082
     adb -s $m reverse tcp:8082 tcp:8082
   }
   ```

   Bắc cả 8081 lẫn 8082 vì không chắc bản APK đang cắm hỏi cổng nào; thừa một cầu
   thì vô hại, thiếu thì ra *"Unable to load script"*. `adb reverse` đi qua kênh USB
   chứ không qua mạng, nên nó cũng miễn nhiễm với tường lửa — đó là lý do nó ăn
   trong khi đường `10.0.2.2` lại im lặng.

3. **`-x lint`** — chỉ để nhanh.

Chạy Metro:
```powershell
$env:EXPO_PUBLIC_API_BASE_URL = "http://<IP-LAN>:3100"
npx expo start --dev-client --port 8082 --host lan
```
Biến `EXPO_PUBLIC_API_BASE_URL` được nhúng **lúc đóng gói JS**, nên phải đặt khi
chạy Metro (bản debug) hoặc khi build release.

### Hai lỗi đã sửa trong mã, đừng sửa lại

- **`app/src/debug/res/xml/network_security_config.xml`** — bản debug cần file
  riêng cho phép HTTP. Manifest debug khai `usesCleartextTraffic="true"` nhưng khi
  có `android:networkSecurityConfig` thì **cấu hình mạng đè lên cờ đó**; kết quả là
  app bị chặn ngay trong tiến trình, không có dấu vết trong log mạng, chỉ ném ra
  *"Network request failed"*. Bản phát hành giữ nguyên chính sách chỉ-HTTPS.

- **`metro.config.js` → `resolver.resolveRequest`** — pnpm dựng node_modules bằng
  liên kết tượng trưng nên Metro nạp React **hai lần** qua hai đường dẫn khác nhau.
  Bản thứ hai có dispatcher rỗng → mọi hook trong thư viện đều ngã:
  *Invalid hook call … Cannot read property 'useRef' of null* (thấy ở `QrScanner`
  → `expo-modules-core/PermissionsHook`). Phải chặn ở `resolveRequest`;
  `extraNodeModules` KHÔNG có tác dụng vì nó chỉ là phương án dự phòng khi không
  phân giải được, mà ở đây phân giải vẫn chạy — chỉ ra nhầm bản.

### Bản phát hành

`pnpm --filter @safestock/mobile android:release`, nhưng Gradle hay coi gói JS là
"đã cũ" và không dựng lại. Muốn chắc, xoá trước:
`app/build/generated/assets/createBundleReleaseJsAndAssets` và
`app/build/outputs/apk/release`.

---

## 6. AI cục bộ

Ollama giữ `qwen3.5:4b` + `nomic-embed-text` thường trú trong VRAM. Kiểm tra:

```powershell
curl http://localhost:11434/api/ps    # expires_at phải là năm 2318 (keep_alive = -1)
```

`OLLAMA_KEEP_ALIVE` **phải là số nguyên** `-1`. Truyền chuỗi `"-1"` thì Ollama trả
400 cho mọi lời gọi. File `AI - Nong Nguoi.bat` ngoài Desktop có START/END/STATUS.

### Nhận dạng giọng nói (PhoWhisper)

Phần tuỳ chọn, đã cài trên máy này:
```
torch 2.13.0+cu126    ← kênh cu121 KHÔNG có bản cho Python 3.13
transformers 5.14.1
model vinai/PhoWhisper-medium  (~2.9 GB trong ~/.cache/huggingface)
```
Lần gọi đầu sau khi xoá cache sẽ tải model và **vượt quá 180 giây** timeout của
backend. Tải riêng cho xong rồi hãy gọi qua API.

**Đã tự hâm nóng, không phải làm gì.** Service nạp sẵn model ở luồng nền ngay khi
khởi động (mất ~60 giây, chạy song song nên không chặn gì). Trước đây lần bấm micro
đầu tiên phải tự trả giá đó — đo được **124 giây** — quá thời gian chờ của backend,
nên người dùng nhận "Nhận dạng giọng nói chưa sẵn sàng" và tưởng tính năng hỏng.
Tắt bằng `PHOWHISPER_WARM=false` nếu cần nhường VRAM cho việc khác.

**Cỡ model: chuyện VRAM, không phải chuyện tốc độ.** Mặc định là
`PhoWhisper-small`, đổi ở `PHOWHISPER_MODEL` trong `.env`. Lý do đổi khỏi `medium`:

| Model | VRAM | Cùng một clip 14.5 giây |
|---|---|---|
| `medium` | 1458 MiB | 6.7 – **59.8 s**, thất thường |
| `small` | 478 MiB | 4.7 – 5.1 s, ổn định |

RTX 2060 chỉ có 6 GB mà Ollama đã giữ ~4 GB. Thêm `medium` là còn chưa tới 500 MB,
CUDA bắt đầu giành giật — con số 59.8 giây là dấu hiệu hết chỗ, không phải mô hình
tính chậm (chính nó chạy 5.0 giây khi GPU trống). `small` còn dư ~1.9 GB.

Đây là đánh đổi **độ chính xác lấy độ ổn định**. Cả hai bản đã nằm trong cache nên
đổi qua đổi lại chỉ tốn một lần restart — hãy tự đọc thử bằng giọng mình rồi chọn.

Bốn lỗi đã sửa trong `apps/ai-service/transcribe.py` — **đừng gỡ ra**:

1. **`generate_kwargs={"language": "vi", "task": "transcribe"}`.** Không ép thì
   Whisper TỰ ĐOÁN ngôn ngữ từ vài giây đầu; đoán nhầm là nó dịch hoặc bịa ra một
   câu tiếng khác nghe rất xuôi tai. Đây là nguyên nhân "nhận diện sai hoàn toàn".
2. **`chunk_length_s=30` + `stride_length_s=(5, 5)`.** Whisper chỉ nhìn cửa sổ 30
   giây; không khai thì clip dài hơn bị **cắt âm thầm**, nói một phút mất hai phần
   ba mà không báo gì. Stride cho khối chồng lấn, không nuốt từ ở chỗ nối.
3. **Chốt im lặng (`_SILENCE_RMS = 0.0015`).** Whisper BỊA khi nghe im lặng — đưa
   vào hai giây im lặng nó trả về một câu hoàn chỉnh. Ngưỡng đặt thấp có chủ đích:
   micro máy ảo và micro điện thoại rẻ thu rất nhỏ, đặt cao là chặn nhầm giọng thật
   rồi báo "chưa nghe rõ" trong khi người ta có nói.
4. **Bọc phản hồi trong `{ text }`** ở `mission.controller.ts`. Trả chuỗi trần thì
   Nest serialize thành `text/html`, client gọi `res.json()` là hỏng, và vì chúng
   bắt lỗi chung nên hiện ra "Nhận dạng giọng nói chưa sẵn sàng" — thông báo hoàn
   toàn lạc hướng.

**Dò lỗi voice bằng log, đừng đoán.** Mỗi lượt nhận dạng ghi hai dòng vào
`%ProgramData%\UngPhoNhanh\logs\ai-service.log`:
```
[transcribe] Nhan dang: 4.2s, rms=0.00003, nguong=0.00150   ← micro không thu được gì
[transcribe] Nhan dang: 4.2s, rms=0.04210, nguong=0.00150   ← có tiếng, mô hình không nhận ra
[transcribe] Nhan dang xong sau 4.85s (x1.15 thoi luong)    ← chậm ở model hay ở chỗ khác
```
Hai nguyên nhân đầu khác hẳn nhau mà cùng ra một thông báo "chưa nghe rõ nội dung".

File log ghi bằng **UTF-16**, `Get-Content` thường đọc ra chữ cách quãng. Đọc thế này:
```powershell
$b = [IO.File]::ReadAllBytes("$env:ProgramData\UngPhoNhanh\logs\ai-service.log")
([Text.Encoding]::Unicode.GetString($b) -split "`r?`n") |
  Select-String "\[transcribe\]" | Select-Object -Last 10
```

Các dòng này in bằng `print`, **không dùng `logging`**: dưới uvicorn, logger của
module không được cấu hình nên mọi dòng mức INFO bị nuốt sạch — đã kiểm cả file log
lịch sử, không có một dòng nào lọt ra. Viết chẩn đoán bằng `logging` là viết vào hư
vô đúng lúc cần nhất.

**Không làm realtime.** PhoWhisper là encoder-decoder, phải nghe hết một khối mới
sinh chữ — không có cách nào ép nó ra chữ từng từ. Muốn gần-realtime thì phải gửi
từng khối 3–4 giây rồi nối chữ dần (trễ 4–5 giây); muốn realtime thật thì phải đổi
sang mô hình CTC như wav2vec2, đánh đổi độ chính xác. Đã cân nhắc và **quyết định
không làm** — giữ độ chính xác quan trọng hơn.

Thời gian đo trên máy này (RTX 2060): `/parse` 6.6–7.2 s · `/situation-analysis`
~20 s · `/action-plan` ~40 s · `/transcribe` ~3.9 s cho clip 5 giây, ~5.0 s cho clip
15 giây (đã hâm nóng, bản `small`). Whisper luôn đệm đầu vào cho đủ 30 giây nên clip
ngắn không rẻ hơn bao nhiêu — đó là sàn, không phải lỗi.

**Gõ tiếng Việt CÓ DẤU.** "Sat lo dat" bị nhận thành *lũ lụt*; "Sạt lở đất" mới ra
*sạt lở*. Đây là giới hạn của mô hình 4B, không sửa được bằng mã.

---

## 7. Quy tắc bất di bất dịch của dự án

1. **Giao diện 100% tiếng Việt có dấu.** Không để lọt mã hằng (`FLOOD`,
   `AFFECTED_PEOPLE`), tên khoá kỹ thuật, hay JSON thô ra màn hình. Có
   `INCIDENT_TYPE_LABELS` trong `packages/shared-types` dùng chung hai đầu.
2. **AI chỉ bóc tách dữ kiện có trích dẫn.** Nhu cầu vật tư, phân bổ kho, tuyến
   đường, dự báo mưa đều do rule backend tính. Đừng chuyển việc tính toán sang LLM.
3. **Không bịa số.** `parse_grounding.py` neo mọi con số vào chính câu người dùng
   nói. Mọi dữ kiện phải có `source.excerpt` trỏ về nguồn thật.
4. **Có đường lui khi AI chết.** Mọi luồng AI đều có nhánh rule/template dự phòng,
   và nhánh đó phải chạy được cả khi cơ sở dữ liệu hỏng (xem `answerEmergency`).
5. **Chạy `/checks` trước khi commit.** 614 test backend, 116 test ai-service, lint
   và build phải sạch cả bốn app.

---

## 8. Khi có gì đó "không chạy" — thứ tự dò

1. Dịch vụ có sống không: `/api/health` (3100), `:3200`, `:8000/health`, `/api/ps`.
2. Có build lại trước khi restart task không.
3. Nếu là điện thoại: đúng IP LAN chưa, `adb reverse` còn không, Metro còn sống không.
4. Nếu là app IoT: có bấm **Xác nhận và gửi** chưa (kéo thanh trượt thôi là chưa gửi).
5. Đọc log thật thay vì đoán:
   - Backend: `%ProgramData%\UngPhoNhanh\logs\backend.log`
   - AI: `%ProgramData%\UngPhoNhanh\logs\ai-service.log`
   - Điện thoại: `adb -s <device> logcat -d --pid=$(adb shell pidof vn.ungphonhanh.safestock)`
   - Cơ sở dữ liệu: viết script `ts-node` một lần rồi xoá, đừng đoán trạng thái.

Một bài học lặp lại nhiều lần trong dự án này: **thông báo lỗi hay chỉ sai hướng.**
"Nhận dạng giọng nói chưa sẵn sàng" hoá ra là phản hồi sai định dạng JSON.
"Network request failed" hoá ra là chính sách cleartext của Android. Luôn tìm cho
ra bằng chứng thật trước khi sửa.

---

## 9. Việc đang làm dở — hai quyết định đã chốt

Ghi lại ở đây vì hai thứ này **chưa có trong mã**, mà lại quyết định cách viết mã.

### Mượn — trả vật tư giữa các xã

Điều kiện: cả hai xã đều dùng app.

Khi xã A cho xã B mượn:

- **Trừ tồn kho xã A**, **cộng tồn kho xã B** ngay tại thời điểm cho mượn. Hai cơ
  sở dữ liệu độc lập, không xã nào đọc vào kho của xã kia.
- **Ghi một bản theo dõi khoản mượn** ở cả hai phía: mượn của ai, bao nhiêu, hạn
  trả, tình trạng. Đây là thứ phân biệt hàng đi mượn với hàng sở hữu — không có
  nó thì tồn kho lẫn lộn và không ai biết còn nợ gì.
- Cứu hộ xong, **xã B tự xuất đúng số lượng đó từ kho của mình** rồi đem trả; bản
  theo dõi chuyển sang đã trả.

Nói cách khác: **số lượng đi theo kho, trách nhiệm đi theo bản ghi mượn.** Đừng
làm ngược lại — để hàng mượn nằm ngoài tồn kho thì trưởng thôn nhìn màn hình
không thấy hàng mình đang giữ trong tay.

### Trợ lý trả lời theo dòng chữ

Làm **stream thật**, xuyên cả ba tầng: Ollama → AI service (`StreamingResponse`) →
backend (SSE) → web (`EventSource`). Không dùng cách giả lập nhận đủ rồi nhả dần —
cách đó không rút ngắn được thời gian chờ thật, chỉ che nó đi.

Hệ quả phải tính trước: lớp kiểm JSON hiện tại của trợ lý không dùng được trên
dòng chữ đang chảy, nên riêng đường trợ lý phải đổi sang kiểm sau khi nhận xong.

### Ba quyết định giao diện đã chốt

- **Tách tab.** *Điều phối cứu hộ* chỉ còn form khai tình huống mới và bản đồ ghim
  điểm nạn. *Nhiệm vụ* là tab riêng, chứa hộp nhiệm vụ, bộ lọc trạng thái và là
  lối vào trang chi tiết.
- **Thông báo toạt ở góc phải trên**, tự tắt sau vài giây, bấm thì nhảy tới đúng
  chỗ. Riêng sự cố nghiêm trọng thì ở lại cho tới khi có người bấm.
- **Thứ tự làm:** nhóm nhanh (chữ nghĩa, badge tab, QR thôn, tách tab) → mượn trả
  liên xã → trợ lý trả lời theo dòng → hoàn thiện luồng mượn trả và ghi chú
  thiếu/nhận.

