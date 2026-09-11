# Giữ tệp nhật ký của bốn dịch vụ không phình vô hạn.
#
# VÌ SAO CẦN: bốn runner đều là vòng lặp "chạy — chết — chờ 10 giây — chạy lại",
# ghi nối vào ĐÚNG MỘT tệp, không có trần. Bình thường thì tệp lớn chậm và không
# ai để ý. Nhưng khi dịch vụ chết ngay lúc khởi động — Docker chưa lên nên Prisma
# không nối được cơ sở dữ liệu chẳng hạn — thì mỗi 10 giây là một vệt stack trace
# mới, chạy suốt đêm.
#
# Đã xảy ra thật (2026-09-11): máy ngủ, ba container Docker tắt theo, backend lặp
# lỗi P1001 trong 9 tiếng và `backend.log` phình lên 4,77 GB. Không ai biết cho tới
# lúc mở ra xem. Ổ C khi ấy còn 70 GB nên chưa thành tai nạn — nhưng chỉ là chưa.
#
# Cách làm: trước mỗi lần khởi động, tệp nào quá trần thì đổi tên thành `.1` (đè
# bản `.1` cũ) rồi bắt đầu tệp mới. Chỉ giữ hai đời: đủ để soi lỗi vừa xảy ra, mà
# không bao giờ vượt quá hai lần trần.

function Invoke-LogRotation {
  param(
    [Parameter(Mandatory = $true)][string]$LogFile,
    # 20 MB: đủ chứa vài nghìn dòng khởi động bình thường, mà vẫn mở được bằng
    # Notepad khi cần đọc gấp lúc nửa đêm.
    [int]$MaxBytes = 20MB
  )

  try {
    if (-not (Test-Path -LiteralPath $LogFile)) { return }
    $size = (Get-Item -LiteralPath $LogFile).Length
    if ($size -lt $MaxBytes) { return }

    $previous = "$LogFile.1"
    if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Force }
    Move-Item -LiteralPath $LogFile -Destination $previous -Force
  } catch {
    # Xoay log hỏng thì KHÔNG được kéo dịch vụ chết theo: thà để tệp phình còn hơn
    # để cả backend không lên chỉ vì một thao tác dọn dẹp.
  }
}
