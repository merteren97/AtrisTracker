const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CLIScanner = require('../electron/cliScanner');
const UsageDatabase = require('../electron/db');
const AntigravityIntegration = require('../electron/antigravityIntegration');

async function run() {
  const scanner = new CLIScanner({});

  const codex = scanner.mapCodexWindows({
    primary: { used_percent: 18, window_minutes: 300, resets_at: 1_770_414_841 },
    secondary: { used_percent: 41, window_minutes: 10_080, resets_at: 1_770_698_702 },
  });
  assert.equal(codex.fiveHour.usedPercent, 18);
  assert.equal(codex.weekly.usedPercent, 41);

  const telemetryCapturedAt = Date.parse('2026-08-10T12:00:00Z');
  const antigravity = scanner.collectQuotaWindows(
    {
      'gemini-5h': { remaining_fraction: 0.25, reset_in_seconds: 3600 },
      'gemini-weekly': {
        remaining_fraction: 0.6,
        reset_time: '2026-08-14T00:00:00Z',
        reset_in_seconds: 999999,
      },
    },
    telemetryCapturedAt
  );
  const fiveHour = scanner.selectTightestWindow(antigravity, '5h');
  const weekly = scanner.selectTightestWindow(antigravity, 'weekly');
  assert.equal(fiveHour.usedPercent, 75);
  assert.equal(fiveHour.resetAt, '2026-08-10T13:00:00.000Z');
  assert.equal(weekly.usedPercent, 40);
  assert.equal(weekly.resetAt, '2026-08-14T00:00:00.000Z');

  // Antigravity can temporarily zero statusline quota during subagent work.
  // A zero without reset metadata must not be persisted as genuine exhaustion.
  const transientZero = scanner.collectQuotaWindows({
    'gemini-5h': { remaining_fraction: 0 },
    'gemini-weekly': { remaining_fraction: 0 },
  });
  assert.equal(transientZero.length, 0);

  const integrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atris-ag-integration-'));
  try {
    const integration = new AntigravityIntegration();
    integration.baseDir = integrationDir;
    integration.settingsPath = path.join(integrationDir, 'settings.json');
    integration.cachePath = path.join(integrationDir, 'atris-statusline-state.json');
    integration.backupPath = path.join(integrationDir, 'atris-statusline-backup.json');
    integration.scriptPath = path.join(
      integrationDir,
      process.platform === 'win32' ? 'atris-statusline-bridge.ps1' : 'atris-statusline-bridge.sh'
    );

    const previousStatusLine = { type: 'command', command: 'existing-statusline-command' };
    fs.writeFileSync(
      integration.settingsPath,
      JSON.stringify({ theme: 'dark', statusLine: previousStatusLine }),
      'utf8'
    );

    const enabled = integration.enable();
    assert.equal(enabled.enabled, true);
    assert.equal(fs.existsSync(integration.scriptPath), true);
    const enabledSettings = JSON.parse(fs.readFileSync(integration.settingsPath, 'utf8'));
    assert.ok(enabledSettings.statusLine.command.includes('atris-statusline-bridge'));

    integration.disable();
    const restoredSettings = JSON.parse(fs.readFileSync(integration.settingsPath, 'utf8'));
    assert.deepEqual(restoredSettings.statusLine, previousStatusLine);
    assert.equal(restoredSettings.theme, 'dark');
  } finally {
    fs.rmSync(integrationDir, { recursive: true, force: true });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atris-backend-'));
  const dbPath = path.join(tempDir, 'usage.db');
  try {
    const db = new UsageDatabase(dbPath);
    await db.init();

    db.addSnapshot({
      tool: 'antigravity',
      account_email: 'first@example.com',
      rolling_5h_percent: 20,
      next_5h_reset_at: '2026-08-10T15:00:00Z',
      weekly_usage_percent: 35,
      weekly_reset_at: '2026-08-14T00:00:00Z',
      source: 'test',
    });

    db.saveAccount('antigravity', 'second@example.com', true);
    assert.equal(db.getLatestSnapshotByAccount('antigravity', 'second@example.com'), null);
    assert.equal(
      db.getLatestSnapshotByAccount('antigravity', 'first@example.com').rolling_5h_percent,
      20
    );

    const accounts = db.getAccountsByTool('antigravity');
    assert.equal(accounts[0].email, 'second@example.com');
    assert.equal(accounts[0].active, 1);
    assert.equal(accounts.find((account) => account.email === 'first@example.com').active, 0);

    // A scan that discovers the new account but has no live quota must not create
    // a fake zero snapshot or overwrite the previous account's cached values.
    assert.equal(db.getUsageHistoryByAccount('antigravity', 'second@example.com').length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('AtrisTracker backend smoke test passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
