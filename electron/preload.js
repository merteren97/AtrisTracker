const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getLatestUsage: (tool) => ipcRenderer.invoke('get-latest-usage', tool),
  scanUsage: () => ipcRenderer.invoke('scan-usage'),
  getUsageHistory: (tool, limit) => ipcRenderer.invoke('get-usage-history', tool, limit),
  getActiveAccounts: () => ipcRenderer.invoke('get-active-accounts'),
  
  // Multi-Account API
  getAccountsByTool: (tool) => ipcRenderer.invoke('get-accounts-by-tool', tool),
  getSnapshotByAccount: (tool, email) => ipcRenderer.invoke('get-snapshot-by-account', tool, email),
  getUsageHistoryByAccount: (tool, email, limit) => ipcRenderer.invoke('get-usage-history-by-account', tool, email, limit),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  isAlwaysOnTop: () => ipcRenderer.invoke('is-always-on-top'),
});
