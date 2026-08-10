const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CodexAppServerQuota = require('../electron/codexAppServer');
const ClaudeCredentialsResolver = require('../electron/claudeCredentials');
const UpdateManager = require('../electron/updateManager');

async function run() {
  const codex = new CodexAppServerQuota({ platform: 'linux' });
  const codexWindows = codex.mapRateLimits({
    rateLimits: {
      primary: {
        usedPercent: 23.4,
        windowDurationMins: 300,
        resetsAt: 1_786_400_000,
      },
      secondary: {
        usedPercent: 57,
        windowDurationMins: 10_080,
        resetsAt: 1_786_800_000,
      },
    },
  });
  assert.equal(codexWindows.fiveHour.usedPercent, 23.4);
  assert.equal(codexWindows.weekly.usedPercent, 57);
  assert.ok(codexWindows.fiveHour.resetAt.endsWith('Z'));

  const codexByLimitId = codex.mapRateLimits({
    rateLimitsByLimitId: {
      codex: {
        primary: { usedPercent: 8, windowDurationMins: 300 },
        secondary: { usedPercent: 12, windowDurationMins: 10_080 },
      },
    },
  });
  assert.equal(codexByLimitId.fiveHour.usedPercent, 8);
  assert.equal(codexByLimitId.weekly.usedPercent, 12);

  const envToken = `sk-ant-oat01-${'a'.repeat(40)}`;
  const envResolver = new ClaudeCredentialsResolver({
    platform: 'linux',
    env: { CLAUDE_CODE_OAUTH_TOKEN: envToken },
  });
  assert.equal(envResolver.readOAuthToken(), envToken);

  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'atris-claude-credentials-'));
  try {
    const configDir = path.join(tempHome, 'custom-claude');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, '.credentials.json'),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: `sk-ant-oat01-${'b'.repeat(40)}`,
          email: 'claude-test@example.com',
        },
      }),
      'utf8'
    );

    const configResolver = new ClaudeCredentialsResolver({
      home: tempHome,
      platform: 'linux',
      env: { CLAUDE_CONFIG_DIR: configDir },
    });
    assert.ok(configResolver.readOAuthToken().startsWith('sk-ant-oat01-'));
    assert.equal(configResolver.detectEmail(), 'claude-test@example.com');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }

  const keychainToken = `sk-ant-oat01-${'c'.repeat(40)}`;
  const keychainResolver = new ClaudeCredentialsResolver({
    platform: 'darwin',
    env: {},
    execFileSync: (_binary, args) => {
      assert.equal(args[0], 'find-generic-password');
      return JSON.stringify({ claudeAiOauth: { accessToken: keychainToken } });
    },
  });
  assert.equal(keychainResolver.readOAuthToken(), keychainToken);

  const updateManager = new UpdateManager(
    { getVersion: () => '1.0.2' },
    { openExternal: async () => {} },
    { isSupported: () => false }
  );
  assert.equal(updateManager.normalizeVersion('v1.4.7'), '1.4.7');
  assert.equal(updateManager.compareVersions('1.4.7', '1.0.2'), 1);
  assert.equal(updateManager.compareVersions('1.0.2', '1.0.2'), 0);
  assert.equal(updateManager.compareVersions('1.0.1', '1.0.2'), -1);

  console.log('AtrisTracker provider probe smoke test passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
