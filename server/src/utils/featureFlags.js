const pool = require('../config/db');

const cache = new Map();
const CACHE_TTL_MS = 15000;

async function getFlagValue(flagKey, fallback = false) {
  const key = String(flagKey || '').trim();
  if (!key) return fallback;
  const cached = cache.get(key);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.value;
  }
  const { rows } = await pool.query(
    `SELECT flag_value
     FROM feature_flags
     WHERE flag_key = $1
     LIMIT 1`,
    [key]
  );
  const row = rows[0];
  const value = row ? row.flag_value : fallback;
  cache.set(key, { value, fetchedAt: Date.now() });
  return value;
}

async function isFlagEnabled(flagKey, fallback = false) {
  const value = await getFlagValue(flagKey, fallback);
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'enabled')) {
    return Boolean(value.enabled);
  }
  return Boolean(value);
}

function clearFeatureFlagCache(flagKey = null) {
  if (flagKey) {
    cache.delete(String(flagKey));
    return;
  }
  cache.clear();
}

module.exports = {
  getFlagValue,
  isFlagEnabled,
  clearFeatureFlagCache,
};
