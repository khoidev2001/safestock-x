# Dựng toàn bộ máy demo về trạng thái sẵn sàng, bằng một lần bấm.
#
# Vì sao cần script này: hệ thống có tám mảnh rời phải cùng sống thì demo mới chạy
# — Docker, Postgres, Redis, OSRM, Ollama, và bốn dịch vụ Windows. Container Docker
# KHÔNG tự lên lại sau khi tắt máy, nên sáng ra mở lên là backend chết trong khi
# frontend vẫn xanh; nhìn vào thì tưởng app hỏng. Kiểm tay từng mảnh thì lâu, và
# đúng lúc sắp trình bày là lúc dễ quên nhất.
#
# Nguyên tắc:
#   - Chạy lại bao nhiêu lần cũng được. Mảnh nào đang tốt thì bỏ qua, không đụng.
#   - Bước xoá dữ liệu PHẢI hỏi trước. Bấm nhầm giữa buổi demo là mất sạch.
#   - Kết thúc bằng bảng trạng thái, không phải bằng im lặng.
#
# Tham số:
#   -KhongXoaDuLieu     bỏ qua bước dọn dữ liệu thử nghiệm, không hỏi
#   -KhongMoTrinhDuyet  không tự mở hai cửa sổ trình duyệt
param(
  [switch]$KhongXoaDuLieu,
  [switch]$KhongMoTrinhDuyet
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$GocDuAn = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TongSoBuoc = 8
$BuocHienTai = 0
$KetQua = [ordered]@{}
$CanhBao = New-Object System.Collections.ArrayList

function Viet-TieuDe {
  param([string]$Chu)
  $script:BuocHienTai++
  Write-Host ""
  Write-Host ("  [{0}/{1}]  {2}" -f $script:BuocHienTai, $TongSoBuoc, $Chu) -ForegroundColor Cyan
  Write-Host ("  " + ("-" * 66)) -ForegroundColor DarkGray
}

function Viet-Dong {
  param([string]$Chu, [string]$Mau = "Gray")
  Write-Host ("     " + $Chu) -ForegroundColor $Mau
}

function Ghi-KetQua {
  param([string]$Ten, [bool]$Dat, [string]$ChiTiet = "")
  $script:KetQua[$Ten] = @{ Dat = $Dat; ChiTiet = $ChiTiet }
  if ($Dat) { Viet-Dong ("OK   " + $Ten + $(if ($ChiTiet) { "  ($ChiTiet)" })) "Green" }
  else { Viet-Dong ("HONG " + $Ten + $(if ($ChiTiet) { "  ($ChiTiet)" })) "Red" }
}

function Them-CanhBao {
  param([string]$Chu)
  [void]$script:CanhBao.Add($Chu)
}

# Gọi HTTP và chỉ quan tâm "có trả lời không", không quan tâm mã lỗi: 401/404 vẫn
# nghĩa là dịch vụ sống, chỉ có không nối được mới là chết.
function Test-DichVu {
  param([string]$Url, [int]$GiayCho = 5)
  try {
    Invoke-WebRequest -Uri $Url -TimeoutSec $GiayCho -UseBasicParsing -ErrorAction Stop | Out-Null
    return $true
  } catch {
    return $null -ne $_.Exception.Response
  }
}

function Cho-DichVu {
  param([string]$Url, [int]$GiayToiDa = 90, [string]$Ten = "dịch vụ")
  $het = (Get-Date).AddSeconds($GiayToiDa)
  while ((Get-Date) -lt $het) {
    if (Test-DichVu $Url) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Yellow
Write-Host "     CHUẨN BỊ MÁY DEMO  —  ỨNG PHÓ NHANH" -ForegroundColor Yellow
Write-Host "  ================================================================" -ForegroundColor Yellow
Write-Host ("     Thư mục dự án: " + $GocDuAn) -ForegroundColor DarkGray

# ---------------------------------------------------------------- 1. Docker
Viet-TieuDe "Docker Desktop"

docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Viet-Dong "Docker chưa chạy, đang bật..." "Yellow"
  $duongDan = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path -LiteralPath $duongDan) {
    Start-Process -FilePath $duongDan | Out-Null
    # Docker Desktop mất khá lâu mới nhận lệnh; chờ tới 3 phút rồi mới chịu thua.
    $het = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $het) {
      Start-Sleep -Seconds 5
      docker info 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) { break }
    }
  }
}

