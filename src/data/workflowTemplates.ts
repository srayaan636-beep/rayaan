import { BuildConfig, ProjectFile } from '../types';

export function generateWorkflowYaml(config: BuildConfig): string {
  return `name: Build Windows EXE

on:
  push:
    branches: [ main, master ]
    tags:
      - 'v*'
  workflow_dispatch: # Allows manual 1-click trigger from GitHub Actions

jobs:
  build-windows:
    name: Build ${config.appName} Windows Installer (.exe)
    runs-on: windows-latest

    steps:
      - name: 📥 Checkout Source Code
        uses: actions/checkout@v4

      - name: 🐍 Set up Python ${config.pythonVersion}
        uses: actions/setup-python@v5
        with:
          python-version: '${config.pythonVersion}'
          cache: 'pip'

      - name: 📦 Install Python Dependencies & PyInstaller
        run: |
          python -m pip install --upgrade pip
          pip install pyinstaller
          if (Test-Path requirements.txt) {
            pip install -r requirements.txt
          }

      - name: ⚙️ Compile Python Backend (server.py -> server.exe)
        run: |
          if (!(Test-Path "backend_dist")) { 
            New-Item -ItemType Directory -Force -Path "backend_dist" 
          }
          pyinstaller \`
            --onedir \`
            --name server \`
            --distpath backend_dist \`
            --workpath build_temp \`
            --noconfirm \`
            --hidden-import=laspy \`
            --hidden-import=laspy.lasappender \`
            --hidden-import=laspy.lasreader \`
            --hidden-import=e57 \`
            --hidden-import=pye57 \`
            --hidden-import=uvicorn \`
            --hidden-import=uvicorn.logging \`
            --hidden-import=uvicorn.loops \`
            --hidden-import=uvicorn.loops.auto \`
            --hidden-import=uvicorn.protocols \`
            --hidden-import=uvicorn.protocols.http \`
            --hidden-import=uvicorn.protocols.http.auto \`
            --hidden-import=uvicorn.protocols.websockets \`
            --hidden-import=uvicorn.protocols.websockets.auto \`
            --hidden-import=uvicorn.lifespan \`
            --hidden-import=uvicorn.lifespan.on \`
            --hidden-import=fastapi \`
            --hidden-import=numpy \`
            backend/server.py

      - name: 🟢 Set up Node.js ${config.nodeVersion}
        uses: actions/setup-node@v4
        with:
          node-version: '${config.nodeVersion}'
          cache: 'npm'

      - name: 📦 Install NPM Packages
        run: npm install

      - name: 🚀 Build Electron Windows Setup EXE
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          CSC_IDENTITY_AUTO_DISCOVERY: false
        run: npm run build

      - name: 💾 Upload EXE as GitHub Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${config.outputExeName || 'Windows-Setup-EXE'}
          path: dist/*.exe
          retention-days: ${config.artifactRetentionDays}
${
  config.createReleaseOnTag
    ? `
      - name: 🏷️ Publish GitHub Release (if tagged with v*)
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*.exe
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`
    : ''
}`;
}

