const https = require('https');

class UpdateManager {
  constructor(app, shell, Notification, options = {}) {
    this.app = app;
    this.shell = shell;
    this.Notification = Notification;
    this.owner = options.owner || 'merteren97';
    this.repo = options.repo || 'AtrisTracker';
    this.timeoutMs = options.timeoutMs || 8000;
    this.latestStatus = null;
    this.lastNotifiedVersion = null;
  }

  async check(options = {}) {
    const notify = options.notify !== false;
    const currentVersion = this.app.getVersion();
    try {
      const release = await this.fetchLatestRelease();
      const latestVersion = this.normalizeVersion(release?.tag_name || release?.name || '');
      const updateAvailable = Boolean(
        latestVersion && this.compareVersions(latestVersion, currentVersion) > 0
      );
      const asset = this.pickPreferredAsset(release);

      this.latestStatus = {
        currentVersion,
        latestVersion: latestVersion || null,
        updateAvailable,
        releaseName: release?.name || release?.tag_name || null,
        releaseUrl: release?.html_url || null,
        downloadUrl: asset?.browser_download_url || release?.html_url || null,
        assetName: asset?.name || null,
        publishedAt: release?.published_at || null,
        checkedAt: new Date().toISOString(),
        error: null,
      };

      if (notify && updateAvailable) this.notifyUpdate(this.latestStatus);
      return this.latestStatus;
    } catch (error) {
      this.latestStatus = {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseName: null,
        releaseUrl: null,
        downloadUrl: null,
        assetName: null,
        publishedAt: null,
        checkedAt: new Date().toISOString(),
        error: error.message,
      };
      return this.latestStatus;
    }
  }

  getStatus() {
    return (
      this.latestStatus || {
        currentVersion: this.app.getVersion(),
        latestVersion: null,
        updateAvailable: false,
        checkedAt: null,
        error: null,
      }
    );
  }

  async openUpdate() {
    const status = this.latestStatus || (await this.check({ notify: false }));
    const target = status?.downloadUrl || status?.releaseUrl;
    if (!target) throw new Error('Açılabilir bir güncelleme bağlantısı bulunamadı');
    await this.shell.openExternal(target);
    return status;
  }

  fetchLatestRelease() {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`;
    return new Promise((resolve, reject) => {
      const request = https.get(
        url,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': `AtrisTracker/${this.app.getVersion()}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2 * 1024 * 1024) {
              request.destroy(new Error('Güncelleme yanıtı çok büyük'));
            }
          });
          response.on('end', () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`GitHub release kontrolü HTTP ${response.statusCode}`));
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error('GitHub release yanıtı geçerli JSON değil'));
            }
          });
        }
      );
      request.setTimeout(this.timeoutMs, () => {
        request.destroy(new Error('Güncelleme kontrolü zaman aşımına uğradı'));
      });
      request.on('error', reject);
    });
  }

  pickPreferredAsset(release) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    if (!assets.length) return null;
    const names = assets.map((asset) => ({ asset, name: String(asset?.name || '').toLowerCase() }));

    if (process.platform === 'win32') {
      const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
      const preferred = portable
        ? names.find(({ name }) => name.includes('portable') && name.endsWith('.exe'))
        : names.find(({ name }) => name.includes('setup') && name.endsWith('.exe'));
      return preferred?.asset || names.find(({ name }) => name.endsWith('.exe'))?.asset || null;
    }

    if (process.platform === 'linux') {
      const preferredExtension = process.env.APPIMAGE ? '.appimage' : '.deb';
      return (
        names.find(({ name }) => name.endsWith(preferredExtension))?.asset ||
        names.find(({ name }) => name.endsWith('.appimage') || name.endsWith('.deb'))?.asset ||
        null
      );
    }

    return assets[0] || null;
  }

  notifyUpdate(status) {
    if (!status?.latestVersion || this.lastNotifiedVersion === status.latestVersion) return;
    if (!this.Notification?.isSupported?.()) return;

    const notification = new this.Notification({
      title: 'AtrisTracker güncellemesi hazır',
      body: `v${status.latestVersion} kullanılabilir. Güncellemek için bildirime tıklayın.`,
      silent: false,
    });
    notification.on('click', () => {
      this.openUpdate().catch((error) => console.warn('Update link open failed:', error.message));
    });
    notification.show();
    this.lastNotifiedVersion = status.latestVersion;
  }

  normalizeVersion(value) {
    const match = String(value || '').trim().match(/v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i);
    return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : null;
  }

  compareVersions(left, right) {
    const parse = (value) =>
      String(value || '')
        .replace(/^v/i, '')
        .split('.')
        .slice(0, 3)
        .map((part) => Number.parseInt(part, 10) || 0);
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
