@echo off
setlocal EnableExtensions

set "BASE_DIR=%~dp0"
set "CONFIG_FILE=%BASE_DIR%v2\print-agent\config.json"

echo GeoModi - Diagnostico de impresora v2
echo =====================================
echo Carpeta: %BASE_DIR%
echo.

echo Config actual:
if exist "%CONFIG_FILE%" (
  powershell -NoProfile -Command "try { $cfg = Get-Content -Raw '%CONFIG_FILE%' | ConvertFrom-Json; 'printerPath: ' + $cfg.printerPath; 'syncUrl: ' + $cfg.syncUrl; 'workspaceKey: ' + $cfg.workspaceKey } catch { 'No se pudo leer config.json: ' + $_.Exception.Message }"
) else (
  echo No existe %CONFIG_FILE%
)

echo.
echo Impresoras instaladas:
powershell -NoProfile -Command "try { Get-Printer -ErrorAction Stop | Sort-Object Name | Select-Object Name,ShareName,Shared,PrinterStatus,PortName | Format-Table -AutoSize } catch { Get-CimInstance Win32_Printer | Sort-Object Name | Select-Object Name,ShareName,Shared,WorkOffline,PortName | Format-Table -AutoSize }"

echo.
echo Recursos compartidos de impresora:
powershell -NoProfile -Command "try { $printers = Get-Printer -ErrorAction Stop | Where-Object { $_.Shared -or $_.ShareName } } catch { $printers = Get-CimInstance Win32_Printer | Where-Object { $_.Shared -or $_.ShareName } }; if (-not $printers) { 'No hay impresoras compartidas. Hay que compartir la Zebra desde Windows.' } else { $printers | ForEach-Object { if ($_.ShareName) { '\\127.0.0.1\' + $_.ShareName + '    (Nombre: ' + $_.Name + ')' } } }"

echo.
echo Que hacer:
echo 1. Si la Zebra no aparece con Shared=True o sin ShareName, compartila desde Windows.
echo 2. Copia el recurso tipo \\127.0.0.1\NOMBRE_COMPARTIDO.
echo 3. Pegalo en v2\print-agent\config.json en printerPath.
echo 4. Volve a probar imprimir-v2.bat.
echo.
pause
