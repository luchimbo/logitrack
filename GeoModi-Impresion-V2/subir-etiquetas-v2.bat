@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "BASE_DIR=%~dp0"
set "AGENT_DIR=%BASE_DIR%v2\print-agent"
set "AGENT_FILE=%AGENT_DIR%\print-and-sync.mjs"
set "CONFIG_FILE=%AGENT_DIR%\config.json"
set "RUN_LOG=%BASE_DIR%ultimo-error-carga.log"

echo [%DATE% %TIME%] Inicio subir-etiquetas-v2.bat > "%RUN_LOG%"
echo Carpeta: %BASE_DIR% >> "%RUN_LOG%"
echo Argumentos: %* >> "%RUN_LOG%"
echo. >> "%RUN_LOG%"

echo GeoModi - Solo cargar etiquetas v2
echo ==================================
echo Carpeta: %BASE_DIR%
echo.
echo Este modo NO imprime. Solo manda la data a GeoModi.
echo Recupera etiquetas faltantes aunque figuren en el historial local.
echo GeoModi omite los envios que ya estan cargados.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado o no esta disponible en PATH.
  echo ERROR: Node.js no esta instalado o no esta disponible en PATH. >> "!RUN_LOG!"
  echo.
  pause
  exit /b 10
)

if not exist "%AGENT_FILE%" (
  echo ERROR: falta el agente V2.
  echo No se encontro: !AGENT_FILE!
  echo ERROR: falta el agente V2: !AGENT_FILE! >> "!RUN_LOG!"
  echo.
  pause
  exit /b 11
)

if not exist "%CONFIG_FILE%" (
  echo ERROR: falta config.json.
  echo No se encontro: !CONFIG_FILE!
  echo ERROR: falta config.json: !CONFIG_FILE! >> "!RUN_LOG!"
  echo.
  pause
  exit /b 12
)

if "%~1"=="" (
  echo Arrastra uno o mas archivos .txt/.zpl sobre este .bat
  echo.
  pause
  exit /b 1
)

if not defined PRINT_V2_SYNC_URL set "PRINT_V2_SYNC_URL=https://logitrack-tan.vercel.app/api/v2/print-jobs/intake"

node "%AGENT_FILE%" --sync-only --force-reprint %* >> "%RUN_LOG%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

type "%RUN_LOG%"

if not "%EXIT_CODE%"=="0" goto :carga_error
findstr /L /C:"Sync OK (" "%RUN_LOG%" >nul
if errorlevel 1 goto :sin_confirmar

if "%EXIT_CODE%"=="0" (
  echo.
  echo Carga terminada correctamente.
  echo Verifica arriba el mensaje "Sync OK" para confirmar que la data llego a GeoModi.
  if not "%PRINT_V2_NO_PAUSE%"=="1" pause
  exit /b 0
)

:carga_error
if "%EXIT_CODE%"=="3" (
  echo.
  echo CARGA CANCELADA: se detectaron etiquetas duplicadas/reimpresas.
  echo No se subio este lote a GeoModi desde este modo.
  if not "%PRINT_V2_NO_PAUSE%"=="1" pause
  exit /b 3
)

echo.
echo ERROR: no se pudo cargar la data a GeoModi.
echo Revisar logs en:
echo !AGENT_DIR!\data\last_run.log
echo.
if not "%PRINT_V2_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%

:sin_confirmar
echo.
echo CARGA SIN CONFIRMAR: no se recibio Sync OK de GeoModi.
echo Revisa el registro de arriba. Si dice Sync pendiente, usa reintentar-sync-v2.bat.
if not "%PRINT_V2_NO_PAUSE%"=="1" pause
exit /b 4