export const defaultProjectFiles: ProjectFile[] = [
  {
    path: '.github/workflows/build-exe.yml',
    name: 'GitHub Actions Workflow',
    description: 'Automates Python PyInstaller backend compilation and Electron Builder Windows .exe creation in cloud.',
    required: true,
    content: `name: Build Windows EXE

on:
  push:
    branches: [ main, master ]
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    name: Build Windows Installer (.exe)
    runs-on: windows-latest

    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Set up Python 3.10
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
          cache: 'pip'

      - name: Install Python Dependencies & PyInstaller
        run: |
          python -m pip install --upgrade pip
          pip install pyinstaller
          if (Test-Path requirements.txt) { pip install -r requirements.txt }

      - name: Build Python Backend Server EXE
        run: |
          if (!(Test-Path "backend_dist")) { New-Item -ItemType Directory -Force -Path "backend_dist" }
          pyinstaller \`
            --onedir \`
            --name server \`
            --distpath backend_dist \`
            --workpath build_temp \`
            --noconfirm \`
            --hidden-import=laspy \`
            --hidden-import=laspy.lasappender \`
            --hidden-import=laspy.lasreader \`
            --hidden-import=e57 \`
            --hidden-import=pye57 \`
            --hidden-import=uvicorn \`
            --hidden-import=uvicorn.logging \`
            --hidden-import=uvicorn.loops \`
            --hidden-import=uvicorn.loops.auto \`
            --hidden-import=uvicorn.protocols \`
            --hidden-import=uvicorn.protocols.http \`
            --hidden-import=uvicorn.protocols.http.auto \`
            --hidden-import=uvicorn.protocols.websockets \`
            --hidden-import=uvicorn.protocols.websockets.auto \`
            --hidden-import=uvicorn.lifespan \`
            --hidden-import=uvicorn.lifespan.on \`
            --hidden-import=fastapi \`
            --hidden-import=numpy \`
            backend/server.py

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install NPM Dependencies
        run: npm install

      - name: Build Electron App Installer
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          CSC_IDENTITY_AUTO_DISCOVERY: false
        run: npm run build

      - name: Upload EXE Artifact
        uses: actions/upload-artifact@v4
        with:
          name: Cloudify-Windows-Installer
          path: dist/*.exe
          retention-days: 30

      - name: Publish GitHub Release (if tagged)
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*.exe
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`,
  },
  {
    path: 'package.json',
    name: 'Electron Package Configuration',
    description: 'Contains electron-builder settings, extraResources for server.exe, and file associations.',
    required: true,
    content: `{
  "name": "cloudify",
  "version": "1.5.0",
  "description": "Cloudify - Professional Point Cloud Viewer",
  "author": "Cloudify",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win --x64 --publish never"
  },
  "dependencies": {
    "@electron/remote": "^2.1.3",
    "@loaders.gl/core": "latest",
    "@loaders.gl/las": "latest",
    "three": "^0.150.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^26.15.3"
  },
  "build": {
    "appId": "com.cloudify.app",
    "productName": "Cloudify",
    "copyright": "Copyright © 2024 Cloudify",
    "electronVersion": "28.3.3",
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "renderer.js",
      "index.html",
      "sign.js",
      "assets/**",
      "node_modules/**",
      "!node_modules/.cache/**"
    ],
    "extraResources": [
      {
        "from": "backend_dist/server/",
        "to": "backend/",
        "filter": ["**/*"]
      },
      {
        "from": "assets/",
        "to": "assets/",
        "filter": ["**/*"]
      }
    ],
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] }
      ],
      "icon": "assets/app-icon.ico",
      "forceCodeSigning": false,
      "signExecutable": false,
      "signAndEditExecutable": false,
      "fileAssociations": [
        { "ext": "las", "name": "LAS Point Cloud", "description": "LAS Point Cloud File", "icon": "assets/app-icon.ico" },
        { "ext": "laz", "name": "LAZ Point Cloud", "description": "LAZ Point Cloud File", "icon": "assets/app-icon.ico" },
        { "ext": "e57", "name": "E57 Point Cloud", "description": "E57 Point Cloud File", "icon": "assets/app-icon.ico" },
        { "ext": "geoslam", "name": "GeoSLAM Point Cloud", "description": "GeoSLAM Point Cloud File", "icon": "assets/app-icon.ico" }
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Cloudify"
    }
  }
}`,
  },
  {
    path: 'requirements.txt',
    name: 'Python Backend Requirements',
    description: 'Python packages required by FastAPI backend server (laspy, e57, uvicorn, etc.)',
    required: true,
    content: `fastapi==0.109.0
uvicorn[standard]==0.27.0
laspy[lazrs,laszip]==2.5.3
e57==0.1.3
pye57==0.4.6
numpy==1.26.3
python-multipart==0.0.6
`,
  },
  {
    path: 'setup-and-push.bat',
    name: '1-Click GitHub Push Script (Windows)',
    description: 'Automated script to initialize git repository and push all files to GitHub with single double-click.',
    required: false,
    content: `@echo off
echo ========================================
echo   Cloudify - Push to GitHub Script
echo ========================================
echo.

REM Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    echo Please install Git for Windows from https://git-scm.com/
    pause
    exit /b
)

REM Initialize git if not already initialized
if not exist ".git" (
    echo Initializing Git repository...
    git init
    git branch -M main
)

REM Ask for remote repository URL if not configured
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    set /p REPO_URL="Enter your GitHub Repository URL (e.g. https://github.com/username/cloudify.git): "
    git remote add origin %REPO_URL%
)

echo.
echo Adding files to git...
git add .

echo Committing files...
git commit -m "Configure GitHub Actions EXE builder workflow"

echo.
echo Pushing to GitHub (main branch)...
git push -u origin main

echo.
echo ========================================
echo   Done! Go to GitHub -> Actions tab to
echo   see your Windows .exe build in action!
echo ========================================
pause
`,
  },
  {
    path: 'sign.js',
    name: 'Code Sign Bypass',
    description: 'Bypasses Windows code signing error on CI environments.',
    required: true,
    content: `// sign.js - No-op code signing script
// This bypasses winCodeSign entirely (no certificate error on CI)
exports.default = async function(configuration) {
  console.log(\`Skipping code signing for: \${configuration.path}\`);
};
`,
  },
];
