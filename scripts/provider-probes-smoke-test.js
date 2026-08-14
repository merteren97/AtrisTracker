const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const AntigravityLocalQuotaProbe = require('../electron/antigravityLocalQuota');
const CodexAppServerQuota = require('../electron/codexAppServer');
const ClaudeCredentialsResolver = require('../electron/claudeCredentials');
const UpdateManager = require('../electron/updateManager');

class MockUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = true;
    this.autoInstallOnAppQuit = true;
    this.autoRunAppAfterInstall = false;
    this.allowPrerelease = true;
    this.installed = false;
  }
  async checkForUpdates() {
    const updateInfo = { version: '1.4.7' };
    this.emit('update-available', updateInfo);
    return { updateInfo };
  }
  async downloadUpdate() {
    this.emit('download-progress', { percent: 51.4 });
    this.emit('update-downloaded', { version: '1.4.7' });
    return ['/tmp/AtrisTracker-Setup-1.4.7.exe'];
  }
  quitAndInstall() { this.installed = true; }
}

async function run() {
  const antigravity = new AntigravityLocalQuotaProbe({ platform: 'linux' });
  const posixPids = antigravity.parsePosixProcessList([
    '  100 /usr/bin/node other-process',
    '  4242 /home/mert/.gemini/antigravity-cli/bin/language_server_linux_x64 --port 43123',
    '  4243 /home/mert/.gemini/antigravity-cli/bin/agy',
  ].join('\n'));
  assert.deepEqual(posixPids, [4242, 4243]);

  const ssPorts = antigravity.parseSsPorts([
    'LISTEN 0 128 127.0.0.1:43123 0.0.0.0:* users:(("language_server",pid=4242,fd=14))',
    'LISTEN 0 128 127.0.0.1:43124 0.0.0.0:* users:(("other",pid=9999,fd=9))',
  ].join('\n'), posixPids);
  assert.deepEqual(ssPorts, [43123]);

  const quota = antigravity.parseQuotaSummary({ response: { groups: [{ displayName: 'Gemini Models', buckets: [
    { bucketId: 'gemini-5h', displayName: 'Five Hour Limit', remainingFraction: 0.8 },
    { bucketId: 'gemini-weekly', displayName: 'Weekly Limit', remainingFraction: 0.65, resetTime: '2026-08-17T08:29:00Z' },
  ] }] } });
  assert.equal(quota.fiveHour.usedPercent, 20);
  assert.equal(quota.weekly.usedPercent, 35);

  // POSIX process discovery must extract the CSRF token from the language
  // server command line and keep the agy CLI tokenless.
  const posixProcesses = antigravity.parsePosixProcessRows([
    '  100 /usr/bin/node other-process',
    '  4242 /home/mert/.gemini/antigravity-cli/bin/language_server_linux_x64 --app_data_dir antigravity-cli --csrf_token 550e8400-e29b-41d4-a716-446655440000 --port 43123',
    '  4243 /home/mert/.gemini/antigravity-cli/bin/agy',
    '  4244 /opt/Antigravity.app/Contents/Resources/bin/language_server_macos_arm --app_data_dir antigravity --csrf_token abc-def-123',
  ].join('\n'));
  assert.deepEqual(
    posixProcesses.map((p) => [p.pid, p.csrfToken]),
    [
      [4242, '550e8400-e29b-41d4-a716-446655440000'],
      [4243, ''],
      [4244, 'abc-def-123'],
    ]
  );

  // The Windows PowerShell script must be newline-joined and encoded so the
  // whole script survives the command line (spaces alone broke it: statement
  // and pipeline landed on the same line).
  const windowsProbe = new AntigravityLocalQuotaProbe({ platform: 'win32' });
  const script = Buffer.from(windowsProbe.buildWindowsProcessCommand(), 'utf16le').toString('base64');
  const decoded = Buffer.from(script, 'base64').toString('utf16le');
  assert.ok(decoded.includes('Get-CimInstance Win32_Process'));
  assert.ok(decoded.includes('\n'));
  assert.ok(decoded.includes('--csrf_token'));
  const windowsRows = windowsProbe.parseWindowsProcessRows(
    JSON.stringify([
      { ProcessId: 4242, Name: 'language_server_windows_x64.exe', CommandLine: 'C:\\Users\\Mert\\.gemini\\antigravity-cli\\bin\\language_server_windows_x64.exe --csrf_token tok-123' },
      { ProcessId: 4243, Name: 'agy.exe', CommandLine: 'C:\\Users\\Mert\\AppData\\Local\\agy\\bin\\agy.exe' },
    ])
  );
  assert.equal(windowsRows[0].csrfToken, 'tok-123');
  assert.equal(windowsRows[1].csrfToken, '');

  // Legacy GetUserStatus payloads expose per-model quota windows. Resets hours
  // away map to the 5h window; resets days away map to the weekly window.
  const userStatus = antigravity.parseUserStatusQuota({
    userStatus: {
      email: 'mert@example.com',
      cascadeModelConfigData: {
        clientModelConfigs: [
          { label: 'Gemini 3.7 Flash (Medium)', quotaInfo: { remainingFraction: 0.7, resetTime: new Date(Date.now() + 2 * 3600_000).toISOString() } },
          { label: 'Gemini 3.5 Pro (High)', quotaInfo: { remainingFraction: 0.85, resetTime: new Date(Date.now() + 4 * 3600_000).toISOString() } },
          { label: 'Gemini 3 Flash (Low)', quotaInfo: { remainingFraction: 0.55, resetTime: new Date(Date.now() + 3 * 24 * 3600_000).toISOString() } },
          { label: 'Claude Opus 4.5', quotaInfo: { remainingFraction: 0.9, resetTime: new Date(Date.now() + 6 * 24 * 3600_000).toISOString() } },
        ],
      },
    },
  });
  assert.equal(userStatus.fiveHour.usedPercent, 30);
  assert.equal(userStatus.weekly.usedPercent, 45);

  // The local Connect RPC must send the CSRF token header when the caller
  // provides one, and must stay tokenless for the agy CLI.
  const http = require('http');
  const { once } = require('events');
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.url.includes('RetrieveUserQuotaSummary')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ response: { groups: [{ displayName: 'Gemini Models', buckets: [
          { bucketId: 'gemini-5h', displayName: 'Five Hour Limit', remainingFraction: 0.8 },
          { bucketId: 'gemini-weekly', displayName: 'Weekly Limit', remainingFraction: 0.65, resetTime: '2026-08-17T08:29:00Z' },
        ] }] } }));
      } else if (req.url.includes('GetUserStatus')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ userStatus: { email: 'mert@example.com' } }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const recordedHeaders = [];
  server.on('request', (req) => recordedHeaders.push(req.headers));
  try {
    const withCsrf = await windowsProbe.fetchFromPort(port, 'csrf-token-123');
    assert.equal(withCsrf.accountEmail, 'mert@example.com');
    assert.equal(withCsrf.fiveHour.usedPercent, 20);
    const summaryHeader = recordedHeaders.find((h) => h['x-codeium-csrf-token']);
    assert.ok(summaryHeader, 'expected x-codeium-csrf-token header');
    assert.equal(summaryHeader['x-codeium-csrf-token'], 'csrf-token-123');

    recordedHeaders.length = 0;
    const withoutCsrf = await windowsProbe.fetchFromPort(port, '');
    assert.equal(withoutCsrf.fiveHour.usedPercent, 20);
    assert.ok(recordedHeaders.every((h) => !h['x-codeium-csrf-token']));
  } finally {
    server.close();
  }

  const codex = new CodexAppServerQuota({ platform: 'linux' });
  const codexWindows = codex.mapRateLimits({ rateLimits: {
    primary: { usedPercent: 23.4, windowDurationMins: 300, resetsAt: 1_786_400_000 },
    secondary: { usedPercent: 57, windowDurationMins: 10_080, resetsAt: 1_786_800_000 },
  } });
  assert.equal(codexWindows.fiveHour.usedPercent, 23.4);
  assert.equal(codexWindows.weekly.usedPercent, 57);

  const envToken = `sk-ant-oat01-${'a'.repeat(40)}`;
  const envResolver = new ClaudeCredentialsResolver({ platform: 'linux', env: { CLAUDE_CODE_OAUTH_TOKEN: envToken } });
  assert.equal(envResolver.readOAuthToken(), envToken);

  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'atris-claude-credentials-'));
  try {
    const configDir = path.join(tempHome, 'custom-claude');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: `sk-ant-oat01-${'b'.repeat(40)}`, email: 'claude-test@example.com' } }), 'utf8');
    const configResolver = new ClaudeCredentialsResolver({ home: tempHome, platform: 'linux', env: { CLAUDE_CONFIG_DIR: configDir } });
    assert.ok(configResolver.readOAuthToken().startsWith('sk-ant-oat01-'));
    assert.equal(configResolver.detectEmail(), 'claude-test@example.com');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }

  const mockUpdater = new MockUpdater();
  const updateManager = new UpdateManager({ getVersion: () => '1.0.2', isPackaged: true }, { isSupported: () => false }, { updater: mockUpdater });
  assert.equal(mockUpdater.autoDownload, false);
  assert.equal(mockUpdater.autoInstallOnAppQuit, false);
  assert.equal(updateManager.compareVersions('1.4.7', '1.0.2'), 1);
  let updateStatus = await updateManager.check({ notify: false });
  assert.equal(updateStatus.stage, 'available');
  updateStatus = await updateManager.download();
  assert.equal(updateStatus.stage, 'downloaded');
  assert.equal(updateStatus.percent, 100);
  updateManager.install();
  assert.equal(mockUpdater.installed, true);

  console.log('AtrisTracker provider probe smoke test passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
