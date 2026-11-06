@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "BASE_DIR=%~dp0"
set "AGENT_DIR=%BASE_DIR%v2\print-agent"
set "AGENT_FILE=%AGENT_DIR%\print-and-sync.mjs"
set "CONFIG_FILE=%AGENT_DIR%\config.json"
set "RUN_LOG=%BASE_DIR%ultimo-error-consola.log"

echo [%DATE% %TIME%] Inicio imprimir-v2.bat > "%RUN_LOG%"
echo Carpeta: %BASE_DIR% >> "%RUN_LOG%"
echo Argumentos: %* >> "%RUN_LOG%"
echo. >> "%RUN_LOG%"

echo GeoModi - Impresion v2
echo ======================
echo Carpeta: %BASE_DIR%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado o no esta disponible en PATH.
  echo Instala Node.js LTS y volve a ejecutar este .bat.
  echo ERROR: Node.js no esta instalado o no esta disponible en PATH. >> "!RUN_LOG!"
  echo.
  pause
  exit /b 10
)

if not exist "%AGENT_FILE%" (
  echo ERROR: falta el agente V2.
  echo No se encontro: !AGENT_FILE!
  echo.
  echo Copia la carpeta completa GeoModi-Impresion-V2 en esta PC.
  echo Si usas solo el .bat, la impresora puede imprimir pero GeoModi no recibe datos.
  echo ERROR: falta el agente V2: !AGENT_FILE! >> "!RUN_LOG!"
  echo.
  pause
  exit /b 11
)

if not exist "%CONFIG_FILE%" (
  echo ERROR: falta config.json.
  echo No se encontro: !CONFIG_FILE!
  echo.
  echo Completa v2\print-agent\config.json con printerPath, syncUrl, syncToken y workspaceKey.
  echo ERROR: falta config.json: !CONFIG_FILE! >> "!RUN_LOG!"
  echo.
  pause
  exit /b 12
)

set "PRINTER_PATH="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "try { $cfg = Get-Content -Raw '%CONFIG_FILE%' ^| ConvertFrom-Json; if ($cfg.printerPath) { $cfg.printerPath } } catch {}"`) do set "PRINTER_PATH=%%P"

if not defined PRINTER_PATH if defined PRINT_V2_PRINTER_PATH set "PRINTER_PATH=%PRINT_V2_PRINTER_PATH%"
if not defined PRINTER_PATH set "PRINTER_PATH=\\127.0.0.1\ZDesigner ZD420-203dpi ZPL"
if not defined PRINT_V2_SYNC_URL set "PRINT_V2_SYNC_URL=https://logitrack-tan.vercel.app/api/v2/print-jobs/intake"

if "%~1"=="" (
  echo Arrastra uno o mas archivos .txt/.zpl sobre este .bat
  pause
  exit /b 1
)

node "%AGENT_FILE%" %* >> "%RUN_LOG%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

type "%RUN_LOG%"

if "%EXIT_CODE%"=="0" (
  echo.
  echo GeoModi V2 termino correctamente.
  echo Si fue una impresion real, verifica arriba el mensaje "Sync OK" para confirmar que la data llego a GeoModi.
  if not "%PRINT_V2_NO_PAUSE%"=="1" pause
  exit /b 0
)

if "%EXIT_CODE%"=="2" (
  echo.
  echo FALLO DE INTEGRIDAD: se detecto diferencia entre etiquetas de entrada y salida.
  echo Por seguridad NO se imprime fallback legacy.
  echo Revisar reporte *.integrity.json en v2\print-agent\data\
  pause
  exit /b 2
)

if "%EXIT_CODE%"=="3" (
  echo.
  echo IMPRESION CANCELADA: se detectaron etiquetas ya impresas.
  echo Por seguridad NO se imprime fallback legacy.
  pause
  exit /b 3
)

echo.
echo ERROR: V2 termino con errores y NO se ejecuto fallback legacy.
echo No se imprimio ni se mando la data a GeoModi.
echo Motivo: si se usa COPY /B como fallback, puede imprimir sin cargar datos.
echo.
  echo Si el error dice "No se encuentra el nombre de red especificado",
  echo revisa printerPath en:
  echo !CONFIG_FILE!
  echo.
  echo Tambien podes ejecutar diagnostico-impresora-v2.bat para ver el nombre compartido real.
  echo.
  echo Revisar logs en:
echo !AGENT_DIR!\data\last_run.log
echo.
pause
exit /b %EXIT_CODE%
