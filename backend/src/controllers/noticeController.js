const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

async function createNotice(req, res) {
  const { title, message, notice_type, affected_directorates, affected_departments, start_time, end_time } = req.body;
  const userId = req.user.id;
  if (!title || !message || !start_time) {
    return res.status(400).json({ error: 'Title, message and start time are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO maintenance_notices (title, message, notice_type, affected_directorates, affected_departments, start_time, end_time, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, message, notice_type || 'planned_outage', affected_directorates || [], affected_departments || [], start_time, end_time || null, userId]
    );
    await logMaintenanceAudit(req, 'CREATE_NOTICE', 'maintenance_notice', result.rows[0].id, { title }, userId);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create notice error:', error);
    res.status(500).json({ error: 'Failed to create notice' });
  }
}

async function getAllNotices(req, res) {
  const { published } = req.query;
  try {
    let query = `SELECT n.*, u.username as created_by_name 
                 FROM maintenance_notices n 
                 LEFT JOIN users u ON n.created_by = u.id`;
    const params = [];
    if (published === 'true') {
      query += ` WHERE n.published = true AND n.start_time <= NOW() AND (n.end_time IS NULL OR n.end_time >= NOW())`;
    } else if (published === 'false') {
      query += ` WHERE n.published = false`;
    }
    query += ` ORDER BY n.start_time DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get notices error:', error);
    res.status(500).json({ error: 'Failed to fetch notices' });
  }
}

async function publishNotice(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `UPDATE maintenance_notices SET published = true, published_at = CURRENT_TIMESTAMP, published_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [userId, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    await logMaintenanceAudit(req, 'PUBLISH_NOTICE', 'maintenance_notice', id, {}, userId);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Publish notice error:', error);
    res.status(500).json({ error: 'Failed to publish notice' });
  }
}

async function deleteNotice(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await pool.query('DELETE FROM maintenance_notices WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_NOTICE', 'maintenance_notice', id, {}, userId);
    res.json({ message: 'Notice deleted successfully' });
  } catch (error) {
    console.error('Delete notice error:', error);
    res.status(500).json({ error: 'Failed to delete notice' });
  }
}

module.exports = { createNotice, getAllNotices, publishNotice, deleteNotice };
