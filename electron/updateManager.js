class UpdateManager {
  constructor(app, Notification, options = {}) {
    this.app = app;
    this.Notification = Notification;
    this.updater = options.updater || require('electron-updater').autoUpdater;
    this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    this.lastNotifiedVersion = null;
    this.notifyNextCheck = false;
    this.status = {
      currentVersion: app.getVersion(),
      latestVersion: null,
      updateAvailable: false,
      stage: 'idle',
      percent: 0,
      checkedAt: null,
      error: null,
    };
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.autoRunAppAfterInstall = true;
    this.updater.allowPrerelease = false;
    this.bindEvents();
  }

  bindEvents() {
    this.updater.on('checking-for-update', () => this.setStatus({ stage: 'checking', error: null }));
    this.updater.on('update-available', (info) => {
      const latestVersion = info?.version || null;
      this.setStatus({ latestVersion, updateAvailable: true, stage: 'available', percent: 0, checkedAt: new Date().toISOString(), error: null });
      if (this.notifyNextCheck) this.notifyUpdate(latestVersion);
      this.notifyNextCheck = false;
    });
    this.updater.on('update-not-available', (info) => {
      this.setStatus({ latestVersion: info?.version || this.app.getVersion(), updateAvailable: false, stage: 'current', percent: 0, checkedAt: new Date().toISOString(), error: null });
      this.notifyNextCheck = false;
    });
    this.updater.on('download-progress', (progress) => {
      this.setStatus({ stage: 'downloading', percent: Math.max(0, Math.min(100, Number(progress?.percent) || 0)), error: null });
    });
    this.updater.on('update-downloaded', (info) => {
      this.setStatus({ latestVersion: info?.version || this.status.latestVersion, updateAvailable: true, stage: 'downloaded', percent: 100, error: null });
    });
    this.updater.on('error', (error) => {
      this.setStatus({ stage: 'error', error: error?.message || String(error) });
      this.notifyNextCheck = false;
    });
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch, currentVersion: this.app.getVersion() };
    this.onStatus(this.getStatus());
    return this.getStatus();
  }

  getStatus() {
    return { ...this.status };
  }

  async check(options = {}) {
    if (this.app.isPackaged === false) {
      return this.setStatus({ stage: 'unavailable', checkedAt: new Date().toISOString(), error: 'Güncelleme kontrolü yalnızca paketlenmiş AtrisTracker sürümünde kullanılabilir.' });
    }
    this.notifyNextCheck = options.notify !== false;
    this.setStatus({ stage: 'checking', error: null });
    try {
      const result = await this.updater.checkForUpdates();
      const version = result?.updateInfo?.version || null;
      if (version && this.status.stage === 'checking') {
        const available = this.compareVersions(version, this.app.getVersion()) > 0;
        this.setStatus({ latestVersion: version, updateAvailable: available, stage: available ? 'available' : 'current', checkedAt: new Date().toISOString(), error: null });
        if (available && this.notifyNextCheck) this.notifyUpdate(version);
        this.notifyNextCheck = false;
      }
      return this.getStatus();
    } catch (error) {
      return this.setStatus({ stage: 'error', checkedAt: new Date().toISOString(), error: error?.message || String(error) });
    }
  }

  async download() {
    if (!this.status.updateAvailable) throw new Error('İndirilecek yeni sürüm bulunamadı.');
    if (this.status.stage === 'downloaded') return this.getStatus();
    this.setStatus({ stage: 'downloading', percent: 0, error: null });
    try {
      await this.updater.downloadUpdate();
      return this.getStatus();
    } catch (error) {
      return this.setStatus({ stage: 'error', error: error?.message || String(error) });
    }
  }

  install() {
    if (this.status.stage !== 'downloaded') throw new Error('Güncelleme henüz indirilmedi.');
    this.updater.quitAndInstall(false, true);
    return this.getStatus();
  }

  notifyUpdate(version) {
    if (!version || this.lastNotifiedVersion === version || !this.Notification?.isSupported?.()) return;
    new this.Notification({
      title: 'AtrisTracker güncellemesi hazır',
      body: `v${version} kullanılabilir. Ayarlar > Güncellemeler bölümünden istediğin zaman yükseltebilirsin.`,
      silent: false,
    }).show();
    this.lastNotifiedVersion = version;
  }

  compareVersions(left, right) {
    const parse = (value) => String(value || '').replace(/^v/i, '').split('.').slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] > b[index]) return 1;
      if (a[index] < b[index]) return -1;
    }
    return 0;
  }
}

module.exports = UpdateManager;
