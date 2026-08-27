@echo off
REM ClearScope Pro v14.0 - PyInstaller Backend Build Script
REM Run this script to compile server.py into server.exe

echo ========================================
echo  ClearScope Pro - Backend Build Script
echo ========================================
echo.

REM Install/upgrade PyInstaller
pip install pyinstaller --upgrade

REM Create the backend_dist folder
if not exist "backend_dist" mkdir backend_dist

REM Build server.exe with PyInstaller
pyinstaller ^
    --onedir ^
    --name server ^
    --distpath backend_dist ^
    --workpath build_temp ^
    --noconfirm ^
    --hidden-import=laspy ^
    --hidden-import=laspy.lasappender ^
    --hidden-import=laspy.lasreader ^
    --hidden-import=e57 ^
    --hidden-import=pye57 ^
    --hidden-import=uvicorn ^
    --hidden-import=uvicorn.logging ^
    --hidden-import=uvicorn.loops ^
    --hidden-import=uvicorn.loops.auto ^
    --hidden-import=uvicorn.protocols ^
    --hidden-import=uvicorn.protocols.http ^
    --hidden-import=uvicorn.protocols.http.auto ^
    --hidden-import=uvicorn.protocols.websockets ^
    --hidden-import=uvicorn.protocols.websockets.auto ^
    --hidden-import=uvicorn.lifespan ^
    --hidden-import=uvicorn.lifespan.on ^
    --hidden-import=fastapi ^
    --hidden-import=numpy ^
    backend\server.py

echo.
echo ========================================
echo  Build Complete!
echo  Output: backend_dist\server\server.exe
echo ========================================
pause
