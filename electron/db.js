const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class UsageDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    const SQL = await initSqlJs();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      this.db = new SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      this.db = new SQL.Database();
    }

    this.initTables();
    this.save();
  }

  save() {
    if (!this.db) return;
    const buffer = Buffer.from(this.db.export());
    fs.writeFileSync(this.dbPath, buffer);
  }

  initTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        tool TEXT NOT NULL,
        email TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        last_login TEXT NOT NULL
      );

      -- v1 usage_snapshots is intentionally kept for backwards compatibility,
      -- but it contained heuristic/fallback data in older AtrisTracker builds.
      CREATE TABLE IF NOT EXISTS usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        account_email TEXT NOT NULL,
        usage_percent REAL NOT NULL,
        limit_count INTEGER NOT NULL,
        used_count INTEGER NOT NULL,
        rolling_5h_percent REAL NOT NULL,
        next_5h_reset_at TEXT NOT NULL,
        weekly_usage_count INTEGER NOT NULL,
        weekly_reset_at TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      -- v2 stores only provider-observed quota values. Window fields are nullable
      -- because a provider can temporarily omit one of the windows.
      CREATE TABLE IF NOT EXISTS quota_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        account_email TEXT NOT NULL,
        five_hour_used_percent REAL,
        five_hour_reset_at TEXT,
        weekly_used_percent REAL,
        weekly_reset_at TEXT,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_quota_tool_account_id
        ON quota_snapshots(tool, account_email, id DESC);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Remove synthetic identities created by the pre-v2 heuristic scanner.
      DELETE FROM accounts
       WHERE email IN ('Active Gemini Account', 'Active Codex Account', 'Active Claude Account')
          OR (tool = 'claudecode' AND email = 'mert@anthropic.com');
    `);
  }

  queryAll(sql, params = []) {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  queryOne(sql, params = []) {
    return this.queryAll(sql, params)[0] || null;
  }

  normalizeEmail(email) {
    return typeof email === 'string' ? email.trim() : '';
  }

  saveAccount(tool, email, active = true) {
    if (!this.db) return null;
    const normalizedEmail = this.normalizeEmail(email);
    if (!tool || !normalizedEmail) return null;

    const id = `${tool}:${normalizedEmail.toLowerCase()}`;
    const now = new Date().toISOString();

    if (active) {
      this.db.run('UPDATE accounts SET active = 0 WHERE tool = ?', [tool]);
    }

    this.db.run(
      `INSERT INTO accounts (id, tool, email, active, created_at, last_login)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         active = excluded.active,
         last_login = excluded.last_login`,
      [id, tool, normalizedEmail, active ? 1 : 0, now, now]
    );
    this.save();
    return id;
  }

  addSnapshot(snapshot) {
    if (!this.db || !snapshot) return false;
    const {
      tool,
      account_email,
      rolling_5h_percent,
      next_5h_reset_at,
      weekly_usage_percent,
      weekly_usage_count,
      weekly_reset_at,
      source = 'provider',
    } = snapshot;

    const email = this.normalizeEmail(account_email);
    if (!tool || !email) return false;

    const fiveHour = this.clampPercent(rolling_5h_percent);
    const weekly = this.clampPercent(
      weekly_usage_percent !== undefined ? weekly_usage_percent : weekly_usage_count
    );
    const fiveHourReset = this.normalizeIso(next_5h_reset_at);
    const weeklyReset = this.normalizeIso(weekly_reset_at);

    // A scanner may discover an account before the provider exposes quota data.
    // In that case record the account, but never write invented zero/default usage.
    this.saveAccount(tool, email, true);
    if (fiveHour === null && weekly === null) return false;

    const latest = this.queryOne(
      `SELECT five_hour_used_percent, five_hour_reset_at, weekly_used_percent, weekly_reset_at, source
       FROM quota_snapshots
       WHERE tool = ? AND account_email = ?
       ORDER BY id DESC LIMIT 1`,
      [tool, email]
    );

    const effective = {
      fiveHour: fiveHour !== null ? fiveHour : this.clampPercent(latest?.five_hour_used_percent),
      fiveHourReset: fiveHourReset || latest?.five_hour_reset_at || null,
      weekly: weekly !== null ? weekly : this.clampPercent(latest?.weekly_used_percent),
      weeklyReset: weeklyReset || latest?.weekly_reset_at || null,
    };

    const unchanged =
      latest &&
      this.sameNullableNumber(latest.five_hour_used_percent, effective.fiveHour) &&
      (latest.five_hour_reset_at || null) === effective.fiveHourReset &&
      this.sameNullableNumber(latest.weekly_used_percent, effective.weekly) &&
      (latest.weekly_reset_at || null) === effective.weeklyReset &&
      latest.source === source;

    if (unchanged) return false;

    this.db.run(
      `INSERT INTO quota_snapshots (
         tool, account_email, five_hour_used_percent, five_hour_reset_at,
         weekly_used_percent, weekly_reset_at, source, fetched_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tool,
        email,
        effective.fiveHour,
        effective.fiveHourReset,
        effective.weekly,
        effective.weeklyReset,
        source,
        new Date().toISOString(),
      ]
    );
    this.save();
    return true;
  }

  clampPercent(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.round(Math.max(0, Math.min(100, num)) * 10) / 10;
  }

  normalizeIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  sameNullableNumber(a, b) {
    const left = this.clampPercent(a);
    const right = this.clampPercent(b);
    return left === right;
  }

  toLegacyShape(row) {
    if (!row) return null;
    return {
      id: row.id,
      tool: row.tool,
      account_email: row.account_email,
      usage_percent: row.five_hour_used_percent,
      limit_count: row.five_hour_used_percent === null ? null : 100,
      used_count: row.five_hour_used_percent,
      rolling_5h_percent: row.five_hour_used_percent,
      next_5h_reset_at: row.five_hour_reset_at,
      weekly_usage_count: row.weekly_used_percent,
      weekly_usage_percent: row.weekly_used_percent,
      weekly_reset_at: row.weekly_reset_at,
      source: row.source,
      timestamp: row.fetched_at,
    };
  }

  getLatestSnapshot(tool) {
    if (!this.db) return null;
    const row = this.queryOne(
      `SELECT q.*
       FROM quota_snapshots q
       LEFT JOIN accounts a
         ON a.tool = q.tool AND a.email = q.account_email
       WHERE q.tool = ?
       ORDER BY COALESCE(a.active, 0) DESC, q.id DESC
       LIMIT 1`,
      [tool]
    );
    return this.toLegacyShape(row);
  }

  getAccountsByTool(tool) {
    if (!this.db) return [];
    return this.queryAll(
      `SELECT a.*,
              (SELECT MAX(q.fetched_at)
                 FROM quota_snapshots q
                WHERE q.tool = a.tool AND q.account_email = a.email) AS last_snapshot_at
       FROM accounts a
       WHERE a.tool = ?
       ORDER BY a.active DESC, a.last_login DESC`,
      [tool]
    );
  }

  getActiveAccounts() {
    if (!this.db) return [];
    return this.queryAll(
      'SELECT * FROM accounts WHERE active = 1 ORDER BY tool, last_login DESC'
    );
  }

  getLatestSnapshotByAccount(tool, email) {
    if (!this.db) return null;
    if (!email) return this.getLatestSnapshot(tool);
    const row = this.queryOne(
      `SELECT * FROM quota_snapshots
       WHERE tool = ? AND account_email = ?
       ORDER BY id DESC LIMIT 1`,
      [tool, this.normalizeEmail(email)]
    );
    return this.toLegacyShape(row);
  }

  getUsageHistory(tool, limit = 20) {
    if (!this.db) return [];
    const safeLimit = this.normalizeLimit(limit);
    const rows = this.queryAll(
      `SELECT * FROM quota_snapshots
       WHERE tool = ? ORDER BY id DESC LIMIT ?`,
      [tool, safeLimit]
    );
    return rows.reverse().map((row) => this.toLegacyShape(row));
  }

  getUsageHistoryByAccount(tool, email, limit = 20) {
    if (!this.db) return [];
    const safeLimit = this.normalizeLimit(limit);
    const rows = email
      ? this.queryAll(
          `SELECT * FROM quota_snapshots
           WHERE tool = ? AND account_email = ?
           ORDER BY id DESC LIMIT ?`,
          [tool, this.normalizeEmail(email), safeLimit]
        )
      : this.queryAll(
          `SELECT * FROM quota_snapshots
           WHERE tool = ? ORDER BY id DESC LIMIT ?`,
          [tool, safeLimit]
        );
    return rows.reverse().map((row) => this.toLegacyShape(row));
  }

  normalizeLimit(limit) {
    const value = Number.parseInt(limit, 10);
    if (!Number.isFinite(value)) return 20;
    return Math.max(1, Math.min(500, value));
  }
}

module.exports = UsageDatabase;
