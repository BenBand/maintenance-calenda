const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

function parseTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function createSchedule(req, res) {
  const {
    date,
    scheduled_at,
    department,
    room,
    asset_type,
    asset_identifier,
    description,
    technician,
    priority,
    reminder_days,
    status,
    recurrence_rule,
    recurrence_end,
  } = req.body;
  const userId = req.user.id;

  const finalScheduledAt = scheduled_at || (date ? parseTimestamp(date) : null);
  if (!finalScheduledAt || !department || !room || !asset_type || !technician) {
    return res.status(400).json({ error: 'scheduled_at (or date), department, room, asset type, and technician are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO maintenance_schedules
        (scheduled_at, department, room, asset_type, asset_identifier, description, technician, priority, reminder_days, status, created_by, recurrence_rule, recurrence_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        finalScheduledAt,
        department,
        room,
        asset_type,
        asset_identifier || null,
        description || null,
        technician,
        priority || 'medium',
        reminder_days || null,
        status || 'scheduled',
        userId,
        recurrence_rule || 'none',
        recurrence_end ? parseTimestamp(recurrence_end) : null,
      ]
    );
    const schedule = result.rows[0];
    await logMaintenanceAudit(req, 'CREATE_SCHEDULE', 'maintenance', schedule.id, { scheduled_at: finalScheduledAt, department, asset_type }, userId);
    res.status(201).json(schedule);
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
}

async function getAllSchedules(req, res) {
  const { start_date, end_date, department, asset_type, status, technician, search, page, limit, include_recurrences } = req.query;
  const offset = ((page || 1) - 1) * (limit || 25);
  const conditions = ['s.recurrence_rule IS NULL OR s.recurrence_rule = \'none\''];
  const params = [];
  let idx = 1;

  if (start_date) { conditions.push(`s.scheduled_at >= $${idx++}`); params.push(start_date); }
  if (end_date) { conditions.push(`s.scheduled_at <= $${idx++}`); params.push(end_date); }
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
      `SELECT s.*, u.username as created_by_name
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       ${whereClause}
       ORDER BY s.scheduled_at DESC, s.priority DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit || 25, offset]
    );

    let recurrences = [];
    if (include_recurrences === 'true') {
      const recResult = await pool.query(
        `SELECT r.*, u.username as created_by_name
         FROM maintenance_recurrences r
         LEFT JOIN users u ON r.created_by = u.id
         WHERE r.scheduled_at >= COALESCE($1, '1970-01-01') AND r.scheduled_at <= COALESCE($2, '2999-12-31')
         ORDER BY r.scheduled_at ASC`,
        [start_date || null, end_date || null]
      );
      recurrences = recResult.rows;
    }

    res.json({ data: result.rows, recurrences, pagination: { total, page: parseInt(page || 1), limit: parseInt(limit || 25) } });
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
}

async function getScheduleById(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_name
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    const schedule = result.rows[0];

    let recurrences = [];
    if (schedule.recurrence_rule && schedule.recurrence_rule !== 'none') {
      const recResult = await pool.query(
        `SELECT r.*, u.username as created_by_name
         FROM maintenance_recurrences r
         LEFT JOIN users u ON r.created_by = u.id
         WHERE r.parent_schedule_id = $1
         ORDER BY r.scheduled_at ASC`,
        [id]
      );
      recurrences = recResult.rows;
    }

    res.json({ ...schedule, recurrences });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
}

async function updateSchedule(req, res) {
  const { id } = req.params;
  const {
    scheduled_at,
    date,
    department,
    room,
    asset_type,
    asset_identifier,
    description,
    technician,
    priority,
    reminder_days,
    status,
    recurrence_rule,
    recurrence_end,
  } = req.body;
  const userId = req.user.id;

  try {
    const existing = await pool.query('SELECT * FROM maintenance_schedules WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    const finalScheduledAt = scheduled_at || (date ? parseTimestamp(date) : undefined);
    if (finalScheduledAt !== undefined) { updates.push(`scheduled_at = $${idx++}`); values.push(finalScheduledAt); }
    if (department !== undefined) { updates.push(`department = $${idx++}`); values.push(department); }
    if (room !== undefined) { updates.push(`room = $${idx++}`); values.push(room); }
    if (asset_type !== undefined) { updates.push(`asset_type = $${idx++}`); values.push(asset_type); }
    if (asset_identifier !== undefined) { updates.push(`asset_identifier = $${idx++}`); values.push(asset_identifier); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (technician !== undefined) { updates.push(`technician = $${idx++}`); values.push(technician); }
    if (priority !== undefined) { updates.push(`priority = $${idx++}`); values.push(priority); }
    if (reminder_days !== undefined) { updates.push(`reminder_days = $${idx++}`); values.push(reminder_days); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (recurrence_rule !== undefined) { updates.push(`recurrence_rule = $${idx++}`); values.push(recurrence_rule); }
    if (recurrence_end !== undefined) { updates.push(`recurrence_end = $${idx++}`); values.push(recurrence_end ? parseTimestamp(recurrence_end) : null); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    values.push(id);
    const query = `UPDATE maintenance_schedules SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);
    await logMaintenanceAudit(req, 'UPDATE_SCHEDULE', 'maintenance', id, { scheduled_at: finalScheduledAt, department }, userId);
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
    await pool.query('DELETE FROM maintenance_recurrences WHERE parent_schedule_id = $1', [id]);
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
      `SELECT s.*, u.username as created_by_name
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.scheduled_at <= CURRENT_TIMESTAMP + INTERVAL '${days} days' AND s.status != 'completed'
       ORDER BY s.scheduled_at ASC`,
      []
    );

    const recResult = await pool.query(
      `SELECT r.*, u.username as created_by_name
       FROM maintenance_recurrences r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.scheduled_at <= CURRENT_TIMESTAMP + INTERVAL '${days} days' AND r.status != 'completed'
       ORDER BY r.scheduled_at ASC`,
      []
    );

    res.json({ schedules: result.rows, recurrences: recResult.rows });
  } catch (error) {
    console.error('Get upcoming error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming schedules' });
  }
}

async function getOverdue(req, res) {
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_name
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.scheduled_at < CURRENT_TIMESTAMP AND s.status != 'completed'
       ORDER BY s.scheduled_at ASC`,
      []
    );

    const recResult = await pool.query(
      `SELECT r.*, u.username as created_by_name
       FROM maintenance_recurrences r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.scheduled_at < CURRENT_TIMESTAMP AND r.status != 'completed'
       ORDER BY r.scheduled_at ASC`,
      []
    );

    res.json({ schedules: result.rows, recurrences: recResult.rows });
  } catch (error) {
    console.error('Get overdue error:', error);
    res.status(500).json({ error: 'Failed to fetch overdue schedules' });
  }
}

async function getSchedulesByDate(req, res) {
  const { date } = req.params;
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_name
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.scheduled_date = $1
       ORDER BY s.priority DESC`,
      [date]
    );

    const recResult = await pool.query(
      `SELECT r.*, u.username as created_by_name
       FROM maintenance_recurrences r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.occurrence_date = $1
       ORDER BY r.priority DESC`,
      [date]
    );

    res.json({ schedules: result.rows, recurrences: recResult.rows });
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

async function generateRecurrences(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const parent = await pool.query('SELECT * FROM maintenance_schedules WHERE id = $1', [id]);
    if (parent.rows.length === 0) {
      return res.status(404).json({ error: 'Parent schedule not found' });
    }
    const p = parent.rows[0];
    if (!p.recurrence_rule || p.recurrence_rule === 'none') {
      return res.status(400).json({ error: 'Schedule has no recurrence rule' });
    }

    const start = new Date(p.scheduled_at);
    const end = p.recurrence_end ? new Date(p.recurrence_end) : new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000);
    const intervalMonths = p.recurrence_rule === 'monthly' ? 1 : 3;
    const occurrences = [];
    let current = new Date(start.getTime() + intervalMonths * 30 * 24 * 60 * 60 * 1000);

    while (current <= end) {
      occurrences.push({
        parent_schedule_id: p.id,
        occurrence_date: current.toISOString().split('T')[0],
        scheduled_at: current.toISOString(),
        status: 'scheduled',
        department: p.department,
        room: p.room,
        asset_type: p.asset_type,
        asset_identifier: p.asset_identifier,
        description: p.description,
        technician: p.technician,
        priority: p.priority,
        reminder_days: p.reminder_days,
        created_by: userId,
      });
      current = new Date(current.getTime() + intervalMonths * 30 * 24 * 60 * 60 * 1000);
    }

    if (occurrences.length === 0) {
      return res.json({ message: 'No occurrences to generate', generated: 0 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const occ of occurrences) {
        await client.query(
          `INSERT INTO maintenance_recurrences
            (parent_schedule_id, occurrence_date, scheduled_at, status, department, room, asset_type, asset_identifier, description, technician, priority, reminder_days, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [occ.parent_schedule_id, occ.occurrence_date, occ.scheduled_at, occ.status, occ.department, occ.room, occ.asset_type, occ.asset_identifier, occ.description, occ.technician, occ.priority, occ.reminder_days, occ.created_by]
        );
      }
      await client.query('COMMIT');
      res.json({ message: 'Recurrences generated', generated: occurrences.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Generate recurrences error:', error);
    res.status(500).json({ error: 'Failed to generate recurrences' });
  }
}

module.exports = { createSchedule, getAllSchedules, getScheduleById, updateSchedule, deleteSchedule, getUpcoming, getOverdue, getSchedulesByDate, getDepartments, generateRecurrences };