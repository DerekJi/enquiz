@echo off
rem Double-click this file after editing data\chapters\*.json.
rem It regenerates data\chapters\chapters.js so the browser can load the data.
title Build Spylark quiz data
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Node.js was not found on PATH.
    echo   Install it from https://nodejs.org/ and run this again.
    echo.
    pause
    exit /b 1
)

node build-data.mjs
set STATUS=%ERRORLEVEL%

echo.
if "%STATUS%"=="0" (
    echo Done. Open index.html in your browser ^(a refresh is enough^).
) else (
    echo Build failed — nothing was written. Fix the problems listed above.
)
echo.
pause
exit /b %STATUS%
