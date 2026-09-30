require('dotenv').config();
const pool = require('./config/database');
const { hashPassword } = require('./utils/bcrypt');
const { ROLES } = require('./middleware/auth');

/**
 * Create the initial admin / manager / developer / user accounts.
 *
 * Deleting every user leaves the system unbootable: only the developer role
 * holds `user:write`, so there would be no way to create the first developer
 * from inside the app. This script does that one-time bootstrap.
 *
 * Credentials come from the environment so no password is ever passed as a
 * command-line argument (where it would land in shell history):
 *
 *   ADMIN_USERNAME=... ADMIN_PASSWORD=... \
 *   MANAGER_USERNAME=... MANAGER_PASSWORD=... \
 *   DEVELOPER_USERNAME=... DEVELOPER_PASSWORD=... \
 *   USER_USERNAME=... USER_PASSWORD=... \
 *   node src/seed.js
 *
 * Optional: SEED_EMAIL_DOMAIN to generate emails from the usernames.
 *
 * Re-running is safe: accounts that already exist are left untouched.
 */

const PASSWORD_MIN_LENGTH = 8;

function readAccount(role) {
  const key = role.toUpperCase();
  const username = (process.env[`${key}_USERNAME`] || '').trim();
  const password = process.env[`${key}_PASSWORD`] || '';
  const email = (process.env[`${key}_EMAIL`] || '').trim()
    || (process.env.SEED_EMAIL_DOMAIN
      ? `${username}@${process.env.SEED_EMAIL_DOMAIN}`
      : '');

  return { role, username, password, email };
}

/**
 * The role CHECK constraint is only widened by migration 000012. Inserting
 * 'developer' before that migration runs fails with a check violation, which
 * is a confusing way to discover the migration was skipped.
 */
async function assertRoleConstraintReady() {
  const result = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'users'::regclass AND conname = 'users_role_check'`
  );
  const def = result.rows[0]?.def;
  if (!def) {
    throw new Error(
      'users_role_check not found. Run the migrations first:\n  npm run migrate'
    );
  }
  if (!def.includes(ROLES.DEVELOPER) || !def.includes(ROLES.USER)) {
    throw new Error(
      `The users.role constraint is still "${def}".\n` +
      'It does not allow the "developer" and/or "user" role yet, so the seeded accounts\n' +
      'would be rejected. Run the migrations first:\n  npm run migrate'
    );
  }
  return def;
}

function validateAccount(account) {
  const problems = [];
  if (!account.username) {
    problems.push(`username is missing (set ${account.role.toUpperCase()}_USERNAME)`);
  } else if (account.username.length < 3 || account.username.length > 100) {
    problems.push(`username "${account.username}" must be 3-100 characters`);
  }
  if (!account.email) {
    problems.push(`email is missing (set ${account.role.toUpperCase()}_EMAIL or SEED_EMAIL_DOMAIN)`);
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) {
    problems.push(`email "${account.email}" is not a valid address`);
  }
  if (!account.password) {
    problems.push(`password is missing (set ${account.role.toUpperCase()}_PASSWORD)`);
  } else if (account.password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  return problems;
}

async function createAccount(account) {
  const existing = await pool.query(
    'SELECT id, role FROM users WHERE username = $1',
    [account.username]
  );
  if (existing.rows.length > 0) {
    return { ...account, status: 'exists', id: existing.rows[0].id, existingRole: existing.rows[0].role };
  }

  const passwordHash = await hashPassword(account.password);
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [account.username, account.email, passwordHash, account.role]
  );
  return { ...account, status: 'created', id: result.rows[0].id };
}

async function seed() {
  console.log('Seeding initial accounts...\n');

  const constraint = await assertRoleConstraintReady();
  console.log(`  role constraint: ${constraint}\n`);

  const accounts = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER, ROLES.USER].map(readAccount);

  const problems = accounts.flatMap(validateAccount);
  if (problems.length > 0) {
    console.error('Cannot seed. Fix the following first:\n');
    problems.forEach((problem) => console.error(`  - ${problem}`));
    console.error('\nExample:\n');
    console.error('  SEED_EMAIL_DOMAIN=lusaka.gov.zm \\');
    console.error('  ADMIN_USERNAME=admin ADMIN_PASSWORD=... \\');
    console.error('  MANAGER_USERNAME=manager MANAGER_PASSWORD=... \\');
    console.error('  DEVELOPER_USERNAME=developer DEVELOPER_PASSWORD=... \\');
    console.error('  USER_USERNAME=user USER_PASSWORD=... \\');
    console.error('  node src/seed.js');
    process.exit(1);
  }

  for (const account of accounts) {
    const result = await createAccount(account);
    const label = result.status === 'created' ? 'created' : 'already exists';
    const note = result.status === 'exists' && result.existingRole !== account.role
      ? `  <-- WARNING: existing role is "${result.existingRole}", not "${account.role}"`
      : '';
    console.log(`  [${result.status.padEnd(12)}] ${result.role.padEnd(10)} ${result.username}${note}`);
  }

  // A system with no developer cannot manage users, and one with no admin
  // cannot action the queue, so make a missing role loud rather than silent.
  const existing = await pool.query('SELECT role, count(*)::int AS total FROM users GROUP BY role');
  const counts = Object.fromEntries(existing.rows.map((row) => [row.role, row.total]));

  console.log('\nFinal role counts:');
  for (const role of [ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER, ROLES.USER]) {
    console.log(`  ${role.padEnd(10)} ${counts[role] || 0}`);
  }

  if (!counts[ROLES.ADMIN]) {
    console.warn('\n  WARNING: no admin exists. Nobody can action the request queue.');
  }
  if (!counts[ROLES.DEVELOPER]) {
    console.warn('\n  WARNING: no developer exists. Nobody can create or manage users.');
  }

  console.log('\nDone. Sign in through the app - do not reuse these passwords elsewhere.');
}

seed()
  .then(() => pool.end())
  .catch((error) => {
    if (error.code === '23514') {
      console.error('\nDatabase rejected a role value. Run the migrations first:\n  npm run migrate');
    } else if (error.code === '23505') {
      console.error('\nA username or email is already taken. Choose different values.');
    } else {
      console.error('\nSeeding failed:', error.message);
    }
    process.exit(1);
  });
