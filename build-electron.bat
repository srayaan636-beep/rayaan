@echo off
REM ClearScope Pro v14.0 - Electron Build Script
REM Run AFTER build-backend.bat has completed

echo ========================================
echo  ClearScope Pro - Electron Build Script
echo ========================================
echo.

REM Check node_modules
if not exist "node_modules" (
    echo Installing npm dependencies...
    npm install
)

REM Build electron app
echo Building Electron installer...
npm run build

echo.
echo ========================================
echo  Build Complete!
echo  Installer is in the dist/ folder
echo ========================================
pause
