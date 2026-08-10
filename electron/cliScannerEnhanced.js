const path = require('path');
const CLIScanner = require('./cliScanner');
const AntigravityLocalQuotaProbe = require('./antigravityLocalQuota');
const CodexAppServerQuota = require('./codexAppServer');
const ClaudeCredentialsResolver = require('./claudeCredentials');

class EnhancedCLIScanner extends CLIScanner {
  constructor(db, options = {}) {
    super(db);
    this.antigravityLocalQuota =
      options.antigravityLocalQuota || new AntigravityLocalQuotaProbe(options.antigravityProbeOptions);
    this.codexAppServer =
      options.codexAppServer || new CodexAppServerQuota(options.codexAppServerOptions);
    this.claudeCredentials =
      options.claudeCredentials || new ClaudeCredentialsResolver(options.claudeCredentialOptions);
  }

  snapshotWindow(snapshot, kind) {
    if (!snapshot) return null;
    if (kind === '5h') {
      const usedPercent = this.toFiniteNumber(
        snapshot.rolling_5h_percent ?? snapshot.usage_percent
      );
      const resetAt = snapshot.next_5h_reset_at || null;
      return usedPercent === null && !resetAt ? null : { usedPercent, resetAt };
    }

    const usedPercent = this.toFiniteNumber(
      snapshot.weekly_usage_percent ?? snapshot.weekly_usage_count
    );
    const resetAt = snapshot.weekly_reset_at || null;
    return usedPercent === null && !resetAt ? null : { usedPercent, resetAt };
  }

  async scanAntigravity() {
    const detectedEmail = this.detectAntigravityEmail();
    let local = null;
    let localError = null;

    try {
      local = await this.antigravityLocalQuota.fetch();
    } catch (error) {
      localError = error;
    }

    // The local quota summary is the closest machine-readable equivalent of
    // Antigravity's /quota panel. It may still omit one cadence while the CLI
    // is initializing, so use statusline telemetry only to fill missing fields.
    if (local?.fiveHour || local?.weekly) {
      const localEmail = local.accountEmail || detectedEmail;
      let fallback = null;
      if (!local.fiveHour || !local.weekly) {
        try {
          fallback = await super.scanAntigravity();
        } catch {
          fallback = null;
        }
      }

      const fallbackEmail = fallback?.account_email || null;
      const fallbackMatches =
        !localEmail || !fallbackEmail || this.sameEmail(localEmail, fallbackEmail);
      const fiveHour =
        local.fiveHour || (fallbackMatches ? this.snapshotWindow(fallback, '5h') : null);
      const weekly =
        local.weekly || (fallbackMatches ? this.snapshotWindow(fallback, 'weekly') : null);
      const accountEmail = localEmail || fallbackEmail;
      const result = this.createSnapshot(
        'antigravity',
        accountEmail,
        fiveHour,
        weekly,
        local.source || 'antigravity-local:RetrieveUserQuotaSummary'
      );
      result.scan_status = this.hasObservedQuota(result) ? 'live' : 'unavailable';
      return result;
    }

    const fallback = await super.scanAntigravity();
    if (localError && !this.hasObservedQuota(fallback)) {
      fallback.error = `${fallback.error || 'Antigravity quota verisi alınamadı'}; yerel quota servisi: ${localError.message}`;
    }
    return fallback;
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
      const accountEmail = appServer.accountEmail || detectedEmail;
      const result = this.createSnapshot(
        'codex',
        accountEmail,
        appServer.fiveHour,
        appServer.weekly,
        appServer.source || 'codex-app-server:account/rateLimits/read'
      );
      result.scan_status = this.hasObservedQuota(result) ? 'live' : 'unavailable';
      return result;
    }

    // Older Codex builds do not expose app-server rate limits. Keep the JSONL
    // session parser as a compatibility fallback instead of making it primary.
    const fallback = await super.scanCodex();
    if (appServer?.accountEmail && !fallback.account_email) {
      fallback.account_email = appServer.accountEmail;
    }
    if (appServerError && !this.hasObservedQuota(fallback)) {
      fallback.error = `${fallback.error || 'Codex kota verisi alınamadı'}; app-server: ${appServerError.message}`;
    }
    return fallback;
  }

  detectClaudeEmail() {
    return this.claudeCredentials.detectEmail() || super.detectClaudeEmail();
  }

  readClaudeOAuthToken() {
    // Never persist or log the token. The resolver only returns it in-memory to
    // the existing Anthropic usage request made by the base scanner.
    return this.claudeCredentials.readOAuthToken() || super.readClaudeOAuthToken();
  }
}

module.exports = EnhancedCLIScanner;
