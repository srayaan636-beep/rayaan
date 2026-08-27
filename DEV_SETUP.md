# ClearScope Pro v14.0 - Developer Setup Guide

## Quick Start (Development Mode)

### 1. Install Node.js Dependencies
```
npm install
```

### 2. Install Python Dependencies
```
pip install -r requirements.txt
```

### 3. Run in Development Mode
```
npm start
```
This launches Electron which automatically starts the Python backend on port 8000.

---

## Project Structure

```
clearscope-pro-dev/
├── main.js              ← Electron main process (window + Python spawn)
├── renderer.js          ← Three.js WebGL engine (all 3D logic)
├── index.html           ← UI layout and styles
├── package.json         ← npm config + electron-builder config
├── requirements.txt     ← Python backend dependencies
├── assets/
│   └── app-icon.ico     ← Application icon
├── backend/
│   └── server.py        ← FastAPI Python server
├── build-backend.bat    ← Compiles server.py → server.exe (PyInstaller)
└── build-electron.bat   ← Builds Electron installer (run after backend build)
```

---

## Production Build

### Step 1: Build Python Backend
```
build-backend.bat
```
Output: `backend_dist/server/server.exe`

### Step 2: Build Electron Installer
```
build-electron.bat
```
Output: `dist/ClearScope Pro Setup 14.0.0.exe`

---

## Supported File Formats
- `.las` — LAS point cloud
- `.laz` — Compressed LAZ point cloud
- `.e57` — E57 point cloud
- `.geoslam` — GeoSLAM scanner format

## Key Shortcuts
| Key | Action |
|-----|--------|
| O | Open file |
| T / F / L / R | Top/Front/Left/ISO view |
| M | Distance measure |
| Shift+M | Area measure |
| S | Toggle slice box |
| U | UCS alignment |
| W | Zoom to fit |
| Q | Solid wall mode |
| H | Hide/show sidebar |
| Ctrl+S | Save view layer |
| P | Export image |
| Ctrl+Z/Y | Undo/Redo |
| F1 | Shortcut guide |
