require('dotenv').config();
const { createTables } = require('./models/tables');
const pool = require('./config/database');

async function migrate() {
  console.log('Running database migration...');
  try {
    await createTables();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();