const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || 'Africa/Lusaka';

const PERIOD_PRESETS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '6m': 182,
  '12m': 365,
  ytd: null,
};

function isValidInstant(value) {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function normalizePreset(preset) {
  if (!preset) return null;
  const key = String(preset).trim().toLowerCase();
  if (key === 'ytd') return 'ytd';
  return PERIOD_PRESETS[key] ? key : null;
}

/**
 * Resolve a reporting window from `from`/`to` query params, falling back to
 * a named preset and finally to the trailing 90 days. Returns ISO strings so
 * the result is safe to log and to hand straight back to the client.
 */
function resolveRange(query = {}, { defaultPreset = '90d' } = {}) {
  const now = new Date();

  if (isValidInstant(query.from) && isValidInstant(query.to)) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (from > to) {
      const swap = from;
      from.setTime(to.getTime());
      to.setTime(swap.getTime());
    }
    return { from, to, preset: 'custom', timezone: DEFAULT_TIMEZONE };
  }

  const preset = normalizePreset(query.period) || normalizePreset(defaultPreset) || '90d';

  if (preset === 'ytd') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { from, to: now, preset, timezone: DEFAULT_TIMEZONE };
  }

  const days = PERIOD_PRESETS[preset] || 90;
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    to: now,
    preset,
    timezone: DEFAULT_TIMEZONE,
  };
}

/**
 * Build the SQL fragment that shifts a `timestamptz` into the reporting
 * timezone. Grouping calendar buckets in UTC would put a 23:00 slot in the
 * wrong day for Lusaka (UTC+2), so every bucketing expression goes through
 * here. The timezone is passed as a bind parameter, never interpolated.
 */
function localTimestampExpression(column, timezoneParam) {
  return `(${column} AT TIME ZONE $${timezoneParam})`;
}

module.exports = {
  DEFAULT_TIMEZONE,
  PERIOD_PRESETS,
  resolveRange,
  isValidInstant,
  normalizePreset,
  localTimestampExpression,
};
