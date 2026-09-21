require('dotenv').config();
const pool = require('./config/database');
const { hashPassword } = require('./utils/bcrypt');

async function seed() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL } = process.env;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_EMAIL) {
    console.error('ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_EMAIL must be set in .env to seed the admin user.');
    process.exit(1);
  }

  console.log('Seeding admin user...');
  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [ADMIN_USERNAME]);
    if (existing.rows.length > 0) {
      console.log(`Admin user "${ADMIN_USERNAME}" already exists. Skipping.`);
      return;
    }

    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [ADMIN_USERNAME, ADMIN_EMAIL, passwordHash, 'admin']
    );
    const user = result.rows[0];
    console.log(`Admin user created: id=${user.id}, username=${user.username}, email=${user.email}, role=${user.role}`);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
