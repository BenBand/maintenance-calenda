const crypto = require('crypto');

function validateEnv() {
  const errors = [];

  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is not set in environment variables.');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long.');
  }

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set in environment variables.');
  }

  if (errors.length > 0) {
    throw new Error('Environment validation failed:\n' + errors.join('\n'));
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && process.env.JWT_SECRET === 'maintenance_calendar_jwt_secret_2026') {
    throw new Error('JWT_SECRET must be changed from its default value in production.');
  }
}

module.exports = { validateEnv };