docker info 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Ghi-KetQua "Docker Desktop" $true
} else {
  Ghi-KetQua "Docker Desktop" $false "hãy bật tay rồi chạy lại"
  Write-Host ""
  Write-Host "  Không có Docker thì cơ sở dữ liệu không lên được. Dừng ở đây." -ForegroundColor Red
  Read-Host "  Nhấn Enter để đóng"
  exit 1
}

# ------------------------------------------------ 2. Cơ sở dữ liệu và Redis
Viet-TieuDe "Cơ sở dữ liệu và Redis"

Push-Location $GocDuAn
try {
  # Container KHÔNG tự lên lại sau khi tắt máy — đây là lý do backend hay chết một
  # mình trong khi frontend vẫn xanh, và là nguyên nhân số một của "app hỏng".
  Viet-Dong "Đang bật container..." "DarkGray"
  & pnpm infra:up 2>&1 | Out-String | Out-Null

  $pgOk = $false
  $het = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $het) {
    docker exec safestock_postgres pg_isready -U safestock 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $pgOk = $true; break }
    Start-Sleep -Seconds 3
  }
  Ghi-KetQua "PostgreSQL (cổng 15432)" $pgOk

  docker exec safestock_redis redis-cli ping 2>&1 | Out-Null
  $redisOk = $LASTEXITCODE -eq 0
  # Cổng 16379 chứ không phải 56380: dải kia nằm trong vùng Windows giữ trước,
  # backend sẽ treo lúc khởi động mà không báo gì.
  Ghi-KetQua "Redis (cổng 16379)" $redisOk
} finally {
  Pop-Location
}

# --------------------------------------------------- 3. Bản đồ đường đi OSRM
Viet-TieuDe "Bản đồ đường đi (OSRM)"

Push-Location $GocDuAn
try {
  if (-not (Test-DichVu "http://localhost:5000/route/v1/driving/106.7,10.8;106.71,10.81" 5)) {
    Viet-Dong "Đang bật OSRM..." "DarkGray"
    & pnpm osrm:up 2>&1 | Out-String | Out-Null
    Start-Sleep -Seconds 5
  }
  $osrmOk = Cho-DichVu "http://localhost:5000/route/v1/driving/106.7,10.8;106.71,10.81" 60 "OSRM"
  if ($osrmOk) {
    Ghi-KetQua "OSRM (cổng 5000)" $true
  } else {
    # Thiếu OSRM thì vẫn demo được, chỉ là quãng đường tính theo đường chim bay —
    # mất đúng cái điểm "tuyến tính bằng bản đồ đường thật" khi trình bày.
    Ghi-KetQua "OSRM (cổng 5000)" $false "quãng đường sẽ là đường chim bay"
    Them-CanhBao "OSRM không lên. Vẫn demo được nhưng quãng đường và thời gian tới điểm nạn tính theo đường chim bay, không phải đường thật. Xem lại bằng: pnpm osrm:status"
  }
} finally {
  Pop-Location
}

# ---------------------------------------------------- 4. Mô hình AI cục bộ
Viet-TieuDe "Mô hình AI cục bộ (Ollama)"

