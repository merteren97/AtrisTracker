const path = require('path');
const CLIScanner = require('./cliScanner');
const AntigravityLocalQuotaProbe = require('./antigravityLocalQuota');
const CodexAppServerQuota = require('./codexAppServer');
const ClaudeCredentialsResolver = require('./claudeCredentials');

class EnhancedCLIScanner extends CLIScanner {
  constructor(db, options = {}) {
    super(db);
    this.antigravityLocalQuota = options.antigravityLocalQuota || new AntigravityLocalQuotaProbe(options.antigravityProbeOptions);
    this.codexAppServer = options.codexAppServer || new CodexAppServerQuota(options.codexAppServerOptions);
    this.claudeCredentials = options.claudeCredentials || new ClaudeCredentialsResolver(options.claudeCredentialOptions);
  }

  async scanAntigravity() {
    const detectedEmail = this.detectAntigravityEmail();
    try {
      const local = await this.antigravityLocalQuota.fetch();
      if (local?.fiveHour || local?.weekly) {
        const result = this.createSnapshot(
          'antigravity',
          local.accountEmail || detectedEmail,
          local.fiveHour,
          local.weekly,
          local.source || 'antigravity-local:RetrieveUserQuotaSummary'
        );
        result.scan_status = this.hasObservedQuota(result) ? 'live' : 'unavailable';
        return result;
      }
      const result = this.createSnapshot('antigravity', detectedEmail, null, null, 'antigravity-local:quota-service');
      result.error = detectedEmail
        ? 'Antigravity hesabı bulundu; canlı quota servisi çalışmıyor. Antigravity CLI/IDE açıkken yenile.'
        : 'Antigravity quota servisi bulunamadı. Antigravity CLI/IDE açıkken yenile.';
      return result;
    } catch (error) {
      const result = this.createSnapshot('antigravity', detectedEmail, null, null, 'antigravity-local:quota-service');
      result.error = `Antigravity yerel quota servisi okunamadı: ${error.message}`;
      return result;
    }
  }

  async scanCodex() {
    let appServer = null;
    let appServerError = null;
    try {
      appServer = await this.codexAppServer.fetch();
    } catch (error) {
      appServerError = error;
    }

    const authData = this.readJson(path.join(this.userHome, '.codex', 'auth.json'));
    const detectedEmail = this.detectCodexAccount(authData);
    if (appServer?.fiveHour || appServer?.weekly) {
      const result = this.createSnapshot(
        'codex',
        appServer.accountEmail || detectedEmail,
        appServer.fiveHour,
        appServer.weekly,
        appServer.source || 'codex-app-server:account/rateLimits/read'
      );
      result.scan_status = this.hasObservedQuota(result) ? 'live' : 'unavailable';
      return result;
    }

    const fallback = await super.scanCodex();
    if (appServer?.accountEmail && !fallback.account_email) fallback.account_email = appServer.accountEmail;
    if (appServerError && !this.hasObservedQuota(fallback)) {
      fallback.error = `${fallback.error || 'Codex kota verisi alınamadı'}; app-server: ${appServerError.message}`;
    }
    if (!this.hasObservedQuota(fallback) && !fallback.error) {
      fallback.error = 'Codex hesabı bulundu ancak app-server veya session kayıtlarında rate limit verisi yok';
    }
    return fallback;
  }

  detectClaudeEmail() {
    return this.claudeCredentials.detectEmail() || super.detectClaudeEmail();
  }

  readClaudeOAuthToken() {
    return this.claudeCredentials.readOAuthToken() || super.readClaudeOAuthToken();
  }

  async scanClaudeCode() {
    const email = this.detectClaudeEmail();
    const token = this.readClaudeOAuthToken();
    if (!token) {
      const result = this.createSnapshot('claudecode', email, null, null, 'claude-oauth-usage');
      result.error = 'Claude OAuth kimliği bulunamadı (env/config/macOS Keychain kontrol edildi)';
      return result;
    }
    try {
      const payload = await this.fetchJson('https://api.anthropic.com/api/oauth/usage', {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
        Accept: 'application/json',
        'User-Agent': 'AtrisTracker/1.0',
      });
      const { fiveHour, weekly } = this.parseClaudeUsage(payload);
      const result = this.createSnapshot('claudecode', email, fiveHour, weekly, 'claude-oauth:/api/oauth/usage');
      if (!this.hasObservedQuota(result)) result.error = 'Claude usage endpoint yanıtında 5h/weekly quota alanı bulunamadı';
      return result;
    } catch (error) {
      const result = this.createSnapshot('claudecode', email, null, null, 'claude-oauth-usage');
      result.error = error.message;
      return result;
    }
  }
}

module.exports = EnhancedCLIScanner;
