const PLACEHOLDER_VALUES = new Set([
  'change-me',
  'change-me-on-first-login',
  'default-salt-change-me',
  'generate-a-random-salt-here',
  'replace-with-strong-secret-from-openssl-rand-base64-64-minimum-32-chars',
  'replace-with-a-strong-64-char-secret-generated-via-openssl-rand-base64-64',
]);

function looksLikePlaceholder(value) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(normalized)) return true;
  return /^(replace|change|generate|your-|example|placeholder)/.test(normalized) || normalized.includes('changeme');
}

function validateEnv() {
  const errors = [];

  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is not set in environment variables.');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long.');
  } else if (looksLikePlaceholder(process.env.JWT_SECRET)) {
    errors.push('JWT_SECRET is still the example placeholder value. Generate one with `openssl rand -base64 64`.');
  }

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set in environment variables.');
  }

  if (looksLikePlaceholder(process.env.AUDIT_IP_SALT)) {
    errors.push('AUDIT_IP_SALT must be set to a random value. Without it, audit log IP hashes are trivially reversible.');
  }

  if (!process.env.CLIENT_ORIGIN) {
    errors.push('CLIENT_ORIGIN is not set in environment variables (comma-separated list of allowed frontend origins).');
  }

  if (errors.length > 0) {
    throw new Error('Environment validation failed:\n' + errors.join('\n'));
  }
}

module.exports = { validateEnv, looksLikePlaceholder };
