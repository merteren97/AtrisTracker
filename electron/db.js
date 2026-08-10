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

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const filebuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(filebuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initTables();
    this.save();
  }

  save() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
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

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // Record an account
  saveAccount(tool, email) {
    if (!this.db) return;
    const id = `${tool}:${email}`;
    const now = new Date().toISOString();

    if (tool === 'antigravity') {
      this.db.run(`UPDATE accounts SET active = 0 WHERE tool = ?`, [tool]);
    }

    this.db.run(
      `INSERT OR REPLACE INTO accounts (id, tool, email, active, created_at, last_login) VALUES (?, ?, ?, 1, ?, ?)`,
      [id, tool, email, now, now]
    );
    this.save();
  }

  // Record a new usage snapshot
  addSnapshot(snapshot) {
    if (!this.db) return;
    const {
      tool,
      account_email,
      usage_percent,
      limit_count,
      used_count,
      rolling_5h_percent,
      next_5h_reset_at,
      weekly_usage_count,
      weekly_reset_at,
    } = snapshot;

    const timestamp = new Date().toISOString();

    if (account_email) {
      this.saveAccount(tool, account_email);
    }

    this.db.run(
      `INSERT INTO usage_snapshots (
        tool, account_email, usage_percent, limit_count, used_count,
        rolling_5h_percent, next_5h_reset_at, weekly_usage_count, weekly_reset_at, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tool,
        account_email || 'default',
        usage_percent,
        limit_count,
        used_count,
        rolling_5h_percent,
        next_5h_reset_at,
        weekly_usage_count,
        weekly_reset_at,
        timestamp,
      ]
    );
    this.save();
  }

  // Get latest snapshot for a tool
  getLatestSnapshot(tool) {
    if (!this.db) return null;
    const res = this.db.exec(
      `SELECT * FROM usage_snapshots WHERE tool = '${tool}' ORDER BY id DESC LIMIT 1`
    );
    if (!res || res.length === 0 || !res[0].values.length) return null;

    const columns = res[0].columns;
    const values = res[0].values[0];
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = values[idx];
    });
    return obj;
  }

  // Get all registered accounts for a specific tool
  getAccountsByTool(tool) {
    if (!this.db) return [];
    const res = this.db.exec(
      `SELECT * FROM accounts WHERE tool = '${tool}' ORDER BY active DESC, last_login DESC`
    );
    if (!res || res.length === 0) return [];

    const columns = res[0].columns;
    return res[0].values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }

  // Get latest snapshot for a specific account
  getLatestSnapshotByAccount(tool, email) {
    if (!this.db || !email) return this.getLatestSnapshot(tool);
    const res = this.db.exec(
      `SELECT * FROM usage_snapshots WHERE tool = '${tool}' AND account_email = '${email}' ORDER BY id DESC LIMIT 1`
    );
    if (!res || res.length === 0 || !res[0].values.length) return this.getLatestSnapshot(tool);

    const columns = res[0].columns;
    const values = res[0].values[0];
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = values[idx];
    });
    return obj;
  }

  // Get usage history for a specific account
  getUsageHistoryByAccount(tool, email, limit = 20) {
    if (!this.db) return [];
    const query = email
      ? `SELECT * FROM usage_snapshots WHERE tool = '${tool}' AND account_email = '${email}' ORDER BY id DESC LIMIT ${limit}`
      : `SELECT * FROM usage_snapshots WHERE tool = '${tool}' ORDER BY id DESC LIMIT ${limit}`;
    const res = this.db.exec(query);
    if (!res || res.length === 0) return [];

    const columns = res[0].columns;
    const list = res[0].values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
    return list.reverse();
  }
}

module.exports = UsageDatabase;
