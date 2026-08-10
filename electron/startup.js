class StartupManager {
  constructor(app, options = {}) {
    this.app = app;
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.execPath = options.execPath || process.execPath;
  }

  isSupported() {
    return this.platform === 'win32' && Boolean(this.app?.isPackaged);
  }

  getLaunchPath() {
    // electron-builder portable apps run the real Electron process from a
    // temporary extraction directory. The wrapper path is the stable path
    // Windows must launch on sign-in.
    return this.env.PORTABLE_EXECUTABLE_FILE || this.execPath;
  }

  getLaunchArgs() {
    return ['--startup'];
  }

  getStatus() {
    if (!this.isSupported()) {
      return {
        supported: false,
        enabled: false,
        path: this.getLaunchPath(),
      };
    }

    const path = this.getLaunchPath();
    const args = this.getLaunchArgs();
    const settings = this.app.getLoginItemSettings({ path, args });
    return {
      supported: true,
      enabled: Boolean(settings.openAtLogin),
      executableWillLaunchAtLogin: Boolean(settings.executableWillLaunchAtLogin),
      path,
    };
  }

  setEnabled(enabled) {
    if (!this.isSupported()) return this.getStatus();

    const openAtLogin = Boolean(enabled);
    const path = this.getLaunchPath();
    const args = this.getLaunchArgs();
    const settings = {
      openAtLogin,
      path,
      args,
      name: 'AtrisTracker',
    };

    // When enabling, explicitly re-approve the entry in Windows Startup Apps.
    // When disabling, openAtLogin=false removes the run item instead of leaving
    // behind a disabled registry entry.
    if (openAtLogin) settings.enabled = true;

    this.app.setLoginItemSettings(settings);
    return this.getStatus();
  }
}

module.exports = StartupManager;
