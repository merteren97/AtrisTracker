const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CLIScanner = require('../electron/cliScanner');
const UsageDatabase = require('../electron/db');

async function run() {
  const scanner = new CLIScanner({});

  const codex = scanner.mapCodexWindows({
    primary: { used_percent: 18, window_minutes: 300, resets_at: 1_770_414_841 },
    secondary: { used_percent: 41, window_minutes: 10_080, resets_at: 1_770_698_702 },
  });
  assert.equal(codex.fiveHour.usedPercent, 18);
  assert.equal(codex.weekly.usedPercent, 41);

  const antigravity = scanner.collectQuotaWindows({
    command: {
      data: {
        groups: [
          {
            name: 'Gemini Models',
            buckets: [
              { window: '5h', remaining_fraction: 0.25, reset_time: '2026-08-10T15:00:00Z' },
              { window: 'weekly', remaining_fraction: 0.6, reset_time: '2026-08-14T00:00:00Z' },
            ],
          },
        ],
      },
    },
  });
  assert.equal(scanner.selectTightestWindow(antigravity, '5h').usedPercent, 75);
  assert.equal(scanner.selectTightestWindow(antigravity, 'weekly').usedPercent, 40);

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
