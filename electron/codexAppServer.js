const { spawn } = require('child_process');
const packageInfo = require('../package.json');

const FIVE_HOURS_MINUTES = 5 * 60;
const ONE_WEEK_MINUTES = 7 * 24 * 60;

class CodexAppServerQuota {
  constructor(options = {}) {
    this.spawn = options.spawn || spawn;
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.timeoutMs = options.timeoutMs || 8000;
  }

  async fetch() {
    let lastError = null;
    for (const command of this.commandCandidates()) {
      try {
        return await this.fetchWithCommand(command);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Codex app-server başlatılamadı');
  }

  commandCandidates() {
    if (this.platform === 'win32') return ['codex.exe', 'codex.cmd', 'codex'];
    return ['codex'];
  }

  fetchWithCommand(command) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        // npm-installed Codex only ships a .cmd shim on Windows; Node cannot
        // CreateProcess a batch file directly, so run it through cmd.exe.
        const needsShell = this.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
        child = this.spawn(command, ['app-server', '--listen', 'stdio://'], {
          env: this.env,
          windowsHide: true,
          shell: needsShell,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(error);
        return;
      }

      let settled = false;
      let stdoutBuffer = '';
      let stderrTail = '';
      let accountResult;
      let rateLimitResult;
      let timeout = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        child.stdout?.removeAllListeners();
        child.stderr?.removeAllListeners();
        child.removeAllListeners();
        try {
          if (!child.killed) child.kill();
        } catch {
          // Process teardown is best effort.
        }
      };

      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const finish = () => {
        if (settled || accountResult === undefined || rateLimitResult === undefined) return;
        const accountEmail = this.findEmail(accountResult?.account || accountResult);
        const windows = this.mapRateLimits(rateLimitResult);
        settled = true;
        cleanup();
        resolve({
          accountEmail,
          fiveHour: windows.fiveHour,
          weekly: windows.weekly,
          source: 'codex-app-server:account/rateLimits/read',
        });
      };

      const send = (message) => {
        if (settled || !child.stdin || child.stdin.destroyed) return;
        child.stdin.write(`${JSON.stringify(message)}\n`);
      };

      const handleMessage = (message) => {
        if (!message || typeof message !== 'object') return;
        if (message.id === 1) {
          if (message.error) {
            fail(new Error(this.rpcErrorMessage(message.error, 'Codex app-server initialize başarısız')));
            return;
          }
          send({ method: 'initialized', params: {} });
          send({ method: 'account/read', id: 2, params: {} });
          send({ method: 'account/rateLimits/read', id: 3, params: {} });
          return;
        }

        if (message.id === 2) {
          accountResult = message.error ? null : message.result;
          finish();
          return;
        }

        if (message.id === 3) {
          if (message.error) {
            fail(new Error(this.rpcErrorMessage(message.error, 'Codex rate limit verisi alınamadı')));
            return;
          }
          rateLimitResult = message.result;
          finish();
        }
      };

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdoutBuffer += chunk;
        let newlineIndex;
        while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          if (!line) continue;
          try {
            handleMessage(JSON.parse(line));
          } catch {
            // app-server can write non-protocol diagnostics; ignore those lines.
          }
        }
      });

      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk) => {
        stderrTail = `${stderrTail}${chunk}`.slice(-4000);
      });

      child.once('error', (error) => fail(error));
      child.once('exit', (code) => {
        if (!settled) {
          const suffix = stderrTail.trim() ? `: ${stderrTail.trim()}` : '';
          fail(new Error(`Codex app-server erken kapandı (${code ?? 'unknown'})${suffix}`));
        }
      });
      child.once('spawn', () => {
        send({
          method: 'initialize',
          id: 1,
          params: {
            clientInfo: {
              name: 'atris_tracker',
              title: 'AtrisTracker',
              version: packageInfo.version,
            },
          },
        });
      });

      timeout = setTimeout(() => {
        const suffix = stderrTail.trim() ? `: ${stderrTail.trim()}` : '';
        fail(new Error(`Codex app-server zaman aşımına uğradı${suffix}`));
      }, this.timeoutMs);
    });
  }

  rpcErrorMessage(error, fallback) {
    if (!error) return fallback;
    return error.message || error.data?.message || fallback;
  }

  // Codex reports the plan-level window pair in `rateLimits` and then repeats the
  // same `codex` entry (plus unrelated per-limit entries such as
  // base_model_inference / gpt-reserve) inside `rateLimitsByLimitId`. Pooling
  // every entry and taking the tightest window per kind can pick an exhausted
  // *other* limit's weekly-sized window (100%) instead of the real Codex weekly
  // quota, pinning weekly usage at 100% with the wrong reset date. Only the
  // authoritative limit's windows may drive the UI.
  selectAuthoritativeRoots(payload) {
    if (!payload || typeof payload !== 'object') return [];
    const summary = payload.rateLimits || payload.rate_limits || null;
    const byId = payload.rateLimitsByLimitId || payload.rate_limits_by_limit_id || null;

    if (summary && typeof summary === 'object') {
      const summaryLimitId = summary.limitId || summary.limit_id || null;
      if (summaryLimitId && byId && typeof byId === 'object') {
        const entry = byId[summaryLimitId] || byId[String(summaryLimitId).toLowerCase()];
        if (entry && typeof entry === 'object') {
          return [entry.rateLimits || entry.rate_limits || entry];
        }
      }
      return [summary];
    }

    if (byId && typeof byId === 'object') {
      const entries = Object.entries(byId);
      if (entries.length) {
        const preferred = entries.find(([id]) => id === 'codex') || entries[0];
        const entry = preferred[1];
        if (entry && typeof entry === 'object') {
          return [entry.rateLimits || entry.rate_limits || entry];
        }
      }
    }

    return [payload];
  }

  mapRateLimits(payload) {
    const candidates = [];
    const pushWindow = (window, label) => {
      if (!window || typeof window !== 'object') return;
      const duration = this.toFiniteNumber(
        window.windowDurationMins ?? window.window_duration_mins ?? window.window_minutes
      );
      const usedPercent = this.clampPercent(
        window.usedPercent ?? window.used_percent ?? window.usedPercentage
      );
      const resetAt = this.normalizeReset(
        window.resetsAt ?? window.resets_at ?? window.resetAt ?? window.reset_at
      );
      let kind = null;
      if (duration === FIVE_HOURS_MINUTES) kind = '5h';
      else if (duration === ONE_WEEK_MINUTES) kind = 'weekly';
      else if (!duration && label === 'primary') kind = '5h';
      else if (!duration && label === 'secondary') kind = 'weekly';
      if (!kind || (usedPercent === null && !resetAt)) return;
      candidates.push({ kind, usedPercent, resetAt });
    };

    for (const root of this.selectAuthoritativeRoots(payload)) {
      pushWindow(root.primary, 'primary');
      pushWindow(root.secondary, 'secondary');
      if (Array.isArray(root.windows)) {
        root.windows.forEach((window) => pushWindow(window, 'window'));
      }
    }

    const select = (kind) => {
      const matches = candidates.filter((candidate) => candidate.kind === kind);
      if (!matches.length) return null;
      // A window whose reset time already passed is an expired cycle and must
      // never be reported as the live quota; prefer still-active windows.
      const active = matches.filter(
        (candidate) => !candidate.resetAt || Date.parse(candidate.resetAt) > Date.now()
      );
      const pool = active.length ? active : matches;
      return pool.sort((left, right) => (right.usedPercent ?? -1) - (left.usedPercent ?? -1))[0];
    };

    return { fiveHour: select('5h'), weekly: select('weekly') };
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

  findEmail(value) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const visited = new Set();
    const walk = (node, depth = 0) => {
      if (depth > 8 || node === null || node === undefined) return null;
      if (typeof node === 'string') {
        const text = node.trim();
        return pattern.test(text) ? text : null;
      }
      if (typeof node !== 'object' || visited.has(node)) return null;
      visited.add(node);
      for (const child of Object.values(node)) {
        const hit = walk(child, depth + 1);
        if (hit) return hit;
      }
      return null;
    };
    return walk(value);
  }
}

module.exports = CodexAppServerQuota;
