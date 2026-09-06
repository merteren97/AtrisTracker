const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');
const UsageDatabase = require('./db');
const CLIScanner = require('./cliScannerEnhanced');
const AntigravityIntegration = require('./antigravityIntegration');
const StartupManager = require('./startup');
const UpdateManager = require('./updateManager');

const APP_ID = 'com.atristracker.app';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let mainWindow = null;
let tray = null;
let db = null;
let scanner = null;
let startupManager = null;
let updateManager = null;
let lastScanResult = null;
let pollingInterval = null;
let updatePollingInterval = null;
let alwaysOnTopState = true;
let startHidden = process.argv.includes('--startup');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Only one instance may run: launching again focuses the existing window
// instead of opening a second tracker writing to the same database.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', status);
}

function createWindow() {
  const iconPath = path.join(__dirname, '../assets/logo.png');
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
  if (fs.existsSync(distPath)) mainWindow.loadFile(distPath);
  else if (isDev) mainWindow.loadURL('http://localhost:5173');
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function runUsageScan() {
  if (!scanner) return null;
  lastScanResult = await scanner.scanAll();
  return lastScanResult;
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/logo.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(icon);
  const startupStatus = startupManager?.getStatus() || { supported: false, enabled: false };
  const contextMenu = Menu.buildFromTemplate([
    { label: `AtrisTracker v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Yenile / Tara',
      click: async () => {
        await runUsageScan();
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('usage-updated');
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
      label: 'Güncellemeleri Kontrol Et',
      click: async () => {
        if (updateManager) await updateManager.check({ notify: true });
      },
    },
    {
      label: 'Göster / Gizle',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else { mainWindow.show(); mainWindow.focus(); }
      },
    },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip(`AtrisTracker v${app.getVersion()} — AI CLI Usage Tracker`);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  const dbPath = path.join(app.getPath('userData'), 'ai_usage_tracker.db');
  db = new UsageDatabase(dbPath);
  await db.init();
  scanner = new CLIScanner(db);
  startupManager = new StartupManager(app);

  try {
    const legacyIntegration = new AntigravityIntegration();
    if (legacyIntegration.getStatus()?.enabled) legacyIntegration.disable();
  } catch (error) {
    console.warn('Legacy Antigravity telemetry cleanup skipped:', error.message);
  }

  await runUsageScan();
  createWindow();
  createTray();

  updateManager = new UpdateManager(app, Notification, { onStatus: sendUpdateStatus });
  updateManager.check({ notify: true }).catch((error) => console.warn('Update check failed:', error.message));
  updatePollingInterval = setInterval(() => {
    updateManager.check({ notify: true }).catch((error) => console.warn('Update check failed:', error.message));
  }, UPDATE_CHECK_INTERVAL_MS);

  pollingInterval = setInterval(async () => {
    await runUsageScan();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('usage-updated');
  }, 2 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('get-latest-usage', (_event, tool) => (db ? db.getLatestSnapshot(tool) : null));
ipcMain.handle('scan-usage', () => runUsageScan());
ipcMain.handle('get-scan-status', () => lastScanResult);
ipcMain.handle('get-usage-history', (_event, tool, limit) => (db ? db.getUsageHistory(tool, limit) : []));
ipcMain.handle('get-active-accounts', () => (db ? db.getActiveAccounts() : []));
ipcMain.handle('get-accounts-by-tool', (_event, tool) => (db ? db.getAccountsByTool(tool) : []));
ipcMain.handle('get-snapshot-by-account', (_event, tool, email) => db ? db.getLatestSnapshotByAccount(tool, email) : null);
ipcMain.handle('delete-account', (_event, tool, email) => (db ? db.deleteAccount(tool, email) : false));
ipcMain.handle('get-usage-history-by-account', (_event, tool, email, limit) => db ? db.getUsageHistoryByAccount(tool, email, limit) : []);
ipcMain.handle('get-weekly-usage-trend', (_event, tool, email, days) => db ? db.getWeeklyUsageTrend(tool, email, days) : []);
ipcMain.handle('get-startup-status', () => startupManager ? startupManager.getStatus() : { supported: false, enabled: false });
ipcMain.handle('set-startup-enabled', (_event, enabled) => startupManager ? startupManager.setEnabled(Boolean(enabled)) : { supported: false, enabled: false });
ipcMain.handle('get-update-status', () => updateManager ? updateManager.getStatus() : null);
ipcMain.handle('check-for-updates', () => updateManager ? updateManager.check({ notify: false }) : null);
ipcMain.handle('download-update', () => updateManager ? updateManager.download() : null);
ipcMain.handle('install-update', () => updateManager ? updateManager.install() : null);
ipcMain.handle('toggle-always-on-top', () => {
  if (!mainWindow) return false;
  alwaysOnTopState = !alwaysOnTopState;
  mainWindow.setAlwaysOnTop(alwaysOnTopState);
  return alwaysOnTopState;
});
ipcMain.handle('is-always-on-top', () => alwaysOnTopState);
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.hide(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (pollingInterval) clearInterval(pollingInterval);
    if (updatePollingInterval) clearInterval(updatePollingInterval);
    app.quit();
  }
});
