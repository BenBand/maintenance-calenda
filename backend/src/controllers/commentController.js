const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

const COMMENT_SELECT = `
  SELECT ic.*, u.username as commented_by_name
  FROM incident_comments ic
  LEFT JOIN users u ON ic.commented_by = u.id
`;

async function getCommentsByIncident(req, res) {
  const { incidentId } = req.params;
  try {
    const incidentCheck = await pool.query('SELECT id FROM incidents WHERE id = $1', [incidentId]);
    if (incidentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const result = await pool.query(
      `${COMMENT_SELECT} WHERE ic.incident_id = $1 ORDER BY ic.created_at ASC`,
      [incidentId]
    );

    res.json({
      incident_id: Number(incidentId),
      comments: result.rows,
    });
  } catch (error) {
    console.error('Get comments by incident error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
}

async function createComment(req, res) {
  const { incidentId } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;

  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'Comment is required' });
  }
  if (comment.length > 2000) {
    return res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });
  }

  try {
    const incidentCheck = await pool.query('SELECT id FROM incidents WHERE id = $1', [incidentId]);
    if (incidentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const result = await pool.query(
      `INSERT INTO incident_comments (incident_id, commented_by, comment)
       VALUES ($1, $2, $3) RETURNING *`,
      [incidentId, userId, comment.trim()]
    );

    const commentRecord = result.rows[0];
    await logMaintenanceAudit(req, 'CREATE_COMMENT', 'incident_comment', commentRecord.id, { incident_id: incidentId }, userId);

    const enriched = await pool.query(
      `${COMMENT_SELECT} WHERE ic.id = $1`,
      [commentRecord.id]
    );

    res.status(201).json(enriched.rows[0]);
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
}

async function updateComment(req, res) {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;

  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'Comment is required' });
  }
  if (comment.length > 2000) {
    return res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });
  }

  try {
    const existing = await pool.query('SELECT * FROM incident_comments WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (existing.rows[0].commented_by !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own comment' });
    }

    const result = await pool.query(
      `UPDATE incident_comments SET comment = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [comment.trim(), id]
    );

    await logMaintenanceAudit(req, 'UPDATE_COMMENT', 'incident_comment', id, { incident_id: existing.rows[0].incident_id }, userId);

    const enriched = await pool.query(
      `${COMMENT_SELECT} WHERE ic.id = $1`,
      [id]
    );

    res.json(enriched.rows[0]);
  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
}

async function deleteComment(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const existing = await pool.query('SELECT * FROM incident_comments WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (existing.rows[0].commented_by !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own comment' });
    }

    await pool.query('DELETE FROM incident_comments WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_COMMENT', 'incident_comment', id, { incident_id: existing.rows[0].incident_id }, userId);

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}

module.exports = { getCommentsByIncident, createComment, updateComment, deleteComment };