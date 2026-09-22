require('dotenv').config();
const path = require('path');
const { runner } = require('node-pg-migrate');

const migrationsDir = path.join(__dirname, '../database/migrations');

async function migrate() {
  console.log('Running database migrations...');
  try {
    const migrations = await runner({
      dir: migrationsDir,
      migrationsTable: 'pgmigrations',
      schema: 'public',
      databaseUrl: process.env.DATABASE_URL,
      direction: 'up',
      log: (msg) => console.log(msg),
    });
    if (migrations.length === 0) {
      console.log('No pending migrations to run');
    } else {
      console.log(`Applied ${migrations.length} migration(s):`);
      migrations.forEach((m) => console.log(`  - ${m.name}`));
    }
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();