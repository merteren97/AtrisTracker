const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getLatestUsage: (tool) => ipcRenderer.invoke('get-latest-usage', tool),
  scanUsage: () => ipcRenderer.invoke('scan-usage'),
  getUsageHistory: (tool, limit) => ipcRenderer.invoke('get-usage-history', tool, limit),
  getActiveAccounts: () => ipcRenderer.invoke('get-active-accounts'),

  // Multi-Account API
  getAccountsByTool: (tool) => ipcRenderer.invoke('get-accounts-by-tool', tool),
  getSnapshotByAccount: (tool, email) => ipcRenderer.invoke('get-snapshot-by-account', tool, email),
  getUsageHistoryByAccount: (tool, email, limit) =>
    ipcRenderer.invoke('get-usage-history-by-account', tool, email, limit),

  // Antigravity telemetry integration
  getAntigravityIntegrationStatus: () =>
    ipcRenderer.invoke('get-antigravity-integration-status'),
  enableAntigravityIntegration: () =>
    ipcRenderer.invoke('enable-antigravity-integration'),
  disableAntigravityIntegration: () =>
    ipcRenderer.invoke('disable-antigravity-integration'),

  // Startup controls
  getStartupStatus: () => ipcRenderer.invoke('get-startup-status'),
  setStartupEnabled: (enabled) => ipcRenderer.invoke('set-startup-enabled', Boolean(enabled)),

  // User-controlled update checks. Checking can be automatic, downloading/installing is not.
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openUpdate: () => ipcRenderer.invoke('open-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },

  onUsageUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('usage-updated', listener);
    return () => ipcRenderer.removeListener('usage-updated', listener);
  },

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  isAlwaysOnTop: () => ipcRenderer.invoke('is-always-on-top'),
});
