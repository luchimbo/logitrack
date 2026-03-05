@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PRINTER_PATH=\\127.0.0.1\ZDesigner ZD420-203dpi ZPL (Copiar 1)"
if not defined PRINT_V2_SYNC_URL set "PRINT_V2_SYNC_URL=https://logitrack-tan.vercel.app/api/v2/print-jobs/intake"

if "%~1"=="" (
  echo Arrastra uno o mas archivos .txt/.zpl sobre este .bat
  pause
  exit /b 1
)

node "%~dp0v2\print-agent\print-and-sync.mjs" %*
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" exit /b 0

echo.
echo V2 termino con errores. Ejecutando fallback legacy con COPY /B...

set /a FALLBACK_SENT=0
set /a FALLBACK_FAILED=0

:collect_args
if "%~1"=="" goto run_fallback

if /I "%~x1"==".txt" (
  copy /B "%~f1" "%PRINTER_PATH%" >nul
  if errorlevel 1 (
    set /a FALLBACK_FAILED+=1
  ) else (
    set /a FALLBACK_SENT+=1
  )
)

if /I "%~x1"==".zpl" (
  copy /B "%~f1" "%PRINTER_PATH%" >nul
  if errorlevel 1 (
    set /a FALLBACK_FAILED+=1
  ) else (
    set /a FALLBACK_SENT+=1
  )
)

shift
goto collect_args

:run_fallback
if "%FALLBACK_SENT%"=="0" (
  copy /B "*.txt" "%PRINTER_PATH%" >nul
  if not errorlevel 1 set /a FALLBACK_SENT+=1

  copy /B "*.zpl" "%PRINTER_PATH%" >nul
  if not errorlevel 1 set /a FALLBACK_SENT+=1
)

if "%FALLBACK_SENT%"=="0" (
  echo Fallback legacy tambien fallo. Revisar logs en v2\print-agent\data\
  pause
  exit /b %EXIT_CODE%
)

echo Fallback legacy enviado a impresora correctamente. Archivos enviados: %FALLBACK_SENT%
exit /b 0
