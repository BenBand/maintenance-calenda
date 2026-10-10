const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

const INCIDENT_SELECT = `
  SELECT i.*, u.username as reported_by_name,
         (SELECT count(*) FROM incident_ratings ir WHERE ir.incident_id = i.id) AS rating_count,
         (SELECT round(avg(ir.rating), 1) FROM incident_ratings ir WHERE ir.incident_id = i.id) AS average_rating
  FROM incidents i
  LEFT JOIN users u ON i.reported_by = u.id
`;

async function createIncident(req, res) {
  const { title, description, department, room, asset_type, asset_identifier, priority } = req.body;
  const userId = req.user.id;
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO incidents (title, description, department, room, asset_type, asset_identifier, priority, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, description, department || null, room || null, asset_type || null, asset_identifier || null, priority || 'medium', userId]
    );
    const incident = result.rows[0];
    await logMaintenanceAudit(req, 'CREATE_INCIDENT', 'incident', incident.id, { title, priority }, userId);
    res.status(201).json({ ...incident, rating_count: 0, average_rating: null });
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
}

async function getAllIncidents(req, res) {
  const { department, asset_type, priority, status, search, page, limit } = req.query;
  const offset = ((page || 1) - 1) * (limit || 25);
  const conditions = [];
  const params = [];
  let idx = 1;
  if (department) { conditions.push(`i.department = $${idx++}`); params.push(department); }
  if (asset_type) { conditions.push(`i.asset_type = $${idx++}`); params.push(asset_type); }
  if (priority) { conditions.push(`i.priority = $${idx++}`); params.push(priority); }
  if (status) { conditions.push(`i.status = $${idx++}`); params.push(status); }
  if (search) {
    conditions.push(`(i.title ILIKE $${idx} OR i.description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM incidents i ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    const result = await pool.query(
      `${INCIDENT_SELECT} ${whereClause} ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit || 25, offset]
    );
    res.json({ data: result.rows, pagination: { total, page: parseInt(page || 1), limit: parseInt(limit || 25) } });
  } catch (error) {
    console.error('Get incidents error:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
}

/**
 * Returns only the incidents reported by the current user, ordered newest
 * first. Used by the `user` role so they can see their own history without
 * being shown other people's requests.
 */
async function getMyIncidents(req, res) {
  const userId = req.user.id;
  const { status, search, page, limit } = req.query;
  const offset = ((page || 1) - 1) * (limit || 25);
  const conditions = ['i.reported_by = $1'];
  const params = [userId];
  let idx = 2;
  if (status) { conditions.push(`i.status = $${idx++}`); params.push(status); }
  if (search) {
    conditions.push(`(i.title ILIKE $${idx} OR i.description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM incidents i ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    const result = await pool.query(
      `${INCIDENT_SELECT} ${whereClause} ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit || 25, offset]
    );
    res.json({ data: result.rows, pagination: { total, page: parseInt(page || 1), limit: parseInt(limit || 25) } });
  } catch (error) {
    console.error('Get my incidents error:', error);
    res.status(500).json({ error: 'Failed to fetch your incidents' });
  }
}

async function getIncidentById(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get incident error:', error);
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
}

async function updateIncident(req, res) {
  const { id } = req.params;
  const { title, description, department, room, asset_type, asset_identifier, priority, status } = req.body;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    const updates = [];
    const values = [];
    let idx = 1;
    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (department !== undefined) { updates.push(`department = $${idx++}`); values.push(department); }
    if (room !== undefined) { updates.push(`room = $${idx++}`); values.push(room); }
    if (asset_type !== undefined) { updates.push(`asset_type = $${idx++}`); values.push(asset_type); }
    if (asset_identifier !== undefined) { updates.push(`asset_identifier = $${idx++}`); values.push(asset_identifier); }
    if (priority !== undefined) { updates.push(`priority = $${idx++}`); values.push(priority); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const query = `UPDATE incidents SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);
    await logMaintenanceAudit(req, 'UPDATE_INCIDENT', 'incident', id, { status, priority }, userId);

    const enriched = await pool.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
    res.json(enriched.rows[0]);
  } catch (error) {
    console.error('Update incident error:', error);
    res.status(500).json({ error: 'Failed to update incident' });
  }
}

async function deleteIncident(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    await pool.query('DELETE FROM incident_ratings WHERE incident_id = $1', [id]);
    await pool.query('DELETE FROM incidents WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_INCIDENT', 'incident', id, {}, userId);
    res.json({ message: 'Incident deleted successfully' });
  } catch (error) {
    console.error('Delete incident error:', error);
    res.status(500).json({ error: 'Failed to delete incident' });
  }
}

module.exports = { createIncident, getAllIncidents, getMyIncidents, getIncidentById, updateIncident, deleteIncident };
