const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getLatestUsage: (tool) => ipcRenderer.invoke('get-latest-usage', tool),
  scanUsage: () => ipcRenderer.invoke('scan-usage'),
  getScanStatus: () => ipcRenderer.invoke('get-scan-status'),
  getUsageHistory: (tool, limit) => ipcRenderer.invoke('get-usage-history', tool, limit),
  getActiveAccounts: () => ipcRenderer.invoke('get-active-accounts'),
  getAccountsByTool: (tool) => ipcRenderer.invoke('get-accounts-by-tool', tool),
  getSnapshotByAccount: (tool, email) => ipcRenderer.invoke('get-snapshot-by-account', tool, email),
  deleteAccount: (tool, email) => ipcRenderer.invoke('delete-account', tool, email),
  getUsageHistoryByAccount: (tool, email, limit) => ipcRenderer.invoke('get-usage-history-by-account', tool, email, limit),
  getStartupStatus: () => ipcRenderer.invoke('get-startup-status'),
  setStartupEnabled: (enabled) => ipcRenderer.invoke('set-startup-enabled', Boolean(enabled)),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
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
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  isAlwaysOnTop: () => ipcRenderer.invoke('is-always-on-top'),
});
