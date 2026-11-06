@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "BASE_DIR=%~dp0"
set "AGENT_DIR=%BASE_DIR%v2\print-agent"
set "AGENT_FILE=%AGENT_DIR%\print-and-sync.mjs"
set "CONFIG_FILE=%AGENT_DIR%\config.json"

echo GeoModi - Modo Cola de Impresion v2
echo =====================================
echo Este proceso sondea la cola de GeoModi e imprime jobs encolados desde la web.
echo Presionar Ctrl+C para detener.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado o no esta disponible en PATH.
  echo Instala Node.js LTS y volve a ejecutar este .bat.
  echo.
  pause
  exit /b 10
)

if not exist "%AGENT_FILE%" (
  echo ERROR: falta el agente V2.
  echo No se encontro: %AGENT_FILE%
  echo.
  echo Copia la carpeta completa GeoModi-Impresion-V2 en esta PC.
  echo.
  pause
  exit /b 11
)

if not exist "%CONFIG_FILE%" (
  echo ERROR: falta config.json.
  echo No se encontro: %CONFIG_FILE%
  echo.
  echo Completa v2\print-agent\config.json con printerPath, syncUrl, syncToken y workspaceKey.
  echo.
  pause
  exit /b 12
)

if not defined PRINT_V2_SYNC_URL set "PRINT_V2_SYNC_URL=https://logitrack-tan.vercel.app/api/v2/print-jobs/intake"

node "%AGENT_FILE%" --watch %*

if errorlevel 1 (
  echo.
  echo El agente de cola termino con error. Revisar logs en:
  echo %AGENT_DIR%\data\last_run.log
  pause
)
