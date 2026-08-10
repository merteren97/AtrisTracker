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
