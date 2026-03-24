@echo off
setlocal
cd /d "%~dp0"

set "PORT=3001"
set "HOST=127.0.0.1"
set "PID="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"%HOST%:%PORT% .*LISTENING"') do (
  set "PID=%%P"
  goto :port_in_use
)

echo Dang chay Solais local tai http://%HOST%:%PORT%
start "" /b node .local-static-server.js . %PORT% %HOST% > solais-local.stdout.log 2> solais-local.stderr.log
timeout /t 2 /nobreak >nul
start "" "http://%HOST%:%PORT%"
echo Da mo web local.
exit /b 0

:port_in_use
echo Cong %PORT% dang duoc su dung boi PID %PID%.
echo Neu do la Solais local thi chi can mo http://%HOST%:%PORT%
start "" "http://%HOST%:%PORT%"
exit /b 0
