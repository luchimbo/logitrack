@echo off
setlocal EnableExtensions

set "BASE_DIR=%~dp0"
set "RUN_LOG=%BASE_DIR%ultimo-error-consola.log"
set "WRAPPER_LOG=%BASE_DIR%ultimo-wrapper.log"

echo GeoModi - Consola persistente
echo =============================
echo.
echo Esta ventana queda abierta para poder leer cualquier error.
echo Log: %RUN_LOG%
echo.

if "%~1"=="" (
  echo Arrastra uno o mas archivos .txt/.zpl sobre este archivo:
  echo abrir-consola-v2.bat
  echo.
  echo Tambien podes ejecutar diagnostico-impresora-v2.bat para revisar printerPath.
  echo.
  pause
  exit /b 1
)

echo [%DATE% %TIME%] Ejecutando imprimir-v2.bat %* > "%WRAPPER_LOG%"
call "%BASE_DIR%imprimir-v2.bat" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo =============================
echo Salida de imprimir-v2.bat
echo =============================
if exist "%RUN_LOG%" (
  type "%RUN_LOG%"
) else (
  echo No se encontro el log: %RUN_LOG%
)
echo.
echo Codigo de salida: %EXIT_CODE%
echo.
pause
exit /b %EXIT_CODE%
