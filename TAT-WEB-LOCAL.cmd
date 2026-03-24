@echo off
setlocal
set "PORT=3001"
set "HOST=127.0.0.1"
set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"%HOST%:%PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo Dang tat process PID %%P tren cong %PORT%...
  taskkill /PID %%P /F >nul 2>nul
)

if not defined FOUND (
  echo Khong co server nao dang nghe tren %HOST%:%PORT%.
  exit /b 0
)

echo Da tat web local tren cong %PORT%.
exit /b 0
