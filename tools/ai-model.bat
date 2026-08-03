@echo off
REM ============================================================
REM  Ung pho nhanh - Dieu khien mo hinh AI cuc bo
REM
REM  Bam doi chuot de mo bang chon, hoac goi kem tham so:
REM     ai-model.bat start    nap model vao VRAM, giu mai mai
REM     ai-model.bat end      tra VRAM ngay lap tuc
REM     ai-model.bat status   xem trang thai
REM
REM  Khong dung tieng Viet co dau: console Windows mac dinh khong
REM  phai UTF-8 nen chu co dau se hien thanh ky tu rac.
REM ============================================================
setlocal EnableDelayedExpansion
set "AI=http://localhost:8000"
set "EMPTY=0"

if /i "%~1"=="start"  ( call :do_start  & exit /b !ERRORLEVEL! )
if /i "%~1"=="end"    ( call :do_stop   & exit /b !ERRORLEVEL! )
if /i "%~1"=="stop"   ( call :do_stop   & exit /b !ERRORLEVEL! )
if /i "%~1"=="status" ( call :do_status & exit /b !ERRORLEVEL! )

:menu
cls
echo ==========================================================
echo    UNG PHO NHANH  -  MO HINH AI CUC BO
echo ==========================================================
echo.
call :do_status
echo.
echo   [1]  START  - Ham nong ngay + giu mai mai
echo   [2]  END    - Tra VRAM, nguoi lap tuc
echo   [3]  Xem lai trang thai
echo   [0]  Thoat
echo.
set "choice="
set /p "choice=Chon: "

REM Khong doc duoc gi (vd chay tu script, stdin da het) thi thoat,
REM neu khong bang chon se lap vo han.
if not defined choice (
  set /a EMPTY+=1
  if !EMPTY! GEQ 3 exit /b 0
  goto menu
)
set "EMPTY=0"

if "%choice%"=="1" ( call :do_start & pause & goto menu )
if "%choice%"=="2" ( call :do_stop  & pause & goto menu )
if "%choice%"=="3" goto menu
if "%choice%"=="0" exit /b 0
goto menu

REM ---------------------------------------------------------------
:do_start
echo.
echo Dang nap model vao VRAM... lan dau co the mat 15-30 giay.
curl -s -m 600 -X POST "%AI%/keep-warm/start" >nul 2>&1
if errorlevel 1 ( call :offline & exit /b 1 )
echo.
call :do_status
echo.
echo   XONG. Model nam trong VRAM va se KHONG bao gio tu nguoi.
echo   Vong canh tu nap lai neu Ollama khoi dong lai.
exit /b 0

REM ---------------------------------------------------------------
:do_stop
echo.
echo Dang tra VRAM...
curl -s -m 120 -X POST "%AI%/keep-warm/stop" >nul 2>&1
if errorlevel 1 ( call :offline & exit /b 1 )
echo.
call :do_status
echo.
echo   XONG. Da tra VRAM va tat vong canh, nen model KHONG tu nong lai.
echo   Lan goi AI ke tiep se cham hon 15 giay va co the bi bo cuoc.
echo   Nho bam START truoc khi trinh dien.
exit /b 0

REM ---------------------------------------------------------------
:do_status
set "STATE="
for /f "usebackq delims=" %%i in (`curl -s -m 15 "%AI%/keep-warm" 2^>nul`) do set "STATE=%%i"
if not defined STATE (
  echo   Trang thai: KHONG KET NOI DUOC AI SERVICE ^(cong 8000^)
  exit /b 1
)
echo !STATE! | findstr /C:"\"loadedModels\":[]" >nul 2>&1
if errorlevel 1 (
  echo   Trang thai: DANG NONG  - model nam trong VRAM
) else (
  echo   Trang thai: DANG NGUOI - VRAM trong
)
echo !STATE! | findstr /C:"\"keepWarmPaused\":true" >nul 2>&1
if errorlevel 1 (
  echo   Giu am    : DANG BAT   - tu nap lai neu bi day ra
) else (
  echo   Giu am    : DANG TAT   - se khong tu nong lai
)
exit /b 0

REM ---------------------------------------------------------------
:offline
echo.
echo   LOI: khong goi duoc AI service o %AI%
echo.
echo   Kiem tra:
echo     - Scheduled task "UngPhoNhanh-AiService" da chay chua
echo     - Ollama da chay chua ^(cong 11434^)
exit /b 1