if (Test-DichVu "http://localhost:11434/api/version" 5) {
  try {
    $ps = Invoke-RestMethod "http://localhost:11434/api/ps" -TimeoutSec 10
    $dangCo = @($ps.models | ForEach-Object { $_.name })
    if ($dangCo.Count -eq 0) {
      Viet-Dong "VRAM đang trống, đang nạp model (có thể mất 30 giây)..." "Yellow"
      # keep_alive PHẢI là số nguyên -1. Truyền chuỗi "-1" thì Ollama trả 400 cho
      # mọi lời gọi sau đó, mà thông báo lỗi không hề nhắc tới keep_alive.
      Invoke-RestMethod "http://localhost:11434/api/generate" -Method Post -TimeoutSec 300 `
        -ContentType "application/json" `
        -Body '{"model":"qwen3.5:4b","keep_alive":-1,"options":{"num_predict":0}}' | Out-Null
      Invoke-RestMethod "http://localhost:11434/api/embed" -Method Post -TimeoutSec 300 `
        -ContentType "application/json" `
        -Body '{"model":"nomic-embed-text","input":"khoi dong","keep_alive":-1}' | Out-Null
      $ps = Invoke-RestMethod "http://localhost:11434/api/ps" -TimeoutSec 10
      $dangCo = @($ps.models | ForEach-Object { $_.name })
    }
    Ghi-KetQua "Ollama giữ model trong VRAM" ($dangCo.Count -gt 0) ($dangCo -join ", ")

    # Card 6 GB mà Ollama đã giữ ~4 GB. Mọi thứ khác dùng GPU — máy ảo Android,
    # trình duyệt, app Electron — đều ăn vào phần còn lại. Xuống dưới ~400 MB là
    # Ollama không đủ chỗ cho bộ nhớ đệm sinh văn bản: một câu bình thường mất 8
    # giây bỗng chạy quá 90 giây rồi bị cắt, và nút "Phân tích bằng AI" báo lỗi.
    # Trông hệt như AI hỏng, nên phải nói ra TRƯỚC khi trình bày.
    $tronghoc = nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>$null
    if ($tronghoc) {
      $mb = [int]($tronghoc | Select-Object -First 1)
      if ($mb -lt 400) {
        Ghi-KetQua "VRAM còn trống" $false "$mb MB — quá ít, AI sẽ quá hạn"
        Them-CanhBao "VRAM chỉ còn $mb MB. Đóng máy ảo Android, bớt thẻ trình duyệt hoặc tắt app IoT khi không dùng; nếu không, các nút AI sẽ báo 'Mô hình AI đang bận'."
      } else {
        Ghi-KetQua "VRAM còn trống" $true "$mb MB"
      }
    }
  } catch {
    Ghi-KetQua "Ollama giữ model trong VRAM" $false $_.Exception.Message
  }
} else {
  Ghi-KetQua "Ollama (cổng 11434)" $false "chưa chạy"
  Them-CanhBao "Ollama chưa chạy. Không có nó thì mọi nút AI đều hỏng. Mở Ollama rồi chạy lại script này."
}

# ------------------------------------------------ 5. Bốn dịch vụ của ứng dụng
Viet-TieuDe "Bốn dịch vụ của ứng dụng"

$dichVu = @(
  # Phai la /api/health. Duong /health tra ve trang gioi thieu tinh, luon 200 ke ca
  # khi co so du lieu chet — kiem the la kiem nham, va nham theo huong nguy hiem nhat.
  @{ Ten = "Backend"; Task = "UngPhoNhanh-Backend"; Url = "http://localhost:3100/api/health"; Nhan = "Backend (3100)" },
  @{ Ten = "Frontend"; Task = "UngPhoNhanh-Frontend"; Url = "http://localhost:3200"; Nhan = "Frontend (3200)" },
  @{ Ten = "AI"; Task = "UngPhoNhanh-AiService"; Url = "http://localhost:8000/health"; Nhan = "AI service (8000)" }
)

