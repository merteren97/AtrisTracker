const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const UsageDatabase = require('./db');
const CLIScanner = require('./cliScanner');

let mainWindow = null;
let tray = null;
let db = null;
let scanner = null;
let pollingInterval = null;
let alwaysOnTopState = true;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Disable Chromium GPU shader cache locks on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

function createWindow() {
  const iconPath = path.join(__dirname, '../assets/logo.jpg');
  mainWindow = new BrowserWindow({
    width: 400,
    height: 620,
    minWidth: 340,
    minHeight: 480,
    maxWidth: 600,
    maxHeight: 900,
    frame: false,
    transparent: true,
    alwaysOnTop: alwaysOnTopState,
    skipTaskbar: false,
    resizable: true,
    hasShadow: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const distPath = path.join(__dirname, '../dist/index.html');
  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/logo.jpg');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createFromBuffer(
        Buffer.from(
          'iVBORw0KGgoAAAANSU5EUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAuSURBVHgB7cxBEAMACAIwzV/1b2sF9iABtTzZpA4sAR4eHh4eHh4eHh4eHh5+wwM7uQNq1mJz3AAAAABJRU5ErkJggg==',
          'base64'
        )
      );

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'AtrisTracker',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Yenile / Tara',
      click: async () => {
        if (scanner) {
          await scanner.scanAll();
          if (mainWindow) mainWindow.webContents.send('usage-updated');
        }
      },
    },
    {
      label: alwaysOnTopState ? 'Her Zaman Üstte (Aktif)' : 'Her Zaman Üstte (Kapalı)',
      type: 'checkbox',
      checked: alwaysOnTopState,
      click: () => {
        alwaysOnTopState = !alwaysOnTopState;
        if (mainWindow) mainWindow.setAlwaysOnTop(alwaysOnTopState);
      },
    },
    {
      label: 'Göster / Gizle',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('AI Usage Tracker (Antigravity CLI, Codex CLI, Claude Code)');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// App Initialization
app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'ai_usage_tracker.db');
  db = new UsageDatabase(dbPath);
  await db.init();
  scanner = new CLIScanner(db);

  // Initial Scan
  await scanner.scanAll();

  // Create Window & Tray
  createWindow();
  createTray();

  // Background Polling (Every 2 Minutes)
  pollingInterval = setInterval(async () => {
    await scanner.scanAll();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('usage-updated');
    }
  }, 2 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// IPC Communication Handlers
ipcMain.handle('get-latest-usage', (event, tool) => {
  return db ? db.getLatestSnapshot(tool) : null;
});

ipcMain.handle('scan-usage', async () => {
  if (!scanner) return null;
  const results = await scanner.scanAll();
  return results;
});

ipcMain.handle('get-usage-history', (event, tool, limit) => {
  return db ? db.getUsageHistory(tool, limit) : [];
});

ipcMain.handle('get-active-accounts', () => {
  return db ? db.getActiveAccounts() : [];
});

ipcMain.handle('get-accounts-by-tool', (event, tool) => {
  return db ? db.getAccountsByTool(tool) : [];
});

ipcMain.handle('get-snapshot-by-account', (event, tool, email) => {
  return db ? db.getLatestSnapshotByAccount(tool, email) : null;
});

ipcMain.handle('get-usage-history-by-account', (event, tool, email, limit) => {
  return db ? db.getUsageHistoryByAccount(tool, email, limit) : [];
});

ipcMain.handle('toggle-always-on-top', () => {
  if (mainWindow) {
    alwaysOnTopState = !alwaysOnTopState;
    mainWindow.setAlwaysOnTop(alwaysOnTopState);
    return alwaysOnTopState;
  }
  return false;
});

ipcMain.handle('is-always-on-top', () => {
  return alwaysOnTopState;
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide(); // Hide to tray on close
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (pollingInterval) clearInterval(pollingInterval);
    app.quit();
  }
});
