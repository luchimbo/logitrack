@echo off
setlocal EnableExtensions

node "%~dp0v2\print-agent\print-and-sync.mjs" --retry-only
exit /b %ERRORLEVEL%
