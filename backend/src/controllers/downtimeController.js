const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');
const { isValidInstant } = require('../utils/periods');

const WINDOW_TYPES = ['planned', 'unplanned', 'maintenance'];

/**
 * `duration_minutes` on a schedule turns a point booking into an interval.
 * Expressed as SQL so slot occupancy, conflict detection and end-time display
 * all agree on one definition.
 */
const SLOT_END = '(s.scheduled_at + make_interval(mins => s.duration_minutes))';

function parseInstant(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getWindows(req, res) {
  const { from, to, department, window_type, include_past } = req.query;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (isValidInstant(from) && isValidInstant(to)) {
    conditions.push(`w.ends_at > $${idx++}::timestamptz AND w.starts_at < $${idx++}::timestamptz`);
    params.push(parseInstant(from), parseInstant(to));
  } else if (isValidInstant(from)) {
    conditions.push(`w.ends_at > $${idx++}::timestamptz`);
    params.push(parseInstant(from));
  } else if (!include_past) {
    conditions.push(`w.ends_at >= now()`);
  }

  if (department) { conditions.push(`w.department = $${idx++}`); params.push(department); }
  if (window_type) { conditions.push(`w.window_type = $${idx++}`); params.push(window_type); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT w.*, a.asset_identifier, u.username AS created_by_name
       FROM downtime_windows w
       LEFT JOIN assets a ON a.id = w.asset_id
       LEFT JOIN users u ON u.id = w.created_by
       ${whereClause}
       ORDER BY w.starts_at ASC
       LIMIT 500`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get downtime windows error:', error);
    res.status(500).json({ error: 'Failed to fetch downtime windows' });
  }
}

async function createWindow(req, res) {
  const { department, room, asset_id, title, reason, starts_at, ends_at, window_type } = req.body || {};
  const userId = req.user.id;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const starts = parseInstant(starts_at);
  const ends = parseInstant(ends_at);
  if (!starts || !ends) {
    return res.status(400).json({ error: 'Valid start and end times are required' });
  }
  if (new Date(ends) <= new Date(starts)) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO downtime_windows (department, room, asset_id, title, reason, starts_at, ends_at, window_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        department || null,
        room || null,
        asset_id || null,
        title,
        reason || null,
        starts,
        ends,
        WINDOW_TYPES.includes(window_type) ? window_type : 'planned',
        userId,
      ]
    );
    await logMaintenanceAudit(req, 'CREATE_DOWNTIME_WINDOW', 'downtime', result.rows[0].id, { title, starts_at: starts }, userId);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Unknown asset' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    console.error('Create downtime window error:', error);
    res.status(500).json({ error: 'Failed to create downtime window' });
  }
}

async function updateWindow(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { department, room, asset_id, title, reason, starts_at, ends_at, window_type } = req.body || {};

  const allowed = { department, room, asset_id, title, reason, starts_at, ends_at, window_type };
  const updates = [];
  const values = [];
  let idx = 1;

  try {
    const existing = await pool.query('SELECT * FROM downtime_windows WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Downtime window not found' });
    }

    for (const [field, value] of Object.entries(allowed)) {
      if (value === undefined) continue;
      let next = value;
      if (field === 'starts_at') next = parseInstant(value);
      if (field === 'ends_at') next = parseInstant(value);
      if (field === 'window_type' && !WINDOW_TYPES.includes(value)) {
        return res.status(400).json({ error: `Window type must be one of: ${WINDOW_TYPES.join(', ')}` });
      }
      if (typeof next === 'string' && next.trim() === '') next = null;
      updates.push(`${field} = $${idx++}`);
      values.push(next);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE downtime_windows SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    await logMaintenanceAudit(req, 'UPDATE_DOWNTIME_WINDOW', 'downtime', id, { title }, userId);
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23514') {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    console.error('Update downtime window error:', error);
    res.status(500).json({ error: 'Failed to update downtime window' });
  }
}

async function deleteWindow(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const result = await pool.query('DELETE FROM downtime_windows WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Downtime window not found' });
    }
    await logMaintenanceAudit(req, 'DELETE_DOWNTIME_WINDOW', 'downtime', id, {}, userId);
    res.json({ message: 'Downtime window deleted successfully' });
  } catch (error) {
    console.error('Delete downtime window error:', error);
    res.status(500).json({ error: 'Failed to delete downtime window' });
  }
}

/**
 * Availability for a day: which slots are already taken, which technician and
 * room resources are busy, and where departments have declared downtime.
 * The calendar uses this to render a bookable grid instead of a plain list.
 */
async function getAvailability(req, res) {
  const { date, department, technician } = req.query;
  if (!isValidInstant(date)) {
    return res.status(400).json({ error: 'A valid date is required' });
  }

  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const conditions = [
    's.scheduled_at >= $1::timestamptz',
    's.scheduled_at < $2::timestamptz',
    "s.status <> 'cancelled'",
  ];
  const params = [dayStart.toISOString(), dayEnd.toISOString()];
  let idx = 3;

  if (department) { conditions.push(`s.department = $${idx++}`); params.push(department); }
  if (technician) { conditions.push(`s.technician = $${idx++}`); params.push(technician); }

  try {
    const [schedulesResult, windowsResult, technicianLoad] = await Promise.all([
      pool.query(
        `SELECT s.id, s.scheduled_at, s.scheduled_date, s.department, s.room, s.asset_type,
                s.asset_identifier, s.description, s.technician, s.priority, s.status,
                s.duration_minutes, s.recurrence_rule,
                ${SLOT_END} AS scheduled_end,
                u.username AS technician_username
         FROM maintenance_schedules s
         LEFT JOIN users u ON u.id = s.technician_user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY s.scheduled_at ASC`,
        params
      ),
      pool.query(
        `SELECT id, department, room, asset_id, title, reason, starts_at, ends_at, window_type
         FROM downtime_windows
         WHERE starts_at < $2::timestamptz AND ends_at > $1::timestamptz
           AND ($3::text IS NULL OR department IS NULL OR department = $3)
         ORDER BY starts_at ASC`,
        [dayStart.toISOString(), dayEnd.toISOString(), department || null]
      ),
      pool.query(
        `SELECT s.technician,
                count(*)                                    AS bookings,
                COALESCE(sum(s.duration_minutes), 0)        AS booked_minutes
         FROM maintenance_schedules s
         WHERE s.scheduled_at >= $1::timestamptz
           AND s.scheduled_at < $2::timestamptz
           AND s.status <> 'cancelled'
         GROUP BY s.technician
         ORDER BY booked_minutes DESC`,
        [dayStart.toISOString(), dayEnd.toISOString()]
      ),
    ]);

    const schedules = schedulesResult.rows;

    // Two bookings collide when their intervals overlap and they share a
    // technician or a room, since either resource is exclusive.
    const conflicts = [];
    for (let i = 0; i < schedules.length; i += 1) {
      for (let j = i + 1; j < schedules.length; j += 1) {
        const a = schedules[i];
        const b = schedules[j];
        const overlaps = new Date(a.scheduled_end) <= new Date(b.scheduled_at)
          || new Date(b.scheduled_end) <= new Date(a.scheduled_at);
        if (overlaps) continue;
        const sameTechnician = a.technician && a.technician === b.technician;
        const sameRoom = a.room && a.room === b.room;
        if (sameTechnician || sameRoom) {
          conflicts.push({
            schedule_id: a.id,
            conflicts_with: b.id,
            reason: sameTechnician && sameRoom ? 'technician_and_room' : sameTechnician ? 'technician' : 'room',
            detail: sameTechnician && sameRoom
              ? `${a.technician} is already booked in ${a.room}`
              : sameTechnician
                ? `${a.technician} is double-booked`
                : `${a.room} is already booked`,
          });
        }
      }
    }

    const conflictIds = new Set(conflicts.flatMap((c) => [c.schedule_id, c.conflicts_with]));

    res.json({
      date: dayStart.toISOString().slice(0, 10),
      schedules: schedules.map((row) => ({ ...row, has_conflict: conflictIds.has(row.id) })),
      conflicts,
      downtime_windows: windowsResult.rows,
      technician_load: technicianLoad.rows.map((row) => ({
        ...row,
        bookings: Number(row.bookings),
        booked_minutes: Number(row.booked_minutes),
        booked_hours: Number((Number(row.booked_minutes) / 60).toFixed(1)),
      })),
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ error: 'Failed to build availability for the requested date' });
  }
}

module.exports = {
  getWindows,
  createWindow,
  updateWindow,
  deleteWindow,
  getAvailability,
  WINDOW_TYPES,
};
