const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const FIVE_HOURS_MINUTES = 5 * 60;
const ONE_WEEK_MINUTES = 7 * 24 * 60;
const ANTIGRAVITY_TELEMETRY_MAX_AGE_MS = 10 * 60 * 1000;

class CLIScanner {
  constructor(db) {
    this.db = db;
    this.userHome = os.homedir();
  }

  async scanAll() {
    const scans = [
      ['antigravity', () => this.scanAntigravity()],
      ['codex', () => this.scanCodex()],
      ['claude', () => this.scanClaudeCode()],
    ];
    const results = {};

    for (const [key, scan] of scans) {
      try {
        const result = await scan();
        if (result?.account_email && this.hasObservedQuota(result)) {
          this.db.addSnapshot(result);
        } else if (result?.account_email) {
          // Account discovery and quota discovery are intentionally separate.
          // A new login must be remembered even when quota telemetry has not
          // arrived yet, but missing data must never become a fake zero snapshot.
          this.db.saveAccount(result.tool, result.account_email, true);
        }
        results[key] = result;
      } catch (error) {
        console.warn(`${key} usage scan failed:`, error.message);
        results[key] = {
          tool: key === 'claude' ? 'claudecode' : key,
          scan_status: 'unavailable',
          error: error.message,
        };
      }
    }

    return { ...results, timestamp: new Date().toISOString() };
  }

  hasObservedQuota(snapshot) {
    return (
      this.toFiniteNumber(snapshot?.rolling_5h_percent) !== null ||
      this.toFiniteNumber(snapshot?.weekly_usage_percent) !== null ||
      this.toFiniteNumber(snapshot?.weekly_usage_count) !== null
    );
  }

