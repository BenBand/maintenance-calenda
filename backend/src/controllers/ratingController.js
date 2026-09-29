const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

const RATING_SELECT = `
  SELECT ir.*, u.username as rated_by_name,
         i.title as incident_title, i.status as incident_status
  FROM incident_ratings ir
  LEFT JOIN users u ON ir.rated_by = u.id
  LEFT JOIN incidents i ON ir.incident_id = i.id
`;

async function getRatingsByIncident(req, res) {
  const { incidentId } = req.params;
  try {
    const incidentCheck = await pool.query('SELECT id FROM incidents WHERE id = $1', [incidentId]);
    if (incidentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const result = await pool.query(
      `${RATING_SELECT} WHERE ir.incident_id = $1 ORDER BY ir.created_at DESC`,
      [incidentId]
    );

    const ratings = result.rows;
    const total = ratings.length;
    const average = total > 0
      ? Number((ratings.reduce((sum, r) => sum + Number(r.rating), 0) / total).toFixed(1))
      : null;

    res.json({
      incident_id: Number(incidentId),
      total,
      average,
      ratings,
    });
  } catch (error) {
    console.error('Get ratings by incident error:', error);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
}

async function upsertRating(req, res) {
  const { incidentId } = req.params;
  const { rating, feedback } = req.body;
  const userId = req.user.id;

  if (rating === undefined || rating === null) {
    return res.status(400).json({ error: 'Rating is required' });
  }
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
  }
  if (feedback !== undefined && feedback !== null && String(feedback).length > 2000) {
    return res.status(400).json({ error: 'Feedback must be 2000 characters or fewer' });
  }

  try {
    const incidentCheck = await pool.query('SELECT id FROM incidents WHERE id = $1', [incidentId]);
    if (incidentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const existing = await pool.query(
      'SELECT * FROM incident_ratings WHERE incident_id = $1 AND rated_by = $2',
      [incidentId, userId]
    );

    let record;
    if (existing.rows.length > 0) {
      const result = await pool.query(
        `UPDATE incident_ratings SET rating = $1, feedback = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 RETURNING *`,
        [numericRating, feedback || null, existing.rows[0].id]
      );
      record = result.rows[0];
      await logMaintenanceAudit(req, 'UPDATE_RATING', 'incident_rating', record.id, { incident_id: incidentId, rating: numericRating }, userId);
    } else {
      const result = await pool.query(
        `INSERT INTO incident_ratings (incident_id, rated_by, rating, feedback)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [incidentId, userId, numericRating, feedback || null]
      );
      record = result.rows[0];
      await logMaintenanceAudit(req, 'CREATE_RATING', 'incident_rating', record.id, { incident_id: incidentId, rating: numericRating }, userId);
    }

    const enriched = await pool.query(
      `${RATING_SELECT} WHERE ir.id = $1`,
      [record.id]
    );

    res.json(enriched.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'You have already rated this incident' });
    }
    console.error('Upsert rating error:', error);
    res.status(500).json({ error: 'Failed to save rating' });
  }
}

async function deleteRating(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT * FROM incident_ratings WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Rating not found' });
    }
    if (existing.rows[0].rated_by !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own rating' });
    }
    await pool.query('DELETE FROM incident_ratings WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_RATING', 'incident_rating', id, { incident_id: existing.rows[0].incident_id }, userId);
    res.json({ message: 'Rating deleted successfully' });
  } catch (error) {
    console.error('Delete rating error:', error);
    res.status(500).json({ error: 'Failed to delete rating' });
  }
}

module.exports = {
  getRatingsByIncident,
  upsertRating,
  deleteRating,
};