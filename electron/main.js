const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const UsageDatabase = require('./db');
const CLIScanner = require('./cliScannerEnhanced');
const AntigravityIntegration = require('./antigravityIntegration');
const StartupManager = require('./startup');

const APP_ID = 'com.atristracker.app';

let mainWindow = null;
let tray = null;
let db = null;
let scanner = null;
let antigravityIntegration = null;
let startupManager = null;
let pollingInterval = null;
let alwaysOnTopState = true;
let startHidden = process.argv.includes('--startup');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Disable Chromium GPU shader cache locks on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

function createWindow() {
  const iconPath = path.join(__dirname, '../assets/logo.jpg');
  const shouldShow = !startHidden;
  startHidden = false;

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
    show: shouldShow,
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
          'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAuSURBVHgB7cxBEAMACAIwzV/1b2sF9iABtTzZpA4sAR4eHh4eHh4eHh4eHh5+wwM7uQNq1mJz3AAAAABJRU5ErkJggg==',
          'base64'
        )
      );

  tray = new Tray(icon);
  const startupStatus = startupManager?.getStatus() || { supported: false, enabled: false };
  const contextMenu = Menu.buildFromTemplate([
    { label: `AtrisTracker v${app.getVersion()}`, enabled: false },
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
      label: 'Her Zaman Üstte',
      type: 'checkbox',
      checked: alwaysOnTopState,
      click: (menuItem) => {
        alwaysOnTopState = menuItem.checked;
        if (mainWindow) mainWindow.setAlwaysOnTop(alwaysOnTopState);
      },
    },
    {
      label: 'Bilgisayar açıldığında başlat',
      type: 'checkbox',
      checked: startupStatus.enabled,
      enabled: startupStatus.supported,
      click: (menuItem) => {
        if (!startupManager) return;
        try {
          const status = startupManager.setEnabled(menuItem.checked);
          menuItem.checked = status.enabled;
        } catch (error) {
          console.error('Windows startup setting failed:', error);
          menuItem.checked = !menuItem.checked;
        }
      },
    },
    {
      label: 'Göster / Gizle',
      click: () => {
        if (!mainWindow) return;
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

  tray.setToolTip(`AtrisTracker v${app.getVersion()} — AI CLI Usage Tracker`);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'ai_usage_tracker.db');
  db = new UsageDatabase(dbPath);
  await db.init();
  scanner = new CLIScanner(db);
  antigravityIntegration = new AntigravityIntegration();
  startupManager = new StartupManager(app);

  // v1.0.1 wrote a Windows statusLine command using `-File "..."`. Antigravity
  // preserves those quotes as part of the -File argument, so repair that legacy
  // integration automatically before the first quota scan. A genuine malformed
  // user settings file is never overwritten here.
  try {
    antigravityIntegration.repairIfNeeded();
  } catch (error) {
    console.warn('Antigravity telemetry bridge repair skipped:', error.message);
  }

  await scanner.scanAll();
  createWindow();
  createTray();

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

ipcMain.handle('get-latest-usage', (event, tool) => {
  return db ? db.getLatestSnapshot(tool) : null;
});

ipcMain.handle('scan-usage', async () => {
  if (!scanner) return null;
  return scanner.scanAll();
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

ipcMain.handle('get-antigravity-integration-status', () => {
  return antigravityIntegration ? antigravityIntegration.getStatus() : null;
});

ipcMain.handle('enable-antigravity-integration', async () => {
  if (!antigravityIntegration) return null;
  const status = antigravityIntegration.enable();
  if (scanner) await scanner.scanAll();
  return status;
});

ipcMain.handle('disable-antigravity-integration', () => {
  return antigravityIntegration ? antigravityIntegration.disable() : null;
});

ipcMain.handle('get-startup-status', () => {
  return startupManager ? startupManager.getStatus() : { supported: false, enabled: false };
});

ipcMain.handle('set-startup-enabled', (event, enabled) => {
  return startupManager
    ? startupManager.setEnabled(Boolean(enabled))
    : { supported: false, enabled: false };
});

ipcMain.handle('toggle-always-on-top', () => {
  if (mainWindow) {
    alwaysOnTopState = !alwaysOnTopState;
    mainWindow.setAlwaysOnTop(alwaysOnTopState);
    return alwaysOnTopState;
  }
  return false;
});

ipcMain.handle('is-always-on-top', () => alwaysOnTopState);

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (pollingInterval) clearInterval(pollingInterval);
    app.quit();
  }
});