  readJson(filePath) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  readRecentJson(filePath, maxAgeMs) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const stat = fs.statSync(filePath);
      if (Date.now() - stat.mtimeMs > maxAgeMs) return null;
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { payload, observedAtMs: stat.mtimeMs };
    } catch {
      return null;
    }
  }

  decodeJWT(token) {
    try {
      if (!token || typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
      return JSON.parse(Buffer.from(normalized + padding, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }

  findEmail(value) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const preferredKeys = [
      'email',
      'emailAddress',
      'email_address',
      'accountEmail',
      'account_email',
      'active',
    ];
    const visited = new Set();

    const walk = (node, depth = 0) => {
      if (depth > 8 || node === null || node === undefined) return null;
      if (typeof node === 'string') {
        const text = node.trim();
        return emailPattern.test(text) ? text : null;
      }
      if (typeof node !== 'object' || visited.has(node)) return null;
      visited.add(node);

      for (const key of preferredKeys) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
          const hit = walk(node[key], depth + 1);
          if (hit) return hit;
        }
      }
      for (const child of Object.values(node)) {
        const hit = walk(child, depth + 1);
        if (hit) return hit;
      }
      return null;
    };

    return walk(value);
  }

  toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  clampPercent(value) {
    const number = this.toFiniteNumber(value);
    if (number === null) return null;
    return Math.round(Math.max(0, Math.min(100, number)) * 10) / 10;
  }

  normalizeReset(value) {
    if (value === null || value === undefined || value === '') return null;
    let date;
    if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
      const number = Number(value);
      date = new Date(number > 10_000_000_000 ? number : number * 1000);
    } else {
      date = new Date(value);
    }
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  createSnapshot(tool, accountEmail, fiveHour, weekly, source) {
    const fiveHourPercent = this.clampPercent(fiveHour?.usedPercent);
    const weeklyPercent = this.clampPercent(weekly?.usedPercent);
    return {
      tool,
      account_email: accountEmail || null,
      usage_percent: fiveHourPercent,
      limit_count: fiveHourPercent === null ? null : 100,
      used_count: fiveHourPercent,
      rolling_5h_percent: fiveHourPercent,
      next_5h_reset_at: this.normalizeReset(fiveHour?.resetAt),
      weekly_usage_count: weeklyPercent,
      weekly_usage_percent: weeklyPercent,
      weekly_reset_at: this.normalizeReset(weekly?.resetAt),
      source,
      scan_status: fiveHourPercent !== null || weeklyPercent !== null ? 'live' : 'unavailable',
    };
  }

  classifyWindow(context, windowMinutes) {
    const normalized = String(context || '').toLowerCase().replace(/[\s_-]+/g, ' ');
    if (
      windowMinutes === FIVE_HOURS_MINUTES ||
      /(^|\D)5\s*h(\D|$)/.test(normalized) ||
      normalized.includes('five hour') ||
      normalized.includes('5 hour')
    ) {
      return '5h';
    }
    if (
      windowMinutes === ONE_WEEK_MINUTES ||
      /(^|\D)7\s*d(\D|$)/.test(normalized) ||
      normalized.includes('seven day') ||
      normalized.includes('weekly') ||
      normalized.includes('week')
    ) {
      return 'weekly';
    }
    return null;
  }

  extractUsedPercent(node) {
    if (!node || typeof node !== 'object') return null;
    const directKeys = [
      'used_percent',
      'used_percentage',
      'percent_used',
      'usage_percent',
      'utilization',
      'utilisation',
    ];
    for (const key of directKeys) {
      const number = this.toFiniteNumber(node[key]);
      if (number !== null) return this.clampPercent(number);
    }

    for (const key of ['used_fraction', 'usage_fraction']) {
      const number = this.toFiniteNumber(node[key]);
      if (number !== null) return this.clampPercent(number * 100);
    }

    const remainingFraction = this.toFiniteNumber(
      node.remaining_fraction ?? node.remainingFraction
    );
    if (remainingFraction !== null) {
      return this.clampPercent((1 - remainingFraction) * 100);
    }

    const remainingPercent = this.toFiniteNumber(
      node.remaining_percent ?? node.remaining_percentage ?? node.percent_remaining
    );
    if (remainingPercent !== null) {
      return this.clampPercent(100 - remainingPercent);
    }
    return null;
  }

  extractResetAt(node, observedAtMs = Date.now()) {
    if (!node || typeof node !== 'object') return null;
    const absolute =
      node.reset_time ??
      node.resetTime ??
      node.reset_at ??
      node.resets_at ??
      node.resetAt ??
      null;
    const normalized = this.normalizeReset(absolute);
    if (normalized) return normalized;

    const seconds = this.toFiniteNumber(node.reset_in_seconds ?? node.resetInSeconds);
    if (seconds === null || seconds < 0) return null;
    return new Date(observedAtMs + seconds * 1000).toISOString();
  }

  collectQuotaWindows(payload, observedAtMs = Date.now()) {
    const candidates = [];
    const visited = new Set();

    const walk = (node, pathParts = [], depth = 0) => {
      if (depth > 12 || node === null || node === undefined) return;
      if (typeof node !== 'object' || visited.has(node)) return;
      visited.add(node);

      if (Array.isArray(node)) {
        node.forEach((child, index) => walk(child, [...pathParts, String(index)], depth + 1));
        return;
      }

      const windowMinutes = this.toFiniteNumber(
        node.window_minutes ?? node.windowMinutes ?? node.duration_minutes
      );
      const context = [
        ...pathParts,
        node.window,
        node.name,
        node.label,
        node.id,
        node.period,
        node.type,
      ]
        .filter(Boolean)
        .join(' ');
      const kind = this.classifyWindow(context, windowMinutes);
      if (kind) {
        const remainingFraction = this.toFiniteNumber(
          node.remaining_fraction ?? node.remainingFraction
        );
        const usedPercent = this.extractUsedPercent(node);
        const resetAt = this.extractResetAt(node, observedAtMs);

        // Antigravity can temporarily send a zeroed/absent quota object while
        // a subagent is active. A raw 0 remaining value without any reset
        // metadata is therefore not trusted as a real 100%-used quota.
        const suspiciousTransientZero = remainingFraction === 0 && !resetAt;
        if (!suspiciousTransientZero && (usedPercent !== null || resetAt !== null)) {
          candidates.push({ kind, usedPercent, resetAt, context });
        }
      }

      for (const [key, child] of Object.entries(node)) {
        walk(child, [...pathParts, key], depth + 1);
      }
    };

    walk(payload);
    return candidates;
  }

  selectTightestWindow(candidates, kind) {
    const matches = candidates.filter((candidate) => candidate.kind === kind);
    if (!matches.length) return null;
    return matches.sort((left, right) => {
      const leftPercent = left.usedPercent ?? -1;
      const rightPercent = right.usedPercent ?? -1;
      return rightPercent - leftPercent;
    })[0];
  }

  sameEmail(left, right) {
    if (!left || !right) return false;
    return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
  }

  detectAntigravityEmail() {
    const geminiDir = path.join(this.userHome, '.gemini');
    const accountFiles = [
      path.join(geminiDir, 'google_accounts.json'),
      path.join(geminiDir, 'antigravity-cli', 'google_accounts.json'),
    ];

    for (const accountFile of accountFiles) {
      const data = this.readJson(accountFile);
      if (!data) continue;
      const active = typeof data.active === 'string' ? data.active.trim() : null;
      if (active && active.includes('@')) return active;
      const found = this.findEmail(data);
      if (found) return found;
    }

    const logDir = path.join(geminiDir, 'antigravity-cli', 'log');
    try {
      if (!fs.existsSync(logDir)) return null;
      const files = fs
        .readdirSync(logDir)
        .filter((name) => name.endsWith('.log'))
        .map((name) => ({
          path: path.join(logDir, name),
          mtimeMs: fs.statSync(path.join(logDir, name)).mtimeMs,
        }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, 5);

      const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
      for (const file of files) {
        const content = fs.readFileSync(file.path, 'utf8');
        const authenticatedMatches = [
          ...content.matchAll(/authenticated successfully as\s+([^\s,;]+)/gi),
          ...content.matchAll(/applyAuthResult:\s*email=([^,\s]+)/gi),
        ];
        if (authenticatedMatches.length) {
          return authenticatedMatches[authenticatedMatches.length - 1][1];
        }
        const matches = content.match(emailRegex);
        if (matches?.length) return matches[matches.length - 1];
      }
    } catch (error) {
      console.warn('Antigravity account detection warning:', error.message);
    }
    return null;
  }

  async scanAntigravity() {
    const detectedEmail = this.detectAntigravityEmail();
    const cachePath = path.join(
      this.userHome,
      '.gemini',
      'antigravity-cli',
      'atris-statusline-state.json'
    );
    const telemetry = this.readRecentJson(cachePath, ANTIGRAVITY_TELEMETRY_MAX_AGE_MS);

    if (!telemetry) {
      const result = this.createSnapshot(
        'antigravity',
        detectedEmail,
        null,
        null,
        'antigravity-statusline'
      );
      result.error = 'Canlı Antigravity statusline telemetry henüz alınmadı';
      return result;
    }

    const payload = telemetry.payload;
    const telemetryEmail = this.findEmail(payload?.email) || this.findEmail(payload);
    const accountEmail = telemetryEmail || detectedEmail;

    // Never assign a recently cached payload to a different login that was
    // already observed in Antigravity's own auth state/logs.
    if (detectedEmail && telemetryEmail && !this.sameEmail(detectedEmail, telemetryEmail)) {
      const result = this.createSnapshot(
        'antigravity',
        detectedEmail,
        null,
        null,
        'antigravity-statusline'
      );
      result.error = 'Antigravity hesabı değişti; yeni hesaptan telemetry bekleniyor';
      return result;
    }

    const candidates = this.collectQuotaWindows(
      payload?.quota || {},
      telemetry.observedAtMs
    );
    const fiveHour = this.selectTightestWindow(candidates, '5h');
    const weekly = this.selectTightestWindow(candidates, 'weekly');
    const result = this.createSnapshot(
      'antigravity',
      accountEmail,
      fiveHour,
      weekly,
      'antigravity-statusline'
    );

    if (!this.hasObservedQuota(result)) {
      result.error = 'Statusline payload içinde güvenilir 5h/weekly quota bulunamadı';
    }
    return result;
  }

  listFilesRecursive(rootDir, predicate, maxDepth = 8) {
    const files = [];
    const walk = (dir, depth) => {
      if (depth > maxDepth || !fs.existsSync(dir)) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath, depth + 1);
        else if (entry.isFile() && predicate(fullPath, entry.name)) {
          try {
            files.push({ path: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs });
          } catch {
            // Ignore files that disappear during the scan.
          }
        }
      }
    };
    walk(rootDir, 0);
    return files;
  }

  readTailLines(filePath, maxBytes = 1024 * 1024) {
    const stat = fs.statSync(filePath);
    const length = Math.min(stat.size, maxBytes);
    const start = Math.max(0, stat.size - length);
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      let text = buffer.toString('utf8');
      if (start > 0) {
        const firstNewline = text.indexOf('\n');
        text = firstNewline >= 0 ? text.slice(firstNewline + 1) : '';
      }
      return text.split(/\r?\n/).filter(Boolean);
    } finally {
      fs.closeSync(fd);
    }
  }

  extractCodexRateLimits(lineObject) {
    if (!lineObject || typeof lineObject !== 'object') return null;
    const payload = lineObject.type === 'event_msg' ? lineObject.payload : lineObject;
    if (payload?.type !== 'token_count' || !payload.rate_limits) return null;
    return {
      timestamp: lineObject.timestamp || payload.timestamp || null,
      rateLimits: payload.rate_limits,
    };
  }

  mapCodexWindows(rateLimits) {
    const windows = [];
    const pushWindow = (window, label) => {
      if (!window || typeof window !== 'object') return;
      const minutes = this.toFiniteNumber(window.window_minutes ?? window.windowMinutes);
      windows.push({
        kind: this.classifyWindow(label, minutes),
        minutes,
        usedPercent: this.clampPercent(window.used_percent ?? window.usedPercentage),
        resetAt: window.resets_at ?? window.reset_at ?? window.resetAt ?? null,
      });
    };

    pushWindow(rateLimits.primary, 'primary');
    pushWindow(rateLimits.secondary, 'secondary');
    if (Array.isArray(rateLimits.windows)) {
      rateLimits.windows.forEach((window, index) => pushWindow(window, `window ${index}`));
    }

    let fiveHour = windows.find((window) => window.kind === '5h') || null;
    let weekly = windows.find((window) => window.kind === 'weekly') || null;

    if (!fiveHour && rateLimits.primary && !this.toFiniteNumber(rateLimits.primary.window_minutes)) {
      fiveHour = windows[0] || null;
    }
    if (!weekly && rateLimits.secondary && !this.toFiniteNumber(rateLimits.secondary.window_minutes)) {
      weekly = windows[1] || null;
    }
    return { fiveHour, weekly };
  }

  detectCodexAccount(authData) {
    const token = authData?.tokens?.id_token || authData?.id_token || null;
    const payload = this.decodeJWT(token);
    return this.findEmail(payload) || this.findEmail(authData);
  }

  async scanCodex() {
    const codexDir = path.join(this.userHome, '.codex');
    const authPath = path.join(codexDir, 'auth.json');
    const authData = this.readJson(authPath);
    const email = this.detectCodexAccount(authData);
    let authMtimeMs = 0;
    try {
      authMtimeMs = fs.existsSync(authPath) ? fs.statSync(authPath).mtimeMs : 0;
    } catch {
      authMtimeMs = 0;
    }

    const files = this.listFilesRecursive(
      path.join(codexDir, 'sessions'),
      (_filePath, name) => name.endsWith('.jsonl')
    )
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 30);

    for (const file of files) {
      let lines;
      try {
        lines = this.readTailLines(file.path);
      } catch {
        continue;
      }
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        let parsed;
        try {
          parsed = JSON.parse(lines[index]);
        } catch {
          continue;
        }
        const event = this.extractCodexRateLimits(parsed);
        if (!event) continue;

        const parsedEventTime = event.timestamp ? new Date(event.timestamp).getTime() : NaN;
        const eventTimeMs = Number.isFinite(parsedEventTime) ? parsedEventTime : file.mtimeMs;
        if (authMtimeMs && eventTimeMs < authMtimeMs - 5 * 60 * 1000) {
          continue;
        }

        const { fiveHour, weekly } = this.mapCodexWindows(event.rateLimits);
        return this.createSnapshot(
          'codex',
          email,
          fiveHour,
          weekly,
          'codex-session:token_count.rate_limits'
        );
      }
    }

    return this.createSnapshot('codex', email, null, null, 'codex-session');
  }

  detectClaudeEmail() {
    const files = [
      path.join(this.userHome, '.claude.json'),
      path.join(this.userHome, '.claude', '.credentials.json'),
      path.join(this.userHome, '.claude', 'credentials.json'),
    ];
    for (const file of files) {
      const email = this.findEmail(this.readJson(file));
      if (email) return email;
    }
    return null;
  }

  readClaudeOAuthToken() {
    const files = [
      path.join(this.userHome, '.claude', '.credentials.json'),
      path.join(this.userHome, '.claude', 'credentials.json'),
    ];
    for (const file of files) {
      const data = this.readJson(file);
      const token =
        data?.claudeAiOauth?.accessToken ||
        data?.claudeAiOAuth?.accessToken ||
        data?.oauth?.accessToken ||
        null;
      if (typeof token === 'string' && token.trim()) return token.trim();
    }
    return null;
  }

  fetchJson(url, headers = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, { headers }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 2 * 1024 * 1024) {
            request.destroy(new Error('Response too large'));
          }
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode} from usage endpoint`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Usage endpoint returned invalid JSON'));
          }
        });
      });
      request.setTimeout(timeoutMs, () => request.destroy(new Error('Usage endpoint timed out')));
      request.on('error', reject);
    });
  }

  parseClaudeUsage(payload) {
    if (!payload || typeof payload !== 'object') return { fiveHour: null, weekly: null };
    const fiveHourNode = payload.five_hour || payload.fiveHour || null;
    const weeklyNode = payload.seven_day || payload.sevenDay || payload.weekly || null;
    const mapNode = (node) => {
      if (!node || typeof node !== 'object') return null;
      return {
        usedPercent: this.clampPercent(
          node.utilization ?? node.used_percentage ?? node.used_percent
        ),
        resetAt: node.resets_at ?? node.reset_at ?? null,
      };
    };
    return { fiveHour: mapNode(fiveHourNode), weekly: mapNode(weeklyNode) };
  }

  async scanClaudeCode() {
    const email = this.detectClaudeEmail();
    const token = this.readClaudeOAuthToken();
    if (!token) {
      return this.createSnapshot('claudecode', email, null, null, 'claude-oauth-usage');
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
      return this.createSnapshot(
        'claudecode',
        email,
        fiveHour,
        weekly,
        'claude-oauth:/api/oauth/usage'
      );
    } catch (error) {
      const result = this.createSnapshot('claudecode', email, null, null, 'claude-oauth-usage');
      result.error = error.message;
      return result;
    }
  }
}

module.exports = CLIScanner;
