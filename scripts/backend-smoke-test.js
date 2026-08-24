const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CLIScanner = require('../electron/cliScanner');
const EnhancedCLIScanner = require('../electron/cliScannerEnhanced');
const UsageDatabase = require('../electron/db');
const AntigravityIntegration = require('../electron/antigravityIntegration');
const AntigravityLocalQuotaProbe = require('../electron/antigravityLocalQuota');
const StartupManager = require('../electron/startup');

async function run() {
  const scanner = new CLIScanner({});

  const codex = scanner.mapCodexWindows({
    primary: { used_percent: 18, window_minutes: 300, resets_at: 1_770_414_841 },
    secondary: { used_percent: 41, window_minutes: 10_080, resets_at: 1_770_698_702 },
  });
  assert.equal(codex.fiveHour.usedPercent, 18);
  assert.equal(codex.weekly.usedPercent, 41);

  const resetOnly = scanner.createSnapshot(
    'codex',
    'reset-only@example.com',
    { resetAt: '2026-08-10T13:00:00Z' },
    null,
    'test-reset-only'
  );
  assert.equal(resetOnly.scan_status, 'live');
  assert.equal(scanner.hasObservedQuota(resetOnly), true);

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

  // Reproduce the user's real /quota screenshot: 93.07% weekly remaining and
  // 100% five-hour remaining. 100% remaining is a valid live zero-usage value,
  // not an unknown/missing quota.
  const localProbe = new AntigravityLocalQuotaProbe({ platform: 'win32' });
  const localSummary = localProbe.parseQuotaSummary({
    response: {
      groups: [
        {
          displayName: 'Gemini Models',
          buckets: [
            {
              bucketId: 'gemini-weekly',
              displayName: 'Weekly Limit',
              remainingFraction: 0.9307,
              resetTime: '2026-08-17T08:29:00Z',
            },
            {
              bucketId: 'gemini-5h',
              displayName: 'Five Hour Limit',
              remaining: { case: 'remainingFraction', value: 1 },
            },
          ],
        },
        {
          displayName: 'Claude and GPT models',
          buckets: [
            { bucketId: 'claude-weekly', remainingFraction: 0 },
          ],
        },
      ],
    },
  });
  assert.equal(localSummary.weekly.usedPercent, 6.9);
  assert.equal(localSummary.weekly.resetAt, '2026-08-17T08:29:00.000Z');
  assert.equal(localSummary.fiveHour.usedPercent, 0);

  const windowsProcesses = localProbe.parseWindowsProcessJson(
    JSON.stringify([
      { ProcessId: 4242, Name: 'agy.exe', CommandLine: 'C:\\Users\\Mert\\AppData\\Local\\agy\\bin\\agy.exe' },
      {
        ProcessId: 4243,
        Name: 'language_server_windows_x64.exe',
        CommandLine: 'C:\\Users\\Mert\\.gemini\\antigravity-cli\\bin\\language_server_windows_x64.exe',
      },
    ])
  );
  assert.deepEqual(windowsProcesses, [4242, 4243]);

  const listeningPorts = localProbe.parseWindowsNetstat(
    [
      '  TCP    127.0.0.1:43123      0.0.0.0:0      LISTENING       4242',
      '  TCP    127.0.0.1:43124      0.0.0.0:0      LISTENING       9999',
      '  TCP    [::1]:43125          [::]:0         LISTENING       4243',
      '  TCP    127.0.0.1:43126      127.0.0.1:50000 ESTABLISHED     4242',
    ].join('\r\n'),
    windowsProcesses
  );
  assert.deepEqual(listeningPorts, [43123, 43125]);

  const enhancedScanner = new EnhancedCLIScanner(
    {},
    {
      antigravityLocalQuota: {
        fetch: async () => ({
          accountEmail: 'merteren1997977@gmail.com',
          fiveHour: localSummary.fiveHour,
          weekly: localSummary.weekly,
          source: 'test-local-quota-summary',
        }),
      },
    }
  );
  enhancedScanner.detectAntigravityEmail = () => 'merteren1997977@gmail.com';
  const liveAntigravity = await enhancedScanner.scanAntigravity();
  assert.equal(liveAntigravity.account_email, 'merteren1997977@gmail.com');
  assert.equal(liveAntigravity.rolling_5h_percent, 0);
  assert.equal(liveAntigravity.weekly_usage_percent, 6.9);
  assert.equal(liveAntigravity.scan_status, 'live');
  assert.equal(enhancedScanner.hasObservedQuota(liveAntigravity), true);

  const integrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atris-ag-integration-'));
  try {
    const integration = new AntigravityIntegration({ platform: 'win32' });
    integration.baseDir = integrationDir;
    integration.settingsPath = path.join(integrationDir, 'settings.json');
    integration.cachePath = path.join(integrationDir, 'atris-statusline-state.json');
    integration.backupPath = path.join(integrationDir, 'atris-statusline-backup.json');
    integration.scriptPath = path.join(integrationDir, 'atris-statusline-bridge.ps1');

    const commentedSettings = `\uFEFF// Antigravity accepts comments in settings.json\n{\n  "theme": "dark", // keep this preference\n  /* existing custom status line */\n  "statusLine": {\n    "type": "command",\n    "command": "existing-statusline-command"\n  }\n}\n`;
    fs.writeFileSync(integration.settingsPath, commentedSettings, 'utf8');

    const initialStatus = integration.getStatus();
    assert.equal(initialStatus.settings_error, null);

    const enabled = integration.enable();
    assert.equal(enabled.enabled, true);
    assert.equal(fs.existsSync(integration.scriptPath), true);
    let enabledSettings = JSON.parse(fs.readFileSync(integration.settingsPath, 'utf8'));
    assert.ok(enabledSettings.statusLine.command.includes('-EncodedCommand'));
    assert.equal(/(?:^|\s)-File(?:\s|$)/i.test(enabledSettings.statusLine.command), false);

    const encoded = enabledSettings.statusLine.command.split('-EncodedCommand ')[1];
    const decodedLauncher = Buffer.from(encoded, 'base64').toString('utf16le');
    assert.ok(decodedLauncher.includes(integration.scriptPath));

    // Reproduce the v1.0.1 Windows failure visible in the screenshot. The old
    // command passes quoted path characters through to PowerShell -File.
    enabledSettings.statusLine.command =
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${integration.scriptPath}"`;
    fs.writeFileSync(integration.settingsPath, `${JSON.stringify(enabledSettings, null, 2)}\n`, 'utf8');
    assert.equal(integration.getStatus().needs_repair, true);

    const repaired = integration.repairIfNeeded();
    assert.equal(repaired.enabled, true);
    assert.equal(repaired.needs_repair, false);
    enabledSettings = JSON.parse(fs.readFileSync(integration.settingsPath, 'utf8'));
    assert.ok(enabledSettings.statusLine.command.includes('-EncodedCommand'));
    assert.equal(/(?:^|\s)-File(?:\s|$)/i.test(enabledSettings.statusLine.command), false);

    integration.disable();
    const restoredRaw = fs.readFileSync(integration.settingsPath, 'utf8');
    assert.equal(restoredRaw, commentedSettings);
  } finally {
    fs.rmSync(integrationDir, { recursive: true, force: true });
  }

  // Portable builds must register the stable wrapper EXE, not Electron's
  // temporary extracted process path, when enabling Windows startup.
  let startupEnabled = false;
  let lastStartupSettings = null;
  const portablePath = 'C:\\Tools\\AtrisTracker-Portable-1.0.2.exe';
  const mockApp = {
    isPackaged: true,
    getLoginItemSettings: ({ path: launchPath, args }) => ({
      openAtLogin:
        startupEnabled &&
        launchPath === portablePath &&
        Array.isArray(args) &&
        args.includes('--startup'),
      executableWillLaunchAtLogin: startupEnabled,
    }),
    setLoginItemSettings: (settings) => {
      lastStartupSettings = settings;
      startupEnabled = Boolean(settings.openAtLogin);
    },
  };
  const startup = new StartupManager(mockApp, {
    platform: 'win32',
    env: { PORTABLE_EXECUTABLE_FILE: portablePath },
    execPath: 'C:\\Temp\\atris-extracted\\AtrisTracker.exe',
  });
  assert.equal(startup.getLaunchPath(), portablePath);
  assert.equal(startup.getStatus().enabled, false);
  assert.equal(startup.setEnabled(true).enabled, true);
  assert.equal(lastStartupSettings.path, portablePath);
  assert.deepEqual(lastStartupSettings.args, ['--startup']);
  assert.equal(startup.setEnabled(false).enabled, false);

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

    // A provider may legitimately expose only its weekly window. The latest
    // snapshot must clear an old 5h window instead of carrying it forward.
    db.addSnapshot({
      tool: 'codex',
      account_email: 'weekly-only@example.com',
      rolling_5h_percent: 38,
      next_5h_reset_at: '2026-08-10T15:00:00Z',
      weekly_usage_percent: 27,
      weekly_reset_at: '2026-08-14T00:00:00Z',
      source: 'test',
    });
    db.addSnapshot({
      tool: 'codex',
      account_email: 'weekly-only@example.com',
      rolling_5h_percent: null,
      next_5h_reset_at: null,
      weekly_usage_percent: 64,
      weekly_reset_at: '2026-08-17T00:00:00Z',
      source: 'test',
    });
    const weeklyOnlySnapshot = db.getLatestSnapshotByAccount('codex', 'weekly-only@example.com');
    assert.equal(weeklyOnlySnapshot.rolling_5h_percent, null);
    assert.equal(weeklyOnlySnapshot.weekly_usage_percent, 64);
    assert.equal(db.getUsageHistoryByAccount('codex', 'weekly-only@example.com').length, 2);

    db.addSnapshot({
      tool: 'codex',
      account_email: 'five-hour-only@example.com',
      rolling_5h_percent: 38,
      next_5h_reset_at: '2026-08-10T15:00:00Z',
      weekly_usage_percent: 27,
      weekly_reset_at: '2026-08-14T00:00:00Z',
      source: 'test',
    });
    db.addSnapshot({
      tool: 'codex',
      account_email: 'five-hour-only@example.com',
      rolling_5h_percent: 51,
      next_5h_reset_at: '2026-08-10T20:00:00Z',
      weekly_usage_percent: null,
      weekly_reset_at: null,
      source: 'test',
    });
    const fiveHourOnlySnapshot = db.getLatestSnapshotByAccount('codex', 'five-hour-only@example.com');
    assert.equal(fiveHourOnlySnapshot.rolling_5h_percent, 51);
    assert.equal(fiveHourOnlySnapshot.weekly_usage_percent, null);

    db.addSnapshot({
      tool: 'codex',
      account_email: 'zero-usage@example.com',
      rolling_5h_percent: 0,
      weekly_usage_percent: 0,
      source: 'test',
    });
    const zeroUsageSnapshot = db.getLatestSnapshotByAccount('codex', 'zero-usage@example.com');
    assert.equal(zeroUsageSnapshot.rolling_5h_percent, 0);
    assert.equal(zeroUsageSnapshot.weekly_usage_percent, 0);

    const accounts = db.getAccountsByTool('antigravity');
    assert.equal(accounts[0].email, 'second@example.com');
    assert.equal(accounts[0].active, 1);
    assert.equal(accounts.find((account) => account.email === 'first@example.com').active, 0);

    // A scan that discovers the new account but has no live quota must not create
    // a fake zero snapshot or overwrite the previous account's cached values.
    assert.equal(db.getUsageHistoryByAccount('antigravity', 'second@example.com').length, 0);

    // Switching the logged-in Codex account: the new account becomes active with
    // fresh data, the old account keeps its last snapshot and stays viewable.
    db.addSnapshot({
      tool: 'codex',
      account_email: 'old@example.com',
      weekly_usage_percent: 41,
      weekly_reset_at: '2026-08-17T00:00:00Z',
      source: 'codex-app-server:account/rateLimits/read',
    });
    db.addSnapshot({
      tool: 'codex',
      account_email: 'new@example.com',
      weekly_usage_percent: 100,
      weekly_reset_at: '2026-08-20T05:28:22Z',
      source: 'codex-app-server:account/rateLimits/read',
    });
    const codexAccounts = db.getAccountsByTool('codex');
    assert.equal(codexAccounts.find((account) => account.email === 'new@example.com').active, 1);
    assert.equal(codexAccounts.find((account) => account.email === 'old@example.com').active, 0);
    // Default lookup follows the active account; per-account lookup returns the
    // old account's last snapshot.
    assert.equal(db.getLatestSnapshot('codex').account_email, 'new@example.com');
    assert.equal(db.getLatestSnapshot('codex').weekly_usage_percent, 100);
    assert.equal(
      db.getLatestSnapshotByAccount('codex', 'old@example.com').weekly_usage_percent,
      41
    );
    assert.equal(db.getLatestSnapshotByAccount('codex', 'old@example.com').weekly_reset_at, '2026-08-17T00:00:00.000Z');

    // Deleting a stored (inactive) account removes its record and history; the
    // active account is protected so a live session can never be wiped.
    db.addSnapshot({
      tool: 'claudecode',
      account_email: 'old-claude@example.com',
      rolling_5h_percent: 10,
      weekly_usage_percent: 20,
      source: 'test',
    });
    db.addSnapshot({
      tool: 'claudecode',
      account_email: 'current-claude@example.com',
      rolling_5h_percent: 5,
      weekly_usage_percent: 10,
      source: 'test',
    });
    assert.equal(db.deleteAccount('claudecode', 'current-claude@example.com'), false);
    assert.equal(db.deleteAccount('claudecode', 'old-claude@example.com'), true);
    assert.deepEqual(
      db.getAccountsByTool('claudecode').map((account) => account.email),
      ['current-claude@example.com']
    );
    assert.equal(db.getUsageHistoryByAccount('claudecode', 'old-claude@example.com').length, 0);
    assert.equal(db.deleteAccount('claudecode', 'does-not-exist@example.com'), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('AtrisTracker backend smoke test passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
