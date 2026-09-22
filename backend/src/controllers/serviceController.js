const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

function base64ToBytea(base64) {
  if (!base64) return null;
  const matches = base64.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return null;
  const mimeType = `image/${matches[1]}`;
  const data = matches[2];
  return { mimeType, data: Buffer.from(data, 'base64') };
}

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

    let signedByUserId = null;
    if (signer_name) {
      const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [signer_name]);
      if (userResult.rows.length > 0) {
        signedByUserId = userResult.rows[0].id;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const recordResult = await client.query(
        `INSERT INTO service_records (schedule_id, work_performed, outcome, follow_up, signer_name, signer_date, signed_by_user_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [schedule_id, work_performed, outcome || null, follow_up || null, signer_name || null, signer_date || null, signedByUserId, userId]
      );
      const record = recordResult.rows[0];

      if (signature_data) {
        const parsed = base64ToBytea(signature_data);
        if (parsed) {
          await client.query(
            `INSERT INTO service_signatures (service_record_id, signer_name, signer_date, mime_type, encoding, compressed, signature_data, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [record.id, signer_name || null, signer_date || null, parsed.mimeType, 'base64', false, parsed.data, userId]
          );
        }
      }

      await client.query('UPDATE maintenance_schedules SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['completed', schedule_id]);
      await client.query('COMMIT');

      await logMaintenanceAudit(req, 'CREATE_SERVICE', 'service', record.id, { schedule_id, outcome }, userId);
      res.status(201).json(record);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
      `SELECT sr.*, s.date, s.scheduled_at, s.asset_type, s.asset_identifier, s.department, s.room,
              u.username as signed_by_name, cr.username as created_by_name
       FROM service_records sr
       LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
       LEFT JOIN users u ON sr.signed_by_user_id = u.id
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
    const recordResult = await pool.query(
      `SELECT sr.*, s.date, s.scheduled_at, s.asset_type, s.asset_identifier, s.department, s.room,
              u.username as signed_by_name, cr.username as created_by_name
       FROM service_records sr
       LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
       LEFT JOIN users u ON sr.signed_by_user_id = u.id
       LEFT JOIN users cr ON sr.created_by = cr.id
       WHERE sr.id = $1`,
      [id]
    );
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service record not found' });
    }
    const record = recordResult.rows[0];

    const sigResult = await pool.query(
      `SELECT * FROM service_signatures WHERE service_record_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    if (sigResult.rows.length > 0) {
      const sig = sigResult.rows[0];
      record.signature_data = sig.signature_data ? `data:${sig.mime_type};base64,${sig.signature_data.toString('base64')}` : null;
      record.signer_name = sig.signer_name || record.signer_name;
      record.signer_date = sig.signer_date || record.signer_date;
    }

    res.json(record);
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

    let signedByUserId = existing.rows[0].signed_by_user_id;
    if (signer_name !== undefined && signer_name !== existing.rows[0].signer_name) {
      const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [signer_name]);
      signedByUserId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
    }
    if (signedByUserId !== existing.rows[0].signed_by_user_id) {
      updates.push(`signed_by_user_id = $${idx++}`); values.push(signedByUserId);
    }

    if (updates.length === 0 && !signature_data) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);
        await client.query(`UPDATE service_records SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
      }

      if (signature_data !== undefined) {
        const parsed = base64ToBytea(signature_data);
        if (parsed) {
          await client.query(
            `INSERT INTO service_signatures (service_record_id, signer_name, signer_date, mime_type, encoding, compressed, signature_data, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, signer_name || existing.rows[0].signer_name, signer_date || existing.rows[0].signer_date, parsed.mimeType, 'base64', false, parsed.data, userId]
          );
        } else {
          await client.query('DELETE FROM service_signatures WHERE service_record_id = $1', [id]);
        }
      }

      await client.query('COMMIT');

      const result = await client.query(
        `SELECT sr.*, s.date, s.scheduled_at, s.asset_type, s.asset_identifier, s.department, s.room,
                u.username as signed_by_name, cr.username as created_by_name
         FROM service_records sr
         LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
         LEFT JOIN users u ON sr.signed_by_user_id = u.id
         LEFT JOIN users cr ON sr.created_by = cr.id
         WHERE sr.id = $1`,
        [id]
      );

      await logMaintenanceAudit(req, 'UPDATE_SERVICE', 'service', id, { outcome }, userId);
      res.json(result.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
    await pool.query('DELETE FROM service_signatures WHERE service_record_id = $1', [id]);
    await pool.query('DELETE FROM service_records WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_SERVICE', 'service', id, {}, userId);
    res.json({ message: 'Service record deleted successfully' });
  } catch (error) {
    console.error('Delete service record error:', error);
    res.status(500).json({ error: 'Failed to delete service record' });
  }
}

module.exports = { createServiceRecord, getServiceRecords, getServiceRecordById, updateServiceRecord, deleteServiceRecord };