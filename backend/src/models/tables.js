const pool = require('../config/database');

async function createTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'staff' CHECK (role IN ('admin', 'manager', 'staff')),
      department VARCHAR(255),
      room_number VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS maintenance_schedules (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      department VARCHAR(255) NOT NULL,
      room VARCHAR(255) NOT NULL,
      asset_type VARCHAR(100) NOT NULL CHECK (asset_type IN ('laptop', 'desktop', 'network_equipment', 'printer')),
      asset_identifier VARCHAR(255),
      description TEXT,
      technician VARCHAR(255) NOT NULL,
      priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      reminder_days INTEGER DEFAULT 1,
      status VARCHAR(30) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'overdue')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS service_records (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
      work_performed TEXT NOT NULL,
      outcome TEXT,
      follow_up TEXT,
      signer_name VARCHAR(255),
      signer_date DATE,
      signature_data TEXT,
      signed_by VARCHAR(255),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(255) NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id INTEGER,
      details JSONB,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_maintenance_date ON maintenance_schedules(date)',
    'CREATE INDEX IF NOT EXISTS idx_maintenance_department ON maintenance_schedules(department)',
    'CREATE INDEX IF NOT EXISTS idx_maintenance_asset_type ON maintenance_schedules(asset_type)',
    'CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_schedules(status)',
    'CREATE INDEX IF NOT EXISTS idx_maintenance_technician ON maintenance_schedules(technician)',
    'CREATE INDEX IF NOT EXISTS idx_maintenance_created_at ON maintenance_schedules(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_service_schedule ON service_records(schedule_id)',
    'CREATE INDEX IF NOT EXISTS idx_service_created_at ON service_records(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }
  for (const sql of indexes) {
    await pool.query(sql);
  }
  console.log('Database initialization completed');
}

async function seedAdmin() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@lcc.gov.zm';
  const adminRole = process.env.ADMIN_ROLE || 'admin';
  const adminDepartment = process.env.ADMIN_DEPARTMENT || 'IT';
  const adminRoom = process.env.ADMIN_ROOM || '101';

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [adminUsername]);
    if (result.rows.length === 0) {
      const bcrypt = require('bcrypt');
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
      const passwordHash = await bcrypt.hash(adminPassword, saltRounds);
      await pool.query(
        'INSERT INTO users (username, email, password_hash, role, department, room_number) VALUES ($1, $2, $3, $4, $5, $6)',
        [adminUsername, adminEmail, passwordHash, adminRole, adminDepartment, adminRoom]
      );
      console.log(`Admin user seeded: ${adminUsername}`);
    } else {
      console.log(`Admin user already exists: ${adminUsername}`);
    }
  } catch (error) {
    console.error('Seed admin error:', error);
  }
}

module.exports = { createTables, seedAdmin };
