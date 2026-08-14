const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');

const SERVICE_PREFIX = '/exa.language_server_pb.LanguageServerService/';
const CSRF_HEADER = 'x-codeium-csrf-token';

class AntigravityLocalQuotaProbe {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFileSync = options.execFileSync || execFileSync;
    this.http = options.http || http;
    this.https = options.https || https;
    this.timeoutMs = options.timeoutMs || 3000;
  }

  async fetch() {
    const processes = this.findQuotaServiceProcesses();
    if (!processes.length) return null;
    const endpoints = this.findListeningPortsWithPids(processes);
    if (!endpoints.length) return null;
    const attempts = await Promise.allSettled(
      endpoints.map((endpoint) => this.fetchFromPort(endpoint.port, endpoint.csrfToken))
    );
    const candidates = attempts
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value)
      .sort((left, right) => this.completeness(right) - this.completeness(left));
    return candidates[0] || null;
  }

  completeness(value) {
    return (
      Number(Boolean(value?.fiveHour)) +
      Number(Boolean(value?.weekly)) +
      (value?.accountEmail ? 0.5 : 0)
    );
  }

  // ---------------------------------------------------------------------------
  // Process discovery
  // ---------------------------------------------------------------------------

  buildWindowsProcessCommand() {
    return [
      "$ErrorActionPreference = 'SilentlyContinue'",
      'Get-CimInstance Win32_Process | ForEach-Object {',
      '  $n = ([string]$_.Name).ToLowerInvariant(); $c = ([string]$_.CommandLine).ToLowerInvariant();',
      "  $isAgy = $n -eq 'agy.exe' -or $n -eq 'antigravity-cli.exe' -or $n -eq 'antigravity_cli.exe';",
      "  $isLanguageServer = $n -match '^language[_-]?server.*\\.exe$' -and ($c -match '[\\\\/]\\.gemini[\\\\/]antigravity-cli[\\\\/]' -or $c -match '--app_data_dir\\s+antigravity' -or $c -match '[\\\\/]antigravity[\\\\/]');",
      "  $isAgyPath = $c -match '[\\\\/](antigravity-cli|antigravity_cli)[\\\\/]' -or $c -match '(^|[\\\\/])agy(?:\\.exe)?(?:\\s|$)';",
      '  if ($isAgy -or $isLanguageServer -or $isAgyPath) {',
      "    $csrf = ''; $m = [regex]::Match($c, '--csrf_token\\s+([^\\s]+)'); if ($m.Success) { $csrf = $m.Groups[1].Value };",
      '    [pscustomobject]@{ ProcessId = $_.ProcessId; Name = $_.Name; CommandLine = $_.CommandLine; CsrfToken = $csrf }',
      '  }',
      '} | Select-Object ProcessId, Name, CommandLine, CsrfToken | ConvertTo-Json -Compress',
    ].join('\n');
  }

  findQuotaServiceProcesses() {
    try {
      if (this.platform === 'win32') {
        const script = this.buildWindowsProcessCommand();
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        const output = this.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
          encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
        });
        return this.parseWindowsProcessRows(output);
      }
      const output = this.execFileSync('ps', ['-ax', '-o', 'pid=,command='], {
        encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      return this.parsePosixProcessRows(output);
    } catch {
      return [];
    }
  }

  findQuotaServiceProcessIds() {
    return this.findQuotaServiceProcesses().map((process) => process.pid);
  }

  findCliProcessIds() {
    return this.findQuotaServiceProcessIds();
  }

  parseWindowsProcessRows(output) {
    const text = String(output || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const processes = [];
      for (const row of rows) {
        const pid = Number(row?.ProcessId ?? row?.processId);
        if (!Number.isInteger(pid) || pid <= 0) continue;
        processes.push({
          pid,
          name: String(row?.Name || ''),
          commandLine: String(row?.CommandLine || ''),
          csrfToken: this.extractCsrfToken(String(row?.CommandLine || '')) || '',
        });
      }
      return processes;
    } catch {
      return [];
    }
  }

  parseWindowsProcessJson(output) {
    return this.parseWindowsProcessRows(output).map((process) => process.pid);
  }

  parsePosixProcessRows(output) {
    const processes = [];
    for (const line of String(output || '').split(/\r?\n/)) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const commandLine = match[2];
      if (!this.isAntigravityProcess(commandLine)) continue;
      processes.push({
        pid,
        name: commandLine.split(/\s+/)[0] || '',
        commandLine,
        csrfToken: this.extractCsrfToken(commandLine) || '',
      });
    }
    return [...new Map(processes.map((process) => [process.pid, process])).values()];
  }

  parsePosixProcessList(output) {
    return this.parsePosixProcessRows(output).map((process) => process.pid);
  }

  isAntigravityProcess(commandLine) {
    const command = String(commandLine || '').toLowerCase();
    const isAgy = /(^|[\\/])agy(?:\s|$)/.test(command);
    const isAntigravityCli = /(^|[\\/])antigravity[-_]cli(?:[\\/\s]|$)/.test(command);
    const isLanguageServer =
      /(^|[\\/])language[_-]?server[^\\/\s]*/.test(command) &&
      (/[\\/]\.gemini[\\/]antigravity-cli[\\/]/.test(command) ||
        /--app_data_dir\s+antigravity/.test(command) ||
        /[\\/]antigravity[\\/]/.test(command));
    return isAgy || isAntigravityCli || isLanguageServer;
  }

  extractCsrfToken(commandLine) {
    const match = String(commandLine || '').match(/--csrf_token\s+([^\s]+)/);
    return match ? match[1] : null;
  }

  // ---------------------------------------------------------------------------
  // Listening port discovery
  // ---------------------------------------------------------------------------

  findListeningPortsWithPids(processes) {
    const byPid = new Map(processes.map((process) => [process.pid, process]));
    const pids = [...byPid.keys()];
    if (!pids.length) return [];

    const entries = [];
    if (this.platform === 'win32') {
      try {
        const output = this.execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], {
          encoding: 'utf8', windowsHide: true, timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'],
        });
        entries.push(...this.parseWindowsNetstatEntries(output, pids));
      } catch {
        return [];
      }
    } else {
      for (const pid of pids) {
        try {
          const output = this.execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)], {
            encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
          });
          for (const port of this.parseLsofPorts(output)) {
            entries.push({ pid, port });
          }
        } catch {}
      }
      if (!entries.length) {
        try {
          const output = this.execFileSync('ss', ['-ltnp'], {
            encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
          });
          entries.push(...this.parseSsEntries(output, pids));
        } catch {}
      }
    }

    const endpoints = [];
    const seenPorts = new Set();
    for (const entry of entries) {
      if (seenPorts.has(entry.port)) continue;
      seenPorts.add(entry.port);
      const process = byPid.get(entry.pid);
      endpoints.push({
        pid: entry.pid,
        port: entry.port,
        csrfToken: process?.csrfToken || '',
      });
    }
    return endpoints.sort((left, right) => left.port - right.port);
  }

  findListeningPorts(pids) {
    const processes = [...new Set(pids)].map((pid) => ({ pid, csrfToken: '' }));
    return this.findListeningPortsWithPids(processes).map((endpoint) => endpoint.port);
  }

  parseWindowsNetstatEntries(output, pids) {
    const pidSet = new Set(pids.map(Number));
    const entries = [];
    for (const line of String(output || '').split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue;
      const state = parts[3].toUpperCase();
      const pid = Number(parts[4]);
      if (state !== 'LISTENING' || !pidSet.has(pid)) continue;
      const match = parts[1].match(/:(\d+)$/);
      const port = match ? Number(match[1]) : NaN;
      if (Number.isInteger(port) && port > 0 && port <= 65535) entries.push({ pid, port });
    }
    return entries;
  }

  parseWindowsNetstat(output, pids) {
    return this.parseWindowsNetstatEntries(output, pids).map((entry) => entry.port);
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

  parseSsEntries(output, pids) {
    const pidSet = new Set(pids.map(Number));
    const entries = [];
    for (const line of String(output || '').split(/\r?\n/)) {
      const pidMatches = [...line.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
      if (!pidMatches.some((pid) => pidSet.has(pid))) continue;
      const address = line.trim().split(/\s+/)[3] || '';
      const match = address.match(/:(\d+)$/);
      const port = match ? Number(match[1]) : NaN;
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        entries.push({ pid: pidMatches[0], port });
      }
    }
    return entries;
  }

  parseSsPorts(output, pids) {
    return this.parseSsEntries(output, pids).map((entry) => entry.port);
  }

  // ---------------------------------------------------------------------------
  // Connect RPC fetch
  // ---------------------------------------------------------------------------

  async fetchFromPort(port, csrfToken) {
    // Primary: full Antigravity quota summary (two groups with 5h + weekly buckets).
    try {
      const summaryPayload = await this.postJson(
        port,
        'RetrieveUserQuotaSummary',
        this.quotaSummaryRequestBody(),
        this.timeoutMs,
        csrfToken
      );
      const quota = this.parseQuotaSummary(summaryPayload);
      if (quota?.fiveHour || quota?.weekly) {
        let accountEmail = null;
        try {
          const identityPayload = await this.postJson(
            port,
            'GetUserStatus',
            this.defaultRequestBody(),
            Math.min(1500, this.timeoutMs),
            csrfToken
          );
          accountEmail =
            this.findEmail(identityPayload?.userStatus?.email) || this.findEmail(identityPayload);
        } catch {}
        return {
          ...quota,
          accountEmail,
          port,
          source: 'antigravity-local:RetrieveUserQuotaSummary',
        };
      }
    } catch {}

    // Fallback 1: GetUserStatus exposes per-model quota windows.
    try {
      const identityPayload = await this.postJson(
        port,
        'GetUserStatus',
        this.defaultRequestBody(),
        Math.min(2000, this.timeoutMs),
        csrfToken
      );
      const quota = this.parseUserStatusQuota(identityPayload);
      if (quota?.fiveHour || quota?.weekly) {
        const accountEmail =
          this.findEmail(identityPayload?.userStatus?.email) || this.findEmail(identityPayload);
        return { ...quota, accountEmail, port, source: 'antigravity-local:GetUserStatus' };
      }
    } catch {}

    // Fallback 2: model configs without account/plan fields.
    try {
      const configPayload = await this.postJson(
        port,
        'GetCommandModelConfigs',
        this.defaultRequestBody(),
        Math.min(2000, this.timeoutMs),
        csrfToken
      );
      const quota = this.parseUserStatusQuota(configPayload);
      if (quota?.fiveHour || quota?.weekly) {
        return { ...quota, accountEmail: null, port, source: 'antigravity-local:GetCommandModelConfigs' };
      }
    } catch {}

    throw new Error('Antigravity quota endpoint returned no usable Gemini quota buckets');
  }

  defaultRequestBody() {
    return { metadata: { ideName: 'antigravity', extensionName: 'antigravity', ideVersion: 'unknown', locale: 'en' } };
  }

  quotaSummaryRequestBody() {
    return { forceRefresh: true, metadata: this.defaultRequestBody().metadata };
  }

  async postJson(port, method, body, timeoutMs, csrfToken) {
    let lastError = null;
    for (const scheme of ['https', 'http']) {
      try { return await this.postJsonWithScheme(scheme, port, method, body, timeoutMs, csrfToken); }
      catch (error) { lastError = error; }
    }
    throw lastError || new Error('Antigravity local quota endpoint unavailable');
  }

  postJsonWithScheme(scheme, port, method, body, timeoutMs, csrfToken) {
    const payload = JSON.stringify(body || {});
    const transport = scheme === 'http' ? this.http : this.https;
    return new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Connect-Protocol-Version': '1',
      };
      if (csrfToken) headers[CSRF_HEADER] = csrfToken;
      const options = {
        hostname: '127.0.0.1', port, path: `${SERVICE_PREFIX}${method}`, method: 'POST', agent: false,
        headers,
      };
      if (scheme === 'https') options.rejectUnauthorized = false;
      const request = transport.request(options, (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
          if (responseBody.length > 4 * 1024 * 1024) request.destroy(new Error('Antigravity local quota response is too large'));
        });
        response.on('end', () => {
          if (response.statusCode !== 200) return reject(new Error(`Antigravity local quota ${scheme.toUpperCase()} HTTP ${response.statusCode}`));
          try { resolve(JSON.parse(responseBody)); }
          catch { reject(new Error('Antigravity local quota returned invalid JSON')); }
        });
      });
      request.setTimeout(timeoutMs, () => request.destroy(new Error('Antigravity local quota request timed out')));
      request.on('error', reject);
      request.end(payload);
    });
  }

  // ---------------------------------------------------------------------------
  // Quota parsing
  // ---------------------------------------------------------------------------

  parseQuotaSummary(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload.response || payload.summary || payload;
    const groups = Array.isArray(root?.groups) ? root.groups : [];
    const candidates = [];
    for (const group of groups) {
      const groupName = String(group?.displayName || group?.display_name || '').trim();
      const buckets = Array.isArray(group?.buckets) ? group.buckets : [];
      const looksGemini = groupName.toLowerCase().includes('gemini') || buckets.some((bucket) => String(bucket?.bucketId || bucket?.bucket_id || '').toLowerCase().includes('gemini'));
      if (!looksGemini) continue;
      for (const bucket of buckets) {
        if (bucket?.disabled === true) continue;
        const bucketId = String(bucket?.bucketId || bucket?.bucket_id || '').trim();
        const displayName = String(bucket?.displayName || bucket?.display_name || '').trim();
        const kind = this.classifyBucket(`${bucketId} ${displayName}`);
        if (!kind) continue;
        const remainingFraction = this.remainingFraction(bucket);
        if (remainingFraction === null) continue;
        const usedPercent = Math.round(Math.max(0, Math.min(100, (1 - remainingFraction) * 100)) * 10) / 10;
        const resetAt = this.normalizeReset(bucket?.resetTime ?? bucket?.reset_time ?? null);
        candidates.push({ kind, usedPercent, resetAt, bucketId, displayName });
      }
    }
    return this.selectWindows(candidates);
  }

  // Legacy GetUserStatus / GetCommandModelConfigs payloads expose per-model
  // quota windows. A reset that is only hours away belongs to the 5h session
  // window; a reset days away belongs to the weekly window.
  parseUserStatusQuota(payload) {
    if (!payload || typeof payload !== 'object') return { fiveHour: null, weekly: null };
    const configs =
      payload?.userStatus?.cascadeModelConfigData?.clientModelConfigs ||
      payload?.clientModelConfigs ||
      [];
    if (!Array.isArray(configs)) return { fiveHour: null, weekly: null };
    const candidates = [];
    for (const config of configs) {
      const quotaInfo = config?.quotaInfo;
      if (!quotaInfo || typeof quotaInfo !== 'object') continue;
      const remainingFraction = this.remainingFraction(quotaInfo);
      if (remainingFraction === null) continue;
      const usedPercent = Math.round(Math.max(0, Math.min(100, (1 - remainingFraction) * 100)) * 10) / 10;
      const resetAt = this.normalizeReset(quotaInfo.resetTime ?? quotaInfo.reset_time ?? null);
      const kind = this.classifyResetWindow(resetAt);
      if (!kind) continue;
      candidates.push({ kind, usedPercent, resetAt, label: String(config?.label || '') });
    }
    return this.selectWindows(candidates);
  }

  classifyResetWindow(resetAt) {
    if (!resetAt) return null;
    const resetMs = Date.parse(resetAt);
    if (!Number.isFinite(resetMs)) return null;
    const hoursUntilReset = (resetMs - Date.now()) / 3_600_000;
    return hoursUntilReset <= 12 ? '5h' : 'weekly';
  }

  selectWindows(candidates) {
    const select = (kind) => {
      const matches = candidates.filter((candidate) => candidate.kind === kind);
      if (!matches.length) return null;
      return matches.sort((left, right) => right.usedPercent - left.usedPercent)[0];
    };
    return { fiveHour: select('5h'), weekly: select('weekly') };
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
    } else date = new Date(value);
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
