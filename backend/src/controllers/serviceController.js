const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

async function createServiceRecord(req, res) {
  const { schedule_id, work_performed, outcome, follow_up, signer_name, signer_date, signature_data } = req.body;
  const userId = req.user.id;
  if (!schedule_id || !work_performed) {
    return res.status(400).json({ error: 'Schedule ID and work performed are required' });
  }
  try {
    const scheduleResult = await pool.query('SELECT * FROM maintenance_schedules WHERE id = $1', [schedule_id]);
    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Maintenance schedule not found' });
    }
    const result = await pool.query(
      `INSERT INTO service_records (schedule_id, work_performed, outcome, follow_up, signer_name, signer_date, signature_data, signed_by, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [schedule_id, work_performed, outcome || null, follow_up || null, signer_name || null, signer_date || null, signature_data || null, signer_name || null, userId]
    );
    const record = result.rows[0];
    await pool.query('UPDATE maintenance_schedules SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['completed', schedule_id]);
    await logMaintenanceAudit(req, 'CREATE_SERVICE', 'service', record.id, { schedule_id, outcome }, userId);
    res.status(201).json(record);
  } catch (error) {
    console.error('Create service record error:', error);
    res.status(500).json({ error: 'Failed to create service record' });
  }
}

async function getServiceRecords(req, res) {
  const { schedule_id, page, limit } = req.query;
  const offset = ((page || 1) - 1) * (limit || 25);
  const conditions = [];
  const params = [];
  if (schedule_id) { conditions.push(`sr.schedule_id = $${params.length + 1}`); params.push(schedule_id); }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM service_records sr ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    const result = await pool.query(
      `SELECT sr.*, s.date, s.asset_type, s.asset_identifier, s.department, s.room, u.username as signed_by_name, cr.username as created_by_name
       FROM service_records sr
       LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
       LEFT JOIN users u ON sr.signed_by = u.id
       LEFT JOIN users cr ON sr.created_by = cr.id
       ${whereClause} ORDER BY sr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit || 25, offset]
    );
    res.json({ data: result.rows, pagination: { total, page: parseInt(page || 1), limit: parseInt(limit || 25) } });
  } catch (error) {
    console.error('Get service records error:', error);
    res.status(500).json({ error: 'Failed to fetch service records' });
  }
}

async function getServiceRecordById(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT sr.*, s.date, s.asset_type, s.asset_identifier, s.department, s.room, u.username as signed_by_name, cr.username as created_by_name
       FROM service_records sr
       LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
       LEFT JOIN users u ON sr.signed_by = u.id
       LEFT JOIN users cr ON sr.created_by = cr.id
       WHERE sr.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service record not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get service record error:', error);
    res.status(500).json({ error: 'Failed to fetch service record' });
  }
}

async function updateServiceRecord(req, res) {
  const { id } = req.params;
  const { work_performed, outcome, follow_up, signer_name, signer_date, signature_data } = req.body;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT * FROM service_records WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Service record not found' });
    }
    const updates = [];
    const values = [];
    let idx = 1;
    if (work_performed !== undefined) { updates.push(`work_performed = $${idx++}`); values.push(work_performed); }
    if (outcome !== undefined) { updates.push(`outcome = $${idx++}`); values.push(outcome); }
    if (follow_up !== undefined) { updates.push(`follow_up = $${idx++}`); values.push(follow_up); }
    if (signer_name !== undefined) { updates.push(`signer_name = $${idx++}`); values.push(signer_name); }
    if (signer_date !== undefined) { updates.push(`signer_date = $${idx++}`); values.push(signer_date); }
    if (signature_data !== undefined) { updates.push(`signature_data = $${idx++}`); values.push(signature_data); }
    updates.push(`signed_by = $${idx++}`); values.push(signer_name || existing.rows[0].signed_by);
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const query = `UPDATE service_records SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);
    await logMaintenanceAudit(req, 'UPDATE_SERVICE', 'service', id, { outcome }, userId);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update service record error:', error);
    res.status(500).json({ error: 'Failed to update service record' });
  }
}

async function deleteServiceRecord(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT * FROM service_records WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Service record not found' });
    }
    await pool.query('DELETE FROM service_records WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_SERVICE', 'service', id, {}, userId);
    res.json({ message: 'Service record deleted successfully' });
  } catch (error) {
    console.error('Delete service record error:', error);
    res.status(500).json({ error: 'Failed to delete service record' });
  }
}

module.exports = { createServiceRecord, getServiceRecords, getServiceRecordById, updateServiceRecord, deleteServiceRecord };
