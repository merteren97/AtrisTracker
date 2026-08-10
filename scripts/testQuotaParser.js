const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

function fetchAgyQuota() {
  const agyBin = path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe');
  try {
    const cmd = `"${agyBin}" --output-format json --print "/quota"`;
    const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 12000 });
    const json = JSON.parse(stdout);
    const groups = json?.command?.data?.groups || [];
    
    let gemini5hRemaining = null;
    let gemini5hReset = null;
    let geminiWeeklyRemaining = null;
    let geminiWeeklyReset = null;

    for (const g of groups) {
      if (g.name === 'Gemini Models') {
        for (const b of g.buckets || []) {
          if (b.window === '5h') {
            gemini5hRemaining = b.remaining_fraction;
            gemini5hReset = b.reset_time;
          } else if (b.window === 'weekly') {
            geminiWeeklyRemaining = b.remaining_fraction;
            geminiWeeklyReset = b.reset_time;
          }
        }
      }
    }

    return {
      gemini5hRemaining,
      gemini5hReset,
      geminiWeeklyRemaining,
      geminiWeeklyReset,
    };
  } catch (e) {
    console.error('Failed to fetch agy quota:', e.message);
    return null;
  }
}

console.log('FETHED QUOTA:', fetchAgyQuota());
