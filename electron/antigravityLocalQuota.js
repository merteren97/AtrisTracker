const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');

const SERVICE_PREFIX = '/exa.language_server_pb.LanguageServerService/';

class AntigravityLocalQuotaProbe {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFileSync = options.execFileSync || execFileSync;
    this.http = options.http || http;
    this.https = options.https || https;
    this.timeoutMs = options.timeoutMs || 2500;
  }

  async fetch() {
    const pids = this.findCliProcessIds();
    if (!pids.length) return null;

    const ports = this.findListeningPorts(pids);
    if (!ports.length) return null;

    const attempts = await Promise.allSettled(
      ports.map((port) => this.fetchFromPort(port))
    );
    const candidates = attempts
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value)
      .sort((left, right) => this.completeness(right) - this.completeness(left));

    return candidates[0] || null;
  }

  completeness(value) {
    return Number(Boolean(value?.fiveHour)) + Number(Boolean(value?.weekly));
  }

  findCliProcessIds() {
    try {
      if (this.platform === 'win32') {
        const command = [
          "$ErrorActionPreference = 'SilentlyContinue'",
          'Get-CimInstance Win32_Process |',
          'Where-Object {',
          "  $name = [string]$_.Name; $cmd = ([string]$_.CommandLine).ToLowerInvariant();",
          "  $name -ieq 'agy.exe' -or $name -ieq 'antigravity-cli.exe' -or $name -ieq 'antigravity_cli.exe' -or",
          "  $cmd -match '[\\\\/](antigravity-cli|antigravity_cli)[\\\\/]' -or",
          "  $cmd -match '[\\\\/]agy(?:\\.exe)?(?:\\s|$)'",
          '} | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress',
        ].join(' ');
        const output = this.execFileSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', command],
          {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 4000,
            stdio: ['ignore', 'pipe', 'ignore'],
          }
        );
        return this.parseWindowsProcessJson(output);
      }

      const output = this.execFileSync('ps', ['-ax', '-o', 'pid=,command='], {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return this.parsePosixProcessList(output);
    } catch {
      return [];
    }
  }

  parseWindowsProcessJson(output) {
    const text = String(output || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return [...new Set(rows
        .map((row) => Number(row?.ProcessId ?? row?.processId))
        .filter((pid) => Number.isInteger(pid) && pid > 0))];
    } catch {
      return [];
    }
  }

  parsePosixProcessList(output) {
    const ids = [];
    for (const line of String(output || '').split(/\r?\n/)) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (!match) continue;
      const command = match[2].toLowerCase();
      const isAgy = /(^|[\\/])agy(?:\s|$)/.test(command);
      const isAntigravityCli = /(^|[\\/])antigravity[-_]cli(?:[\\/\s]|$)/.test(command);
      if (isAgy || isAntigravityCli) ids.push(Number(match[1]));
    }
    return [...new Set(ids.filter((pid) => Number.isInteger(pid) && pid > 0))];
  }

  findListeningPorts(pids) {
    if (!pids.length) return [];
    try {
      if (this.platform === 'win32') {
        const output = this.execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 4000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        return this.parseWindowsNetstat(output, pids);
      }

      const ports = [];
      for (const pid of pids) {
        let output;
        try {
          output = this.execFileSync(
            'lsof',
            ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)],
            {
              encoding: 'utf8',
              timeout: 3000,
              stdio: ['ignore', 'pipe', 'ignore'],
            }
          );
        } catch {
          continue;
        }
        ports.push(...this.parseLsofPorts(output));
      }
      return [...new Set(ports)].sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  parseWindowsNetstat(output, pids) {
    const pidSet = new Set(pids.map(Number));
    const ports = [];
    for (const line of String(output || '').split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue;
      const state = parts[3].toUpperCase();
      const pid = Number(parts[4]);
      if (state !== 'LISTENING' || !pidSet.has(pid)) continue;
      const match = parts[1].match(/:(\d+)$/);
      const port = match ? Number(match[1]) : NaN;
      if (Number.isInteger(port) && port > 0 && port <= 65535) ports.push(port);
    }
    return [...new Set(ports)].sort((a, b) => a - b);
  }

  parseLsofPorts(output) {
    const ports = [];
    for (const line of String(output || '').split(/\r?\n/)) {
      const match = line.match(/TCP\s+\S+:(\d+)\s+\(LISTEN\)/i);
      const port = match ? Number(match[1]) : NaN;
      if (Number.isInteger(port) && port > 0 && port <= 65535) ports.push(port);
    }
    return ports;
  }

  async fetchFromPort(port) {
    const summaryPayload = await this.postJson(
      port,
      'RetrieveUserQuotaSummary',
      { forceRefresh: true },
      this.timeoutMs
    );
    const quota = this.parseQuotaSummary(summaryPayload);
    if (!quota?.fiveHour && !quota?.weekly) {
      throw new Error('Antigravity quota summary contains no usable Gemini quota buckets');
    }

    let accountEmail = null;
    try {
      const identityPayload = await this.postJson(
        port,
        'GetUserStatus',
        this.defaultRequestBody(),
        Math.min(1200, this.timeoutMs)
      );
      accountEmail = this.findEmail(identityPayload?.userStatus?.email) || this.findEmail(identityPayload);
    } catch {
      // Quota summary is authoritative even when the optional identity call fails.
    }

    return {
      ...quota,
      accountEmail,
      port,
      source: 'antigravity-local:RetrieveUserQuotaSummary',
    };
  }

  defaultRequestBody() {
    return {
      metadata: {
        ideName: 'antigravity',
        extensionName: 'antigravity',
        ideVersion: 'unknown',
        locale: 'en',
      },
    };
  }

  async postJson(port, method, body, timeoutMs) {
    let lastError = null;
    for (const scheme of ['https', 'http']) {
      try {
        return await this.postJsonWithScheme(scheme, port, method, body, timeoutMs);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Antigravity local quota endpoint unavailable');
  }

  postJsonWithScheme(scheme, port, method, body, timeoutMs) {
    const payload = JSON.stringify(body || {});
    const transport = scheme === 'http' ? this.http : this.https;
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port,
        path: `${SERVICE_PREFIX}${method}`,
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Connect-Protocol-Version': '1',
        },
      };
      if (scheme === 'https') options.rejectUnauthorized = false;

      const request = transport.request(options, (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
          if (responseBody.length > 4 * 1024 * 1024) {
            request.destroy(new Error('Antigravity local quota response is too large'));
          }
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`Antigravity local quota ${scheme.toUpperCase()} HTTP ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(responseBody));
          } catch {
            reject(new Error('Antigravity local quota returned invalid JSON'));
          }
        });
      });

      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error('Antigravity local quota request timed out'));
      });
      request.on('error', reject);
      request.end(payload);
    });
  }

  parseQuotaSummary(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload.response || payload.summary || payload;
    const groups = Array.isArray(root?.groups) ? root.groups : [];
    const candidates = [];

    for (const group of groups) {
      const groupName = String(group?.displayName || group?.display_name || '').trim();
      const buckets = Array.isArray(group?.buckets) ? group.buckets : [];
      const looksGemini =
        groupName.toLowerCase().includes('gemini') ||
        buckets.some((bucket) => String(bucket?.bucketId || bucket?.bucket_id || '').toLowerCase().includes('gemini'));
      if (!looksGemini) continue;

      for (const bucket of buckets) {
        if (bucket?.disabled === true) continue;
        const bucketId = String(bucket?.bucketId || bucket?.bucket_id || '').trim();
        const displayName = String(bucket?.displayName || bucket?.display_name || '').trim();
        const context = `${bucketId} ${displayName}`;
        const kind = this.classifyBucket(context);
        if (!kind) continue;

        const remainingFraction = this.remainingFraction(bucket);
        if (remainingFraction === null) continue;
        const usedPercent = Math.round(
          Math.max(0, Math.min(100, (1 - remainingFraction) * 100)) * 10
        ) / 10;
        const resetAt = this.normalizeReset(bucket?.resetTime ?? bucket?.reset_time ?? null);
        candidates.push({ kind, usedPercent, resetAt, bucketId, displayName });
      }
    }

    const select = (kind) => {
      const matches = candidates.filter((candidate) => candidate.kind === kind);
      if (!matches.length) return null;
      return matches.sort((left, right) => right.usedPercent - left.usedPercent)[0];
    };

    return {
      fiveHour: select('5h'),
      weekly: select('weekly'),
    };
  }

  classifyBucket(value) {
    const normalized = String(value || '').toLowerCase().replace(/[_-]+/g, ' ');
    if (/(^|\s)5\s*h(\s|$)/.test(normalized) || normalized.includes('five hour')) return '5h';
    if (normalized.includes('weekly') || normalized.includes('week')) return 'weekly';
    return null;
  }

  remainingFraction(bucket) {
    const values = [
      bucket?.remainingFraction,
      bucket?.remaining_fraction,
      bucket?.remaining?.remainingFraction,
      bucket?.remaining?.remaining_fraction,
      bucket?.remaining?.case === 'remainingFraction' ? bucket?.remaining?.value : null,
    ];
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const number = Number(value);
      if (Number.isFinite(number)) return Math.max(0, Math.min(1, number));
    }
    return null;
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
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const visited = new Set();
    const walk = (node, depth = 0) => {
      if (depth > 8 || node === null || node === undefined) return null;
      if (typeof node === 'string') {
        const text = node.trim();
        return emailPattern.test(text) ? text : null;
      }
      if (typeof node !== 'object' || visited.has(node)) return null;
      visited.add(node);
      for (const child of Object.values(node)) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
      return null;
    };
    return walk(value);
  }
}

module.exports = AntigravityLocalQuotaProbe;
