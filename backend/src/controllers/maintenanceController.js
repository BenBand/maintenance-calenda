const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

async function createSchedule(req, res) {
  const { date, department, room, asset_type, asset_identifier, description, technician, priority, reminder_days, status } = req.body;
  const userId = req.user.id;
  if (!date || !department || !room || !asset_type || !technician) {
    return res.status(400).json({ error: 'Date, department, room, asset type, and technician are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO maintenance_schedules (date, department, room, asset_type, asset_identifier, description, technician, priority, reminder_days, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [date, department, room, asset_type, asset_identifier || null, description || null, technician, priority || 'medium', reminder_days || null, status || 'scheduled', userId]
    );
    const schedule = result.rows[0];
    await logMaintenanceAudit(req, 'CREATE_SCHEDULE', 'maintenance', schedule.id, { date, department, asset_type }, userId);
    res.status(201).json(schedule);
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
}

async function getAllSchedules(req, res) {
  const { start_date, end_date, department, asset_type, status, technician, search, page, limit } = req.query;
  const offset = ((page || 1) - 1) * (limit || 25);
  const conditions = [];
  const params = [];
  let idx = 1;
  if (start_date) { conditions.push(`s.date >= $${idx++}`); params.push(start_date); }
  if (end_date) { conditions.push(`s.date <= $${idx++}`); params.push(end_date); }
  if (department) { conditions.push(`s.department = $${idx++}`); params.push(department); }
  if (asset_type) { conditions.push(`s.asset_type = $${idx++}`); params.push(asset_type); }
  if (status) { conditions.push(`s.status = $${idx++}`); params.push(status); }
  if (technician) { conditions.push(`s.technician ILIKE $${idx++}`); params.push(`%${technician}%`); }
  if (search) {
    conditions.push(`(s.asset_identifier ILIKE $${idx} OR s.description ILIKE $${idx} OR s.room ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM maintenance_schedules s ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_name FROM maintenance_schedules s LEFT JOIN users u ON s.created_by = u.id ${whereClause} ORDER BY s.date DESC, s.priority DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit || 25, offset]
    );
    res.json({ data: result.rows, pagination: { total, page: parseInt(page || 1), limit: parseInt(limit || 25) } });
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
}

async function getScheduleById(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT s.*, u.username as created_by_name FROM maintenance_schedules s LEFT JOIN users u ON s.created_by = u.id WHERE s.id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
}

async function updateSchedule(req, res) {
  const { id } = req.params;
  const { date, department, room, asset_type, asset_identifier, description, technician, priority, reminder_days, status } = req.body;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT * FROM maintenance_schedules WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    const updates = [];
    const values = [];
    let idx = 1;
    if (date !== undefined) { updates.push(`date = $${idx++}`); values.push(date); }
    if (department !== undefined) { updates.push(`department = $${idx++}`); values.push(department); }
    if (room !== undefined) { updates.push(`room = $${idx++}`); values.push(room); }
    if (asset_type !== undefined) { updates.push(`asset_type = $${idx++}`); values.push(asset_type); }
    if (asset_identifier !== undefined) { updates.push(`asset_identifier = $${idx++}`); values.push(asset_identifier); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (technician !== undefined) { updates.push(`technician = $${idx++}`); values.push(technician); }
    if (priority !== undefined) { updates.push(`priority = $${idx++}`); values.push(priority); }
    if (reminder_days !== undefined) { updates.push(`reminder_days = $${idx++}`); values.push(reminder_days); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);
    values.push(id);
    const query = `UPDATE maintenance_schedules SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);
    await logMaintenanceAudit(req, 'UPDATE_SCHEDULE', 'maintenance', id, { date, department }, userId);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
}

async function deleteSchedule(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT * FROM maintenance_schedules WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    await pool.query('DELETE FROM service_records WHERE schedule_id = $1', [id]);
    await pool.query('DELETE FROM maintenance_schedules WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_SCHEDULE', 'maintenance', id, {}, userId);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
}

async function getUpcoming(req, res) {
  const { days = 7 } = req.query;
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_name FROM maintenance_schedules s LEFT JOIN users u ON s.created_by = u.id WHERE s.date <= CURRENT_DATE + INTERVAL '${days} days' AND s.status != 'completed' ORDER BY s.date ASC`,
      []
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get upcoming error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming schedules' });
  }
}

async function getOverdue(req, res) {
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_name FROM maintenance_schedules s LEFT JOIN users u ON s.created_by = u.id WHERE s.date < CURRENT_DATE AND s.status != 'completed' ORDER BY s.date ASC`,
      []
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get overdue error:', error);
    res.status(500).json({ error: 'Failed to fetch overdue schedules' });
  }
}

async function getSchedulesByDate(req, res) {
  const { date } = req.params;
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_name FROM maintenance_schedules s LEFT JOIN users u ON s.created_by = u.id WHERE s.date = $1 ORDER BY s.priority DESC`,
      [date]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get schedules by date error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
}

async function getDepartments(req, res) {
  try {
    const result = await pool.query('SELECT DISTINCT department FROM maintenance_schedules ORDER BY department');
    res.json(result.rows.map(r => r.department));
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
}

module.exports = { createSchedule, getAllSchedules, getScheduleById, updateSchedule, deleteSchedule, getUpcoming, getOverdue, getSchedulesByDate, getDepartments };
