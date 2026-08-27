// main.js - Cloudify
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

const path = require('path');
const fs   = require('fs');
const http = require('http');
const { spawn, exec } = require('child_process');
const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

let windowsList    = [];
let pythonProcesses = {};
let portCounter    = 8000;

// ---- Free port finder ----
function findFreePort(start, cb) {
  const net    = require('net');
  const toTest = Math.max(start, portCounter);
  const srv    = net.createServer();
  srv.listen(toTest, () => {
    srv.once('close', () => { portCounter = toTest + 1; cb(toTest); });
    srv.close();
  });
  srv.on('error', () => { portCounter++; findFreePort(toTest + 1, cb); });
}

// ---- Extract point-cloud path from argv ----
function getFilePathFromArgs(args) {
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-')) continue;
    const ext = a.split('.').pop().toLowerCase();
    if (['las','laz','geoslam','e57'].includes(ext) && fs.existsSync(a)) return a;
  }
  return null;
}

// ---- Wait until backend is up, then send file ----
function sendFileWhenReady(win, port, filePath, maxWaitMs = 30000) {
  const start = Date.now();
  function tryOnce() {
    if (win.isDestroyed()) return;
    if (Date.now() - start > maxWaitMs) {
      console.log('[Cloudify] Backend wait timeout');
      return;
    }
    const req = http.get(`http://127.0.0.1:${port}/docs`, () => {
      // Backend is up — wait 500 ms for renderer JS to settle, then send
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.webContents.send('open-file-shortcut', filePath);
          console.log(`[Cloudify] Sent file to renderer: ${filePath}`);
          // Send again after 2 s in case first one was missed
          setTimeout(() => {
            if (!win.isDestroyed())
              win.webContents.send('open-file-shortcut', filePath);
          }, 2000);
        }
      }, 500);
    });
    req.on('error', () => setTimeout(tryOnce, 800));
    req.setTimeout(600, () => { req.destroy(); setTimeout(tryOnce, 800); });
  }
  tryOnce();
}

// ---- Create window ----
function createNewWindow(filePath = null) {
  findFreePort(8000, (port) => {
    const isPkg = app.isPackaged;
    let pyProc  = null;

    if (isPkg) {
      const exe = path.join(process.resourcesPath, 'backend', 'server.exe');
      console.log(`[Cloudify] server.exe: ${exe} | exists: ${fs.existsSync(exe)}`);
      pyProc = spawn(exe, ['--port', String(port)], {
        cwd: path.dirname(exe), shell: false, windowsHide: true
      });
    } else {
      const py  = path.join(__dirname, 'backend', 'server.py');
      const cmd = process.platform === 'win32' ? 'python' : 'python3';
      console.log(`[Cloudify] Starting dev backend on port ${port}`);
      pyProc = spawn(cmd, [py, '--port', String(port)], { shell: false });
    }

    if (pyProc) {
      pyProc.stdout.on('data', d => console.log(`[backend] ${d.toString().trim()}`));
      pyProc.stderr.on('data', d => console.log(`[backend] ${d.toString().trim()}`));
      pyProc.on('error',       e => console.error('[backend spawn error]', e));
    }

    const iconPath = isPkg
      ? path.join(process.resourcesPath, 'assets', 'app-icon.ico')
      : path.join(__dirname, 'assets', 'app-icon.ico');

    const win = new BrowserWindow({
      width: 1400, height: 900,
      icon: iconPath,
      show: false,
      backgroundColor: '#0a0a0f',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      }
    });

    pythonProcesses[win.id] = { process: pyProc, port };
    windowsList.push(win);

    remoteMain.enable(win.webContents);
    win.loadFile(path.join(__dirname, 'index.html'));

    win.once('ready-to-show', () => win.show());

    win.webContents.on('did-finish-load', () => {
      // Always sync port first
      win.webContents.send('init-backend-port', port);
      // If a file was passed, wait for backend then send
      if (filePath) sendFileWhenReady(win, port, filePath);
    });

    win.on('closed', () => {
      const obj = pythonProcesses[win.id];
      if (obj && obj.process) {
        try { obj.process.stdin.end(); } catch(_) {}
        if (obj.process.pid) {
          exec(`taskkill /pid ${obj.process.pid} /T /F`, () => {});
        }
      }
      delete pythonProcesses[win.id];
      windowsList = windowsList.filter(w => w !== win);
    });
  });
}

