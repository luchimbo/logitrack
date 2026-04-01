@echo off
setlocal EnableExtensions

if "%~1"=="" (
  echo Arrastra uno o mas archivos .txt/.zpl sobre este .bat
  pause
  exit /b 1
)

if not defined PRINT_V2_SYNC_URL set "PRINT_V2_SYNC_URL=https://logitrack-tan.vercel.app/api/v2/print-jobs/intake"

node "%~dp0print-agent\print-and-sync.mjs" --sync-only %*
exit /b %ERRORLEVEL%
