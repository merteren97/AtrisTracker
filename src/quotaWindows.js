const FIVE_HOUR_KIND = '5h';
const WEEKLY_KIND = 'weekly';

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampPercent(value) {
  const number = toFiniteNumber(value);
  if (number === null) return null;
  return Math.max(0, Math.min(100, number));
}

function getPercent(data, kind) {
  if (!data) return null;
  if (kind === FIVE_HOUR_KIND) {
    return clampPercent(data.rolling_5h_percent ?? data.usage_percent);
  }
  if (kind !== WEEKLY_KIND) return null;
  return clampPercent(data.weekly_usage_percent ?? data.weekly_usage_count);
}

function getResetAt(data, kind) {
  if (!data) return null;
  const value = kind === FIVE_HOUR_KIND ? data.next_5h_reset_at : data.weekly_reset_at;
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function createWindowState(data, kind, nowMs) {
  const rawPercent = getPercent(data, kind);
  const resetAtMs = getResetAt(data, kind);
  const available = rawPercent !== null || resetAtMs !== null;
  const expired = available && resetAtMs !== null && resetAtMs <= nowMs;

  return {
    kind,
    available,
    rawPercent,
    percent: expired ? 0 : rawPercent,
    resetAtMs,
    resetAtISO: resetAtMs === null ? null : new Date(resetAtMs).toISOString(),
    expired,
    status: expired ? 'reset' : 'active',
    durationSeconds: kind === FIVE_HOUR_KIND ? 5 * 60 * 60 : 7 * 24 * 60 * 60,
  };
}

export function getQuotaWindowState(data, nowMs = Date.now()) {
  const fiveHour = createWindowState(data, FIVE_HOUR_KIND, nowMs);
  const weekly = createWindowState(data, WEEKLY_KIND, nowMs);
  const primary = fiveHour.available ? fiveHour : weekly.available ? weekly : null;
  return { fiveHour, weekly, primary };
}

export function getHistoryPercent(snapshot, kind) {
  return getPercent(snapshot, kind);
}

export function getWindowLabel(kind) {
  return kind === FIVE_HOUR_KIND ? '5 Saatlik' : 'Haftalık';
}

export { FIVE_HOUR_KIND, WEEKLY_KIND };
