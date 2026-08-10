const CLIScanner = require('./cliScanner');
const AntigravityLocalQuotaProbe = require('./antigravityLocalQuota');

class EnhancedCLIScanner extends CLIScanner {
  constructor(db, options = {}) {
    super(db);
    this.antigravityLocalQuota =
      options.antigravityLocalQuota || new AntigravityLocalQuotaProbe(options.antigravityProbeOptions);
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
}

module.exports = EnhancedCLIScanner;
