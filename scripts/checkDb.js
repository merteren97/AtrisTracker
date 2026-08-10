const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function test() {
  const SQL = await initSqlJs();
  const dbPath = path.join(process.env.APPDATA, 'atris-tracker', 'ai_usage_tracker.db');
  if (fs.existsSync(dbPath)) {
    const db = new SQL.Database(fs.readFileSync(dbPath));
    console.log('--- ACTIVE ACCOUNTS IN DB ---');
    console.log(JSON.stringify(db.exec('SELECT * FROM accounts WHERE active = 1'), null, 2));
    console.log('--- LATEST SNAPSHOTS ---');
    console.log(JSON.stringify(db.exec('SELECT tool, account_email, timestamp FROM usage_snapshots ORDER BY id DESC LIMIT 3'), null, 2));
  } else {
    console.log('DB not found at:', dbPath);
  }
}

test().catch(console.error);
