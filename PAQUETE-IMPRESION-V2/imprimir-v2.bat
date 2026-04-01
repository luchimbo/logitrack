@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PRINTER_PATH="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "try { $cfg = Get-Content -Raw '%~dp0print-agent\config.json' ^| ConvertFrom-Json; if ($cfg.printerPath) { $cfg.printerPath } } catch {}"`) do set "PRINTER_PATH=%%P"

if not defined PRINTER_PATH if defined PRINT_V2_PRINTER_PATH set "PRINTER_PATH=%PRINT_V2_PRINTER_PATH%"
if not defined PRINTER_PATH set "PRINTER_PATH=\\127.0.0.1\ZDesigner ZD420-203dpi ZPL"
if not defined PRINT_V2_SYNC_URL set "PRINT_V2_SYNC_URL=https://logitrack-tan.vercel.app/api/v2/print-jobs/intake"

if "%~1"=="" (
  echo Arrastra uno o mas archivos .txt/.zpl sobre este .bat
  pause
  exit /b 1
)

node "%~dp0print-agent\print-and-sync.mjs" %*
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" exit /b 0

if "%EXIT_CODE%"=="2" (
  echo.
  echo FALLO DE INTEGRIDAD: se detecto diferencia entre etiquetas de entrada y salida.
  echo Por seguridad NO se imprime fallback legacy.
  echo Revisar reporte *.integrity.json en print-agent\data\
  pause
  exit /b 2
)

echo.
echo V2 termino con errores. Ejecutando fallback legacy con COPY /B...
echo Ruta impresora fallback: %PRINTER_PATH%

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
  echo Fallback legacy tambien fallo.
  echo Verifica el nombre compartido de la impresora y permisos.
  pause
  exit /b %EXIT_CODE%
)

echo Fallback legacy enviado a impresora correctamente. Archivos enviados: %FALLBACK_SENT%
exit /b 0