// ---- App lifecycle ----
function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: '📂 Open Scan (This Window)',
          accelerator: 'CmdOrCtrl+O',
          click: (menuItem, browserWindow) => {
            if (browserWindow) browserWindow.webContents.send('open-file-shortcut-trigger');
          }
        },
        { type: 'separator' },
        {
          label: '🗔 Open 2nd Scan (New Viewport Window)',
          click: async () => {
            if (windowsList.length >= 4) {
              dialog.showMessageBox({ type: 'warning', title: 'Limit reached', message: 'সর্বোচ্চ ৪টা scan window একসাথে খোলা যাবে।' });
              return;
            }
            const result = await dialog.showOpenDialog({
              title: 'Open 2nd Scan',
              filters: [{ name: 'Point Clouds', extensions: ['las', 'laz', 'geoslam', 'e57'] }],
              properties: ['openFile']
            });
            if (!result.canceled && result.filePaths[0]) {
              createNewWindow(result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        { label: 'Tile Windows Side by Side', click: () => tileAllWindows() }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}

function tileAllWindows() {
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const n = windowsList.length;
  if (n === 0) return;
  const cols = n <= 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const w = Math.floor(width / cols);
  const h = Math.floor(height / rows);
  windowsList.forEach((win, i) => {
    if (win.isDestroyed()) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    win.setBounds({ x: col * w, y: row * h, width: w, height: h });
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => createNewWindow(getFilePathFromArgs(argv)));
  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildAppMenu());
    createNewWindow(getFilePathFromArgs(process.argv));
    app.on('activate', () => { if (!windowsList.length) createNewWindow(); });
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => {
  Object.values(pythonProcesses).forEach(obj => {
    try { obj.process.stdin.end(); } catch(_) {}
    if (obj.process.pid) exec(`taskkill /pid ${obj.process.pid} /T /F`, () => {});
  });
});

// ---- IPC ----
ipcMain.on('get-backend-port', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  event.returnValue = (win && pythonProcesses[win.id])
    ? pythonProcesses[win.id].port
    : 8000;
});

// ---- IPC: Spawn an additional backend session (for 2nd/3rd/4th viewport) ----
ipcMain.handle('spawn-extra-backend', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return new Promise((resolve) => {
    findFreePort(8000, (port) => {
      const isPkg = app.isPackaged;
      let pyProc  = null;

      if (isPkg) {
        const exe = path.join(process.resourcesPath, 'backend', 'server.exe');
        pyProc = spawn(exe, ['--port', String(port)], {
          cwd: path.dirname(exe), shell: false, windowsHide: true
        });
      } else {
        const py  = path.join(__dirname, 'backend', 'server.py');
        const cmd = process.platform === 'win32' ? 'python' : 'python3';
        pyProc = spawn(cmd, [py, '--port', String(port)], { shell: false });
      }

      if (pyProc) {
        pyProc.stdout.on('data', d => console.log(`[backend-extra:${port}] ${d.toString().trim()}`));
        pyProc.stderr.on('data', d => console.log(`[backend-extra:${port}] ${d.toString().trim()}`));
        pyProc.on('error', e => console.error('[backend-extra spawn error]', e));
      }

      // এই win বন্ধ হলে extra backend-ও বন্ধ হবে (main pythonProcesses তালিকায় যোগ করা হচ্ছে)
      const key = `${win.id}-extra-${port}`;
      pythonProcesses[key] = { process: pyProc, port };
      win.on('closed', () => {
        const obj = pythonProcesses[key];
        if (obj && obj.process && obj.process.pid) {
          try { exec(`taskkill /pid ${obj.process.pid} /T /F`, () => {}); } catch(_) {}
        }
        delete pythonProcesses[key];
      });

      // Backend চালু হওয়া পর্যন্ত অপেক্ষা করে port ফেরত দেওয়া
      const start = Date.now();
      function waitReady() {
        if (Date.now() - start > 20000) { resolve(port); return; } // timeout হলেও port ফেরত দাও
        const req = http.get(`http://127.0.0.1:${port}/docs`, () => resolve(port));
        req.on('error', () => setTimeout(waitReady, 400));
        req.setTimeout(500, () => { req.destroy(); setTimeout(waitReady, 400); });
      }
      waitReady();
    });
  });
});

// ---- File Dialog via IPC ----
ipcMain.handle('open-file-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(win, {
    title: 'Open Point Cloud',
    filters: [{ name: 'Point Clouds', extensions: ['las','laz','geoslam','e57'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});
