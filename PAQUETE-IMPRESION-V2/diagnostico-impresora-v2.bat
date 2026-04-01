@echo off
setlocal EnableExtensions

set "PRINTER_PATH="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "try { $cfg = Get-Content -Raw '%~dp0print-agent\config.json' ^| ConvertFrom-Json; if ($cfg.printerPath) { $cfg.printerPath } } catch {}"`) do set "PRINTER_PATH=%%P"

if not defined PRINTER_PATH if defined PRINT_V2_PRINTER_PATH set "PRINTER_PATH=%PRINT_V2_PRINTER_PATH%"
if not defined PRINTER_PATH set "PRINTER_PATH=\\127.0.0.1\ZDesigner ZD420-203dpi ZPL"

echo =========================================
echo Diagnostico impresora V2
echo =========================================
echo.
echo Ruta configurada: %PRINTER_PATH%
echo.
echo Shares en localhost:
net view \\127.0.0.1
echo.
echo Impresoras detectadas (PowerShell):
powershell -NoProfile -Command "Get-Printer | Select-Object Name,Shared,ShareName | Format-Table -AutoSize"
echo.
echo Test COPY /B con config.json:
copy /B "%~dp0print-agent\config.json" "%PRINTER_PATH%"
echo.
if errorlevel 1 (
  echo RESULTADO: fallo. Revisar nombre compartido exacto y permisos.
) else (
  echo RESULTADO: OK. La ruta de impresora funciona.
)

pause
exit /b 0