foreach ($dv in $dichVu) {
  if (Test-DichVu $dv.Url 5) {
    Ghi-KetQua $dv.Nhan $true "đang chạy sẵn"
    continue
  }
  Viet-Dong ("Đang khởi động lại " + $dv.Ten + "...") "Yellow"
  # Dùng Stop/Start-ScheduledTask chứ đừng giết PID: task có tiến trình giám sát,
  # giết PID là nó lặng lẽ bật lại đúng bản cũ.
  Stop-ScheduledTask -TaskName $dv.Task -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  Start-ScheduledTask -TaskName $dv.Task -ErrorAction SilentlyContinue
  $len = Cho-DichVu $dv.Url 120 $dv.Ten
  Ghi-KetQua $dv.Nhan $len $(if (-not $len) { "xem log ở %ProgramData%\UngPhoNhanh\logs" })
}

$edge = Get-ScheduledTask -TaskName "UngPhoNhanh-EdgeProxy" -ErrorAction SilentlyContinue
if ($edge -and $edge.State -ne "Running") {
  Start-ScheduledTask -TaskName "UngPhoNhanh-EdgeProxy" -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $edge = Get-ScheduledTask -TaskName "UngPhoNhanh-EdgeProxy" -ErrorAction SilentlyContinue
}
Ghi-KetQua "Edge proxy (Caddy)" ($null -ne $edge -and $edge.State -eq "Running")

# Mã nguồn mới hơn bản đã dựng thì restart cũng vẫn chạy mã cũ — im lặng và rất
# khó ngờ. Chỉ cảnh báo, không tự dựng lại: dựng mất vài phút và có thể hỏng giữa
# chừng, không phải việc nên làm ngay trước giờ trình bày.
function Test-BanDungCu {
  param([string]$ThuMucNguon, [string]$ThuMucDung, [string]$Ten)
  if (-not (Test-Path -LiteralPath $ThuMucDung)) {
    Them-CanhBao "$Ten chưa được dựng lần nào. Chạy lệnh dựng trước khi demo."
    return
  }
  $nguon = Get-ChildItem -LiteralPath $ThuMucNguon -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $dung = Get-ChildItem -LiteralPath $ThuMucDung -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($nguon -and $dung -and $nguon.LastWriteTime -gt $dung.LastWriteTime) {
    Them-CanhBao "$Ten có mã nguồn mới hơn bản đã dựng. Dịch vụ đang chạy MÃ CŨ — hãy dựng lại rồi chạy lại script này."
  }
}

Test-BanDungCu (Join-Path $GocDuAn "apps\backend\src") (Join-Path $GocDuAn "apps\backend\dist") "Backend"
Test-BanDungCu (Join-Path $GocDuAn "apps\frontend\src") (Join-Path $GocDuAn "apps\frontend\.next") "Frontend"

# ------------------------------------------------- 6. Nhận dạng giọng nói
Viet-TieuDe "Nhận dạng giọng nói"

# Gửi một giây tiếng ồn thật thay vì đọc log: đây là phép thử đi hết đường dây
# (HTTP → giải mã WAV → GPU → chữ), nên nó trả lời được nghĩa là micro bấm xong
# sẽ có chữ. Ồn phải đủ to, vì đoạn im lặng bị chặn trước khi chạm tới model.
function New-TiengOnBase64 {
  $sr = 16000
  $soMau = $sr
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  $bw.Write([char[]]"RIFF"); $bw.Write([int](36 + $soMau * 2))
  $bw.Write([char[]]"WAVE"); $bw.Write([char[]]"fmt ")
  $bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1)
  $bw.Write([int]$sr); $bw.Write([int]($sr * 2)); $bw.Write([int16]2); $bw.Write([int16]16)
  $bw.Write([char[]]"data"); $bw.Write([int]($soMau * 2))
  $rnd = New-Object System.Random(7)
  for ($i = 0; $i -lt $soMau; $i++) { $bw.Write([int16]$rnd.Next(-2500, 2500)) }
  $bw.Flush()
  $b64 = [Convert]::ToBase64String($ms.ToArray())
  $bw.Dispose(); $ms.Dispose()
  return $b64
}

