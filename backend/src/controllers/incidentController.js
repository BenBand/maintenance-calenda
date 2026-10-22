const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

const INCIDENT_SELECT = `
  SELECT i.*, 
         u.username as reported_by_name,
         a.username as assigned_to_name,
         ack.username as acknowledged_by_name,
         esc.username as escalated_to_name,
         (SELECT count(*) FROM incident_ratings ir WHERE ir.incident_id = i.id) AS rating_count,
         (SELECT round(avg(ir.rating), 1) FROM incident_ratings ir WHERE ir.incident_id = i.id) AS average_rating,
         s.name as sla_policy_name
  FROM incidents i
  LEFT JOIN users u ON i.reported_by = u.id
  LEFT JOIN users a ON i.assigned_to = a.id
  LEFT JOIN users ack ON i.acknowledged_by = ack.id
  LEFT JOIN users esc ON i.escalated_to = esc.id
  LEFT JOIN sla_policies s ON i.sla_policy_id = s.id
`;

async function createIncident(req, res) {
  const { 
    title, description, department, room, asset_type, asset_identifier, priority,
    category, sub_category, directorate, section, ward, location_details, contact_phone
  } = req.body;
  const userId = req.user.id;
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }
  try {
    // Auto-assign SLA policy based on priority
    const slaResult = await pool.query(
      `SELECT id, response_time_minutes, resolution_time_minutes 
       FROM sla_policies 
       WHERE active = true AND (priority = $1 OR priority IS NULL) 
       ORDER BY priority = $1 DESC LIMIT 1`,
      [priority || 'medium']
    );
    
    let slaPolicyId = null;
    let slaResponseDue = null;
    let slaResolutionDue = null;
    if (slaResult.rows.length > 0) {
      slaPolicyId = slaResult.rows[0].id;
      const now = new Date();
      slaResponseDue = new Date(now.getTime() + slaResult.rows[0].response_time_minutes * 60000);
      slaResolutionDue = new Date(now.getTime() + slaResult.rows[0].resolution_time_minutes * 60000);
    }
    
    const result = await pool.query(
      `INSERT INTO incidents (
        title, description, department, room, asset_type, asset_identifier, priority, 
        reported_by, category, sub_category, directorate, section, ward, 
        location_details, contact_phone, sla_policy_id, sla_response_due, sla_resolution_due
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
       RETURNING *`,
      [
        title, description, department || null, room || null, asset_type || null, 
        asset_identifier || null, priority || 'medium', userId,
        category || null, sub_category || null, directorate || null, section || null, ward || null,
        location_details || null, contact_phone || null, slaPolicyId, slaResponseDue, slaResolutionDue
      ]
    );
    const incident = result.rows[0];
    await logMaintenanceAudit(req, 'CREATE_INCIDENT', 'incident', incident.id, { title, priority, ticket_no: incident.ticket_no }, userId);
    
    // Get enriched incident with ticket number
    const enriched = await pool.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [incident.id]);
    res.status(201).json({ ...enriched.rows[0], rating_count: 0, average_rating: null });
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
}

