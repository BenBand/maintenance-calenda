const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

const MAX_PAGE_SIZE = 200;
const MAX_UPCOMING_DAYS = 365;

// A schedule occupies [scheduled_at, scheduled_end). Deriving the end from
// `duration_minutes` in one place keeps the calendar, conflict detection and
// the analytics bucket maths consistent.
const SLOT_END = '(s.scheduled_at + make_interval(mins => s.duration_minutes))';
// The same expression without the table alias, for RETURNING clauses on
// INSERT/UPDATE, where the target table has no alias to qualify.
const SLOT_END_UNQUALIFIED = '(scheduled_at + make_interval(mins => duration_minutes))';

function parseTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function createSchedule(req, res) {
  const {
    date,
    scheduled_at,
    department,
    room,
    asset_type,
    asset_identifier,
    asset_id,
    description,
    technician,
    technician_user_id,
    priority,
    reminder_days,
    status,
    duration_minutes,
    recurrence_rule,
    recurrence_interval,
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
        (scheduled_at, department, room, asset_type, asset_identifier, asset_id, description, technician,
         technician_user_id, priority, reminder_days, status, duration_minutes, created_by,
         recurrence_rule, recurrence_interval, recurrence_end)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *, ${SLOT_END_UNQUALIFIED} AS scheduled_end`,
      [
        finalScheduledAt,
        department,
        room,
        asset_type,
        asset_identifier || null,
        asset_id || null,
        description || null,
        technician,
        technician_user_id || null,
        priority || 'medium',
        reminder_days || null,
        status || 'scheduled',
        parsePositiveInt(duration_minutes, 60, 1440),
        userId,
        recurrence_rule || 'none',
        recurrence_interval ? Number(recurrence_interval) : 1,
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
  const { start_date, end_date, department, asset_type, status, technician, search, page, limit, include_recurrences, has_asset } = req.query;
  const pageNum = parsePositiveInt(page, 1, 100000);
  const limitNum = parsePositiveInt(limit, 25, MAX_PAGE_SIZE);
  const offset = (pageNum - 1) * limitNum;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (start_date) { conditions.push(`s.scheduled_at >= $${idx++}`); params.push(start_date); }
  if (end_date) { conditions.push(`s.scheduled_at <= $${idx++}`); params.push(end_date); }
  if (department) { conditions.push(`s.department = $${idx++}`); params.push(department); }
  if (asset_type) { conditions.push(`s.asset_type = $${idx++}`); params.push(asset_type); }
  if (status) { conditions.push(`s.status = $${idx++}`); params.push(status); }
  if (technician) { conditions.push(`s.technician ILIKE $${idx++}`); params.push(`%${technician}%`); }
  if (has_asset === 'true') { conditions.push(`s.asset_id IS NOT NULL`); }
  if (search) {
    conditions.push(`(s.asset_identifier ILIKE $${idx} OR s.description ILIKE $${idx} OR s.room ILIKE $${idx} OR s.technician ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const selectColumns = `s.*, ${SLOT_END} AS scheduled_end, u.username as created_by_name, tu.username as technician_username, a.asset_identifier as registry_asset_identifier`;

  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM maintenance_schedules s ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const result = await pool.query(
      `SELECT ${selectColumns}
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN users tu ON s.technician_user_id = tu.id
       LEFT JOIN assets a ON s.asset_id = a.id
       ${whereClause}
       ORDER BY s.scheduled_at DESC, s.priority DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset]
    );

    let recurrences = [];
    if (include_recurrences === 'true') {
      const recConditions = ['r.scheduled_at >= COALESCE($1::timestamptz, \'1970-01-01\')'];
      const recParams = [start_date || null];
      if (end_date) {
        recConditions.push(`r.scheduled_at <= $${recParams.length + 1}::timestamptz`);
        recParams.push(end_date);
      }
      if (department) {
        recConditions.push(`r.department = $${recParams.length + 1}`);
        recParams.push(department);
      }
      if (asset_type) {
        recConditions.push(`r.asset_type = $${recParams.length + 1}`);
        recParams.push(asset_type);
      }
      if (status) {
        recConditions.push(`r.status = $${recParams.length + 1}`);
        recParams.push(status);
      }
      const recResult = await pool.query(
        `SELECT r.*, (r.scheduled_at + make_interval(mins => r.duration_minutes)) AS scheduled_end,
                u.username as created_by_name
         FROM maintenance_recurrences r
         LEFT JOIN users u ON r.created_by = u.id
         WHERE ${recConditions.join(' AND ')}
         ORDER BY r.scheduled_at ASC`,
        recParams
      );
      recurrences = recResult.rows;
    }

    res.json({
      data: result.rows,
      recurrences,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 },
    });
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
}

async function getScheduleById(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT s.*, ${SLOT_END} AS scheduled_end, u.username as created_by_name
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
    asset_id,
    description,
    technician,
    technician_user_id,
    priority,
    reminder_days,
    status,
    duration_minutes,
    recurrence_rule,
    recurrence_interval,
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
    if (asset_id !== undefined) { updates.push(`asset_id = $${idx++}`); values.push(asset_id || null); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (technician !== undefined) { updates.push(`technician = $${idx++}`); values.push(technician); }
    if (technician_user_id !== undefined) { updates.push(`technician_user_id = $${idx++}`); values.push(technician_user_id || null); }
    if (priority !== undefined) { updates.push(`priority = $${idx++}`); values.push(priority); }
    if (reminder_days !== undefined) { updates.push(`reminder_days = $${idx++}`); values.push(reminder_days); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (duration_minutes !== undefined) { updates.push(`duration_minutes = $${idx++}`); values.push(parsePositiveInt(duration_minutes, 60, 1440)); }
    if (recurrence_rule !== undefined) { updates.push(`recurrence_rule = $${idx++}`); values.push(recurrence_rule); }
    if (recurrence_interval !== undefined) { updates.push(`recurrence_interval = $${idx++}`); values.push(recurrence_interval ? Number(recurrence_interval) : 1); }
    if (recurrence_end !== undefined) { updates.push(`recurrence_end = $${idx++}`); values.push(recurrence_end ? parseTimestamp(recurrence_end) : null); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE maintenance_schedules SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *, ${SLOT_END_UNQUALIFIED} AS scheduled_end`;
    const result = await pool.query(query, values);
    const updated = result.rows[0];

    if (
      (recurrence_rule !== undefined && existing.rows[0].recurrence_rule !== updated.recurrence_rule) ||
      (recurrence_end !== undefined && existing.rows[0].recurrence_end !== updated.recurrence_end)
    ) {
      await pool.query('DELETE FROM maintenance_recurrences WHERE parent_schedule_id = $1', [id]);
    }

    await logMaintenanceAudit(req, 'UPDATE_SCHEDULE', 'maintenance', id, { scheduled_at: finalScheduledAt, department }, userId);
    res.json(updated);
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
  // `days` arrives from the query string and used to be interpolated straight
  // into an INTERVAL literal. It is now a bound parameter and clamped.
  const days = parsePositiveInt(req.query.days, 7, MAX_UPCOMING_DAYS);
  try {
    const result = await pool.query(
      `SELECT s.*, ${SLOT_END} AS scheduled_end, u.username as created_by_name
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.scheduled_at <= CURRENT_TIMESTAMP + make_interval(days => $1)
         AND s.status NOT IN ('completed', 'cancelled')
       ORDER BY s.scheduled_at ASC`,
      [days]
    );

    const recResult = await pool.query(
      `SELECT r.*, (r.scheduled_at + make_interval(mins => r.duration_minutes)) AS scheduled_end,
              u.username as created_by_name
       FROM maintenance_recurrences r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.scheduled_at <= CURRENT_TIMESTAMP + make_interval(days => $1)
         AND r.status NOT IN ('completed', 'cancelled')
       ORDER BY r.scheduled_at ASC`,
      [days]
    );

    res.json({ schedules: result.rows, recurrences: recResult.rows, days });
  } catch (error) {
    console.error('Get upcoming error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming schedules' });
  }
}

async function getOverdue(req, res) {
  try {
    const result = await pool.query(
      `SELECT s.*, ${SLOT_END} AS scheduled_end, u.username as created_by_name,
              EXTRACT(EPOCH FROM (now() - s.scheduled_at)) / 3600.0 AS hours_overdue
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.scheduled_at < CURRENT_TIMESTAMP
         AND s.status NOT IN ('completed', 'cancelled')
       ORDER BY s.scheduled_at ASC`,
      []
    );

    const recResult = await pool.query(
      `SELECT r.*, (r.scheduled_at + make_interval(mins => r.duration_minutes)) AS scheduled_end,
              u.username as created_by_name,
              EXTRACT(EPOCH FROM (now() - r.scheduled_at)) / 3600.0 AS hours_overdue
       FROM maintenance_recurrences r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.scheduled_at < CURRENT_TIMESTAMP
         AND r.status NOT IN ('completed', 'cancelled')
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
      `SELECT s.*, ${SLOT_END} AS scheduled_end, u.username as created_by_name
       FROM maintenance_schedules s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.scheduled_date = $1
       ORDER BY s.scheduled_at ASC`,
      [date]
    );

    const recResult = await pool.query(
      `SELECT r.*, (r.scheduled_at + make_interval(mins => r.duration_minutes)) AS scheduled_end,
              u.username as created_by_name
       FROM maintenance_recurrences r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.occurrence_date = $1
       ORDER BY r.scheduled_at ASC`,
      [date]
    );

    res.json({ schedules: result.rows, recurrences: recResult.rows, date });
  } catch (error) {
    console.error('Get schedules by date error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
}

async function getDepartments(req, res) {
  try {
    // Schedules are the source of truth, but departments registered only in
    // the asset registry or in downtime windows must still be selectable.
    const result = await pool.query(
      `SELECT department FROM maintenance_schedules WHERE department IS NOT NULL
       UNION
       SELECT department FROM assets WHERE department IS NOT NULL
       UNION
       SELECT department FROM downtime_windows WHERE department IS NOT NULL
       ORDER BY department`
    );
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

    const baseIntervalMonths = { monthly: 1, quarterly: 3, annual: 12 }[p.recurrence_rule];
    const intervalMultiplier = p.recurrence_interval || 1;
    const intervalMonths = baseIntervalMonths * intervalMultiplier;

    const start = new Date(p.scheduled_at);
    const defaultEndYears = p.recurrence_rule === 'annual' ? 5 : 2;
    const end = p.recurrence_end ? new Date(p.recurrence_end) : new Date(start.getTime() + defaultEndYears * 365 * 24 * 60 * 60 * 1000);

    const occurrences = [];
    let current = new Date(start);
    current.setUTCMonth(current.getUTCMonth() + intervalMonths);

    // Occurrences are regenerated from the parent, so clear any previously
    // materialised ones first to keep the set idempotent.
    await pool.query("DELETE FROM maintenance_recurrences WHERE parent_schedule_id = $1 AND status = 'scheduled'", [id]);

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
        asset_id: p.asset_id,
        description: p.description,
        technician: p.technician,
        technician_user_id: p.technician_user_id,
        priority: p.priority,
        reminder_days: p.reminder_days,
        duration_minutes: p.duration_minutes,
        created_by: userId,
      });
      current = new Date(current);
      current.setUTCMonth(current.getUTCMonth() + intervalMonths);
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
            (parent_schedule_id, occurrence_date, scheduled_at, status, department, room, asset_type, asset_identifier, asset_id,
             description, technician, technician_user_id, priority, reminder_days, duration_minutes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [occ.parent_schedule_id, occ.occurrence_date, occ.scheduled_at, occ.status, occ.department, occ.room, occ.asset_type, occ.asset_identifier, occ.asset_id, occ.description, occ.technician, occ.technician_user_id, occ.priority, occ.reminder_days, occ.duration_minutes, occ.created_by]
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