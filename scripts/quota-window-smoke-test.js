import assert from 'node:assert/strict';
import {
  FIVE_HOUR_KIND,
  WEEKLY_KIND,
  getHistoryPercent,
  getQuotaWindowState,
} from '../src/quotaWindows.js';

const nowMs = Date.parse('2026-08-24T12:00:00Z');

const expiredFiveHour = getQuotaWindowState(
  {
    rolling_5h_percent: 45,
    next_5h_reset_at: '2026-08-24T11:00:00Z',
    weekly_usage_percent: 20,
    weekly_reset_at: '2026-08-28T12:00:00Z',
  },
  nowMs
);
assert.equal(expiredFiveHour.primary.kind, FIVE_HOUR_KIND);
assert.equal(expiredFiveHour.fiveHour.percent, 0);
assert.equal(expiredFiveHour.fiveHour.expired, true);
assert.equal(expiredFiveHour.weekly.percent, 20);

const weeklyOnly = getQuotaWindowState(
  {
    rolling_5h_percent: null,
    next_5h_reset_at: null,
    weekly_usage_percent: 62,
    weekly_reset_at: '2026-08-28T12:00:00Z',
  },
  nowMs
);
assert.equal(weeklyOnly.primary.kind, WEEKLY_KIND);
assert.equal(weeklyOnly.fiveHour.available, false);
assert.equal(weeklyOnly.weekly.percent, 62);

assert.equal(
  getHistoryPercent({ rolling_5h_percent: null, weekly_usage_percent: 0 }, WEEKLY_KIND),
  0
);
assert.equal(
  getHistoryPercent({ rolling_5h_percent: null, weekly_usage_percent: 62 }, FIVE_HOUR_KIND),
  null
);

console.log('AtrisTracker quota window smoke test passed.');