if ($KetQua["AI service (8000)"].Dat) {
  try {
    Viet-Dong "Đang thử một giây tiếng..." "DarkGray"
    $than = @{ audioBase64 = (New-TiengOnBase64) } | ConvertTo-Json -Compress
    $dongHo = [System.Diagnostics.Stopwatch]::StartNew()
    Invoke-RestMethod "http://localhost:8000/transcribe" -Method Post -TimeoutSec 300 `
      -ContentType "application/json" -Body $than | Out-Null
    $dongHo.Stop()
    $giay = [Math]::Round($dongHo.Elapsed.TotalSeconds, 1)
    # Đã hâm nóng thì một giây tiếng chỉ tốn vài giây. Lâu hơn 20 giây nghĩa là
    # model vừa phải nạp từ đĩa ngay lúc này — nhưng giờ thì nó nóng rồi.
    Ghi-KetQua "Nhận dạng giọng nói" $true ("$giay giây" + $(if ($giay -gt 20) { ", vừa nạp xong — từ giờ sẽ nhanh" }))
  } catch {
    Ghi-KetQua "Nhận dạng giọng nói" $false $_.Exception.Message
    Them-CanhBao "Nhận dạng giọng nói không trả lời. Vẫn demo được bằng cách gõ tay mô tả."
  }
} else {
  Ghi-KetQua "Nhận dạng giọng nói" $false "AI service chưa lên"
}

# ------------------------------------------------ 7. Dọn dữ liệu thử nghiệm
Viet-TieuDe "Dọn dữ liệu thử nghiệm"

$nenXoa = $false
if ($KhongXoaDuLieu) {
  Viet-Dong "Bỏ qua theo yêu cầu (-KhongXoaDuLieu)." "DarkGray"
} elseif (-not $KetQua["Backend (3100)"].Dat) {
  Viet-Dong "Backend chưa lên, bỏ qua bước này." "Yellow"
} else {
  Write-Host ""
  Write-Host "     Sắp XOÁ: nhiệm vụ, sự cố, số liệu cảm biến, thông báo, thư cảnh báo." -ForegroundColor Yellow
  Write-Host "     Giữ nguyên: kho, thiết bị IoT, tồn kho, toạ độ thôn, tài khoản." -ForegroundColor DarkGray
  Write-Host ""
  $traLoi = Read-Host "     Dọn để chạy lại từ đầu? [Enter = có / g = giữ nguyên]"
  $nenXoa = $traLoi -notmatch "^\s*[gGkKnN]"
}

if ($nenXoa) {
  Push-Location $GocDuAn
  try {
    Viet-Dong "Đang dọn..." "DarkGray"
    & pnpm --filter @safestock/backend exec ts-node prisma/reset-demo-data.ts 2>&1 | Out-String | Out-Null
    $xoaOk = $LASTEXITCODE -eq 0
    Ghi-KetQua "Dọn dữ liệu thử nghiệm" $xoaOk

    Viet-Dong "Đang ghi kiểm kê toàn kho..." "DarkGray"
    & pnpm --filter @safestock/backend exec ts-node prisma/record-stocktake.ts 2>&1 | Out-String | Out-Null
    # Không ghi kiểm kê thì bảng sẵn sàng đứng ở mức vàng, nhìn như kho đang thiếu.
    Ghi-KetQua "Kiểm kê (6 tiêu chí sẵn sàng)" ($LASTEXITCODE -eq 0)
  } finally {
    Pop-Location
  }
} elseif (-not $KhongXoaDuLieu -and $KetQua["Backend (3100)"].Dat) {
  Viet-Dong "Giữ nguyên dữ liệu hiện có." "DarkGray"
}

# ------------------------------------------- 8. Hâm nóng đường suy luận AI
Viet-TieuDe "Hâm nóng đường suy luận AI"

if ($KetQua["AI service (8000)"].Dat) {
  try {
    # Model nằm sẵn trong VRAM vẫn chưa đủ: lượt gọi đầu còn phải xử lý prompt hệ
    # thống khá dài. Trả giá đó ở đây, đừng để nó rơi vào câu đầu tiên trước giám khảo.
    $cau = "Nước lũ dâng nhanh ở Thôn Long Châu, khoảng 50 người bị cô lập."
    $than = @{ description = $cau } | ConvertTo-Json -Compress
    $dongHo = [System.Diagnostics.Stopwatch]::StartNew()
    # Gui dang byte UTF-8: dua thang chuoi co dau vao -Body thi Invoke-RestMethod
    # ma hoa theo bang ma mac dinh, chu tieng Viet toi noi thanh rac. Cau hoi van
    # chay nhung khong con la cau minh gui, nen phep ham nong hoa vo nghia.
    Invoke-RestMethod "http://localhost:8000/parse" -Method Post -TimeoutSec 300 `
      -ContentType "application/json; charset=utf-8" `
      -Body ([System.Text.Encoding]::UTF8.GetBytes($than)) | Out-Null
    $dongHo.Stop()
    Ghi-KetQua "Bóc tách tình huống (/parse)" $true ("{0} giây" -f [Math]::Round($dongHo.Elapsed.TotalSeconds, 1))
  } catch {
    Ghi-KetQua "Bóc tách tình huống (/parse)" $false $_.Exception.Message
  }
} else {
  Ghi-KetQua "Bóc tách tình huống (/parse)" $false "AI service chưa lên"
}

# ---------------------------------------------------------------- Tổng kết
$soDat = ($KetQua.Values | Where-Object { $_.Dat }).Count
$soTong = $KetQua.Count
$xong = $soDat -eq $soTong

Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Yellow
if ($xong) {
  Write-Host "     SẴN SÀNG DEMO  —  $soDat/$soTong mục đều tốt" -ForegroundColor Green
} else {
  Write-Host "     CÒN $($soTong - $soDat)/$soTong MỤC CHƯA XONG" -ForegroundColor Red
}
Write-Host "  ================================================================" -ForegroundColor Yellow
Write-Host ""

foreach ($ten in $KetQua.Keys) {
  $muc = $KetQua[$ten]
  $dau = if ($muc.Dat) { "  OK  " } else { " HONG " }
  $mau = if ($muc.Dat) { "Green" } else { "Red" }
  Write-Host ("   [{0}] {1,-34} {2}" -f $dau, $ten, $muc.ChiTiet) -ForegroundColor $mau
}

if ($CanhBao.Count -gt 0) {
  Write-Host ""
  Write-Host "   CẦN BIẾT TRƯỚC KHI TRÌNH BÀY:" -ForegroundColor Yellow
  foreach ($c in $CanhBao) { Write-Host ("   - " + $c) -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "   Tài khoản:  admin / admin123@              (điều phối xã, cửa sổ thường)" -ForegroundColor DarkGray
Write-Host "               longchau@ungphonhanh.life / truongthon123   (kho thôn, cửa sổ ẩn danh)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   Hai bẫy: gõ tiếng Việt CÓ DẤU khi khai tình huống; nút" -ForegroundColor DarkGray
Write-Host "   'Lập kế hoạch cứu hộ' mất ~40 giây, bấm rồi nói tiếp." -ForegroundColor DarkGray
Write-Host "   Cần app IoT thì bấm 'App IoT - Simulator.bat' ngoài Desktop." -ForegroundColor DarkGray
Write-Host ""

if (-not $KhongMoTrinhDuyet -and $KetQua["Frontend (3200)"].Dat) {
  # Hai cửa sổ tách phiên: một tài khoản chỉ sống được ở một nơi, vì tokenVersion
  # là con số dùng chung cho cả tài khoản. Đăng nhập vai thứ hai trong cùng cửa sổ
  # là đá văng vai thứ nhất, và phải mấy phút sau mới lộ ra.
  Start-Process "chrome.exe" "http://localhost:3200" -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-Process "chrome.exe" "--incognito http://localhost:3200" -ErrorAction SilentlyContinue
  Write-Host "   Đã mở hai cửa sổ trình duyệt (thường + ẩn danh)." -ForegroundColor DarkGray
  Write-Host ""
}

Read-Host "   Nhấn Enter để đóng"
