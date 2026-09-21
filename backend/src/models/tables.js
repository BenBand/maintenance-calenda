const pool = require('../config/database');

async function createTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'admin' CHECK (role IN ('admin')),
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
    `CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      department VARCHAR(255),
      room VARCHAR(255),
      asset_type VARCHAR(100) CHECK (asset_type IN ('laptop', 'desktop', 'network_equipment', 'printer')),
      asset_identifier VARCHAR(255),
      priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
      reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
      ip_address VARCHAR(255),
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
    'CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_department ON incidents(department)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by)',
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

module.exports = { createTables };
