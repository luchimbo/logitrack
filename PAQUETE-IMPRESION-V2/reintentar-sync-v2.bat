@echo off
setlocal EnableExtensions

if not defined PRINT_V2_SYNC_URL set "PRINT_V2_SYNC_URL=https://logitrack-tan.vercel.app/api/v2/print-jobs/intake"

node "%~dp0print-agent\print-and-sync.mjs" --retry-only
exit /b %ERRORLEVEL%