async function getAllIncidents(req, res) {
  const { department, asset_type, priority, status, search, page, limit, category, directorate, assigned_to, sla_breached } = req.query;
  const offset = ((page || 1) - 1) * (limit || 25);
  const conditions = [];
  const params = [];
  let idx = 1;
  if (department) { conditions.push(`i.department = $${idx++}`); params.push(department); }
  if (asset_type) { conditions.push(`i.asset_type = $${idx++}`); params.push(asset_type); }
  if (category) { conditions.push(`i.category = $${idx++}`); params.push(category); }
  if (directorate) { conditions.push(`i.directorate = $${idx++}`); params.push(directorate); }
  if (priority) { conditions.push(`i.priority = $${idx++}`); params.push(priority); }
  if (status) { conditions.push(`i.status = $${idx++}`); params.push(status); }
  if (assigned_to) { conditions.push(`i.assigned_to = $${idx++}`); params.push(assigned_to); }
  if (sla_breached === 'true') { conditions.push(`i.sla_breached = true`); }
  if (search) {
    conditions.push(`(i.title ILIKE $${idx} OR i.description ILIKE $${idx} OR i.ticket_no ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM incidents i ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    const result = await pool.query(
      `${INCIDENT_SELECT} ${whereClause} ORDER BY 
       CASE i.priority 
         WHEN 'critical' THEN 1 
         WHEN 'high' THEN 2 
         WHEN 'medium' THEN 3 
         WHEN 'low' THEN 4 
       END, i.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit || 25, offset]
    );
    res.json({ data: result.rows, pagination: { total, page: parseInt(page || 1), limit: parseInt(limit || 25) } });
  } catch (error) {
    console.error('Get incidents error:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
}

async function getMyIncidents(req, res) {
  const userId = req.user.id;
  const { status, search, page, limit } = req.query;
  const offset = ((page || 1) - 1) * (limit || 25);
  const conditions = ['i.reported_by = $1'];
  const params = [userId];
  let idx = 2;
  if (status) { conditions.push(`i.status = $${idx++}`); params.push(status); }
  if (search) {
    conditions.push(`(i.title ILIKE $${idx} OR i.description ILIKE $${idx} OR i.ticket_no ILIKE $${idx})`);
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
  const { 
    title, description, department, room, asset_type, asset_identifier, priority, status,
    assigned_to, category, sub_category, directorate, section, ward, location_details,
    contact_phone, escalation_reason, escalated_to, resolution_notes
  } = req.body;
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
    if (status !== undefined) { 
      updates.push(`status = $${idx++}`); 
      values.push(status);
      // Track timestamps based on status changes
      if (status === 'in_progress' && !existing.rows[0].acknowledged_at) {
        updates.push(`acknowledged_at = CURRENT_TIMESTAMP`);
        updates.push(`acknowledged_by = $${idx++}`);
        values.push(userId);
      }
      if (status === 'resolved' && !existing.rows[0].resolved_at) {
        updates.push(`resolved_at = CURRENT_TIMESTAMP`);
      }
      if (status === 'closed' && !existing.rows[0].closed_at) {
        updates.push(`closed_at = CURRENT_TIMESTAMP`);
      }
    }
    if (assigned_to !== undefined) { 
      updates.push(`assigned_to = $${idx++}`); 
      values.push(assigned_to);
      if (assigned_to && !existing.rows[0].assigned_at) {
        updates.push(`assigned_at = CURRENT_TIMESTAMP`);
      }
    }
    if (category !== undefined) { updates.push(`category = $${idx++}`); values.push(category); }
    if (sub_category !== undefined) { updates.push(`sub_category = $${idx++}`); values.push(sub_category); }
    if (directorate !== undefined) { updates.push(`directorate = $${idx++}`); values.push(directorate); }
    if (section !== undefined) { updates.push(`section = $${idx++}`); values.push(section); }
    if (ward !== undefined) { updates.push(`ward = $${idx++}`); values.push(ward); }
    if (location_details !== undefined) { updates.push(`location_details = $${idx++}`); values.push(location_details); }
    if (contact_phone !== undefined) { updates.push(`contact_phone = $${idx++}`); values.push(contact_phone); }
    if (resolution_notes !== undefined) { updates.push(`resolution_notes = $${idx++}`); values.push(resolution_notes); }
    if (escalated_to !== undefined) { 
      updates.push(`escalated_to = $${idx++}`); 
      values.push(escalated_to);
      updates.push(`escalated_at = CURRENT_TIMESTAMP`);
      if (escalation_reason !== undefined) {
        updates.push(`escalation_reason = $${idx++}`);
        values.push(escalation_reason);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const query = `UPDATE incidents SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);
    await logMaintenanceAudit(req, 'UPDATE_INCIDENT', 'incident', id, { status, priority, assigned_to }, userId);

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
    await pool.query('DELETE FROM incident_comments WHERE incident_id = $1', [id]);
    await pool.query('DELETE FROM incidents WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_INCIDENT', 'incident', id, {}, userId);
    res.json({ message: 'Incident deleted successfully' });
  } catch (error) {
    console.error('Delete incident error:', error);
    res.status(500).json({ error: 'Failed to delete incident' });
  }
}

async function acknowledgeIncident(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    if (existing.rows[0].acknowledged_at) {
      return res.status(400).json({ error: 'Incident already acknowledged' });
    }
    await pool.query(
      `UPDATE incidents 
       SET status = 'in_progress', acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [userId, id]
    );
    await logMaintenanceAudit(req, 'ACKNOWLEDGE_INCIDENT', 'incident', id, {}, userId);
    const enriched = await pool.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
    res.json(enriched.rows[0]);
  } catch (error) {
    console.error('Acknowledge incident error:', error);
    res.status(500).json({ error: 'Failed to acknowledge incident' });
  }
}

async function assignIncident(req, res) {
  const { id } = req.params;
  const { assigned_to } = req.body;
  const userId = req.user.id;
  try {
    if (!assigned_to) {
      return res.status(400).json({ error: 'assigned_to is required' });
    }
    const existing = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    await pool.query(
      `UPDATE incidents 
       SET assigned_to = $1, assigned_at = COALESCE(assigned_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [assigned_to, id]
    );
    await logMaintenanceAudit(req, 'ASSIGN_INCIDENT', 'incident', id, { assigned_to }, userId);
    const enriched = await pool.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
    res.json(enriched.rows[0]);
  } catch (error) {
    console.error('Assign incident error:', error);
    res.status(500).json({ error: 'Failed to assign incident' });
  }
}

module.exports = { 
  createIncident, getAllIncidents, getMyIncidents, getIncidentById, 
  updateIncident, deleteIncident, acknowledgeIncident, assignIncident 
};
