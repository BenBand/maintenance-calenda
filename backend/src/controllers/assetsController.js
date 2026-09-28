const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');
const { isValidInstant } = require('../utils/periods');

const LIFECYCLE_STATUSES = ['procurement', 'deployed', 'in_service', 'maintenance', 'retired', 'disposed'];
const EVENT_TYPES = [
  'procurement', 'deployment', 'maintenance', 'repair', 'upgrade',
  'relocation', 'retirement', 'disposal', 'status_change', 'note',
];

// Fields a client may write. Keeping this explicit prevents mass-assignment
// of ownership/audit columns.
const WRITABLE_FIELDS = [
  'asset_identifier', 'asset_type', 'make_model', 'serial_number', 'description',
  'department', 'room', 'assigned_to', 'supplier',
  'purchase_date', 'purchase_cost', 'warranty_start', 'warranty_expiry',
  'lifecycle_status', 'deployed_date', 'end_of_life_date',
  'disposal_date', 'disposal_method', 'disposal_reference', 'notes',
];

function toNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Lifecycle dates have to move forwards in time. An asset bought in 2023
 * cannot reach end of life in 2020 or be disposed of before it was bought, and
 * the registry is auditable, so the ordering is enforced on every write rather
 * than trusted from the form.
 *
 * Returns an error message, or null when the dates are coherent.
 */
function lifecycleDateError({ purchase_date, warranty_start, warranty_expiry, deployed_date, end_of_life_date, disposal_date }) {
  const order = [
    ['purchase_date', purchase_date],
    ['warranty_start', warranty_start],
    ['warranty_expiry', warranty_expiry],
    ['deployed_date', deployed_date],
    ['end_of_life_date', end_of_life_date],
    ['disposal_date', disposal_date],
  ].map(([field, value]) => [field, toDateOnly(value)]);

  if (purchase_date && warranty_start && warranty_start < purchase_date) {
    return 'Warranty start cannot precede the purchase date';
  }
  if (purchase_date && deployed_date && deployed_date < purchase_date) {
    return 'Deployment date cannot precede the purchase date';
  }
  if (purchase_date && end_of_life_date && end_of_life_date < purchase_date) {
    return 'End of life cannot precede the purchase date';
  }
  if (purchase_date && disposal_date && disposal_date < purchase_date) {
    return 'Disposal date cannot precede the purchase date';
  }
  if (end_of_life_date && disposal_date && disposal_date < end_of_life_date) {
    return 'Disposal date cannot precede the end-of-life date';
  }

  // Any explicit sequence must run forwards.
  const sequence = ['purchase_date', 'warranty_start', 'deployed_date', 'end_of_life_date', 'disposal_date']
    .map((field) => order.find(([name]) => name === field));
  for (let i = 1; i < sequence.length; i += 1) {
    const [previousField, previousValue] = sequence[i - 1];
    const [field, value] = sequence[i];
    if (previousValue && value && value < previousValue) {
      return `${humanDateField(field)} cannot precede ${humanDateField(previousField)}`;
    }
  }

  return null;
}
function humanDateField(field) {
  return field.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function isUniqueViolation(error) {
  return error && error.code === '23505';
}

function isForeignKeyViolation(error) {
  return error && error.code === '23503';
}

function assetWithRelations(id) {
  return pool.query(
    `SELECT a.*, t.label AS asset_type_label,
            u.username AS created_by_name,
            (SELECT count(*) FROM asset_events e WHERE e.asset_id = a.id) AS event_count,
            (SELECT count(*) FROM maintenance_schedules s WHERE s.asset_id = a.id) AS schedule_count,
            (SELECT count(*) FROM incidents i WHERE i.asset_id = a.id) AS incident_count,
            (SELECT max(sr.created_at) FROM service_records sr WHERE sr.asset_id = a.id) AS last_serviced_at
     FROM assets a
     LEFT JOIN asset_types t ON t.code = a.asset_type
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.id = $1`,
    [id]
  );
}

async function getAssets(req, res) {
  const { department, asset_type, lifecycle_status, warranty_state, search, page, limit } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (department) { conditions.push(`a.department = $${idx++}`); params.push(department); }
  if (asset_type) { conditions.push(`a.asset_type = $${idx++}`); params.push(asset_type); }
  if (lifecycle_status) { conditions.push(`a.lifecycle_status = $${idx++}`); params.push(lifecycle_status); }
  if (search) {
    conditions.push(`(a.asset_identifier ILIKE $${idx} OR a.serial_number ILIKE $${idx}
                      OR a.make_model ILIKE $${idx} OR a.description ILIKE $${idx}
                      OR a.assigned_to ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }
  if (warranty_state === 'expiring') {
    conditions.push(`a.warranty_expiry IS NOT NULL AND a.warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 90`);
  } else if (warranty_state === 'expired') {
    conditions.push(`a.warranty_expiry IS NOT NULL AND a.warranty_expiry < CURRENT_DATE`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const today = 'CURRENT_DATE';

  try {
    const countResult = await pool.query(
      `SELECT count(*) FROM assets a ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT a.*, t.label AS asset_type_label, u.username AS created_by_name,
              (a.warranty_expiry IS NOT NULL AND a.warranty_expiry < ${today}) AS warranty_expired,
              (a.warranty_expiry IS NOT NULL AND a.warranty_expiry >= ${today}
                AND a.warranty_expiry <= ${today} + 90) AS warranty_expiring_soon,
              (a.end_of_life_date IS NOT NULL AND a.end_of_life_date <= ${today} + 180) AS end_of_life_soon,
              (SELECT max(sr.created_at) FROM service_records sr WHERE sr.asset_id = a.id) AS last_serviced_at,
              (SELECT COALESCE(sum(sr.total_cost), 0) FROM service_records sr WHERE sr.asset_id = a.id) AS lifetime_service_cost,
              (SELECT COALESCE(sum(sr.downtime_minutes), 0) FROM service_records sr WHERE sr.asset_id = a.id) AS lifetime_downtime_minutes
       FROM assets a
       LEFT JOIN asset_types t ON t.code = a.asset_type
       LEFT JOIN users u ON u.id = a.created_by
       ${whereClause}
       ORDER BY a.asset_identifier ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      data: result.rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 },
    });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
}

async function getAssetById(req, res) {
  const { id } = req.params;
  try {
    const assetResult = await assetWithRelations(id);
    if (assetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    const asset = assetResult.rows[0];

    const [eventsResult, schedulesResult, serviceResult, incidentsResult] = await Promise.all([
      pool.query(
        `SELECT e.*, u.username AS created_by_name
         FROM asset_events e
         LEFT JOIN users u ON u.id = e.created_by
         WHERE e.asset_id = $1
         ORDER BY e.event_date DESC, e.id DESC`,
        [id]
      ),
      pool.query(
        `SELECT id, scheduled_at, department, room, asset_type, description,
                technician, priority, status, duration_minutes
         FROM maintenance_schedules
         WHERE asset_id = $1
         ORDER BY scheduled_at DESC
         LIMIT 25`,
        [id]
      ),
      pool.query(
        `SELECT sr.id, sr.work_performed, sr.outcome, sr.follow_up, sr.signer_name,
                sr.signer_date, sr.created_at, sr.labor_cost, sr.parts_cost, sr.total_cost,
                sr.downtime_minutes, s.scheduled_at, s.department, s.room
         FROM service_records sr
         LEFT JOIN maintenance_schedules s ON s.id = sr.schedule_id
         WHERE sr.asset_id = $1 OR s.asset_id = $1
         ORDER BY sr.created_at DESC
         LIMIT 25`,
        [id]
      ),
      pool.query(
        `SELECT id, title, description, department, room, priority, status, created_at
         FROM incidents WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 25`,
        [id]
      ),
    ]);

    res.json({
      ...asset,
      events: eventsResult.rows,
      schedules: schedulesResult.rows,
      service_records: serviceResult.rows,
      incidents: incidentsResult.rows,
    });
  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
}

async function createAsset(req, res) {
  const userId = req.user.id;
  const body = req.body || {};
  const userFields = (body.user || {});
  const lifecycleEvent = (body.lifecycle_event || {});

  if (!userFields.asset_identifier || !userFields.asset_type) {
    return res.status(400).json({ error: 'Asset identifier and asset type are required' });
  }

  const dateError = lifecycleDateError(userFields);
  if (dateError) {
    return res.status(400).json({ error: dateError });
  }

  const columns = ['created_by'];
  const values = [userId];

  for (const field of WRITABLE_FIELDS) {
    if (userFields[field] === undefined) continue;
    let value = userFields[field];
    if (['purchase_cost'].includes(field)) value = toNumeric(value);
    if (['purchase_date', 'warranty_start', 'warranty_expiry', 'deployed_date', 'end_of_life_date', 'disposal_date'].includes(field)) {
      value = toDateOnly(value);
    }
    if (typeof value === 'string' && value.trim() === '') value = null;
    columns.push(field);
    values.push(value);
  }

  if (!columns.includes('lifecycle_status')) {
    columns.push('lifecycle_status');
    values.push('procurement');
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertResult = await client.query(
      `INSERT INTO assets (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values
    );
    const assetId = insertResult.rows[0].id;

    // Procurement is the first lifecycle step, so record it automatically and
    // let the caller add detail via `lifecycle_event`.
    const eventDate = toDateOnly(lifecycleEvent.event_date)
      || toDateOnly(userFields.purchase_date)
      || toDateOnly(userFields.deployed_date)
      || new Date().toISOString().slice(0, 10);

    const eventType = EVENT_TYPES.includes(lifecycleEvent.event_type) ? lifecycleEvent.event_type : 'procurement';

    await client.query(
      `INSERT INTO asset_events (asset_id, event_type, event_date, description, cost, performed_by, from_status, to_status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)`,
      [
        assetId,
        eventType,
        eventDate,
        lifecycleEvent.description || null,
        toNumeric(lifecycleEvent.cost),
        lifecycleEvent.performed_by || null,
        columns.includes('lifecycle_status') ? values[columns.indexOf('lifecycle_status')] : 'procurement',
        userId,
      ]
    );

    await client.query('COMMIT');

    const assetResult = await assetWithRelations(assetId);
    await logMaintenanceAudit(req, 'CREATE_ASSET', 'asset', assetId, {
      asset_identifier: userFields.asset_identifier,
      lifecycle_status: assetResult.rows[0].lifecycle_status,
    }, userId);

    res.status(201).json(assetResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: `An asset with identifier "${userFields.asset_identifier}" already exists` });
    }
    if (isForeignKeyViolation(error)) {
      return res.status(400).json({ error: 'Unknown asset type' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Check constraint failed', detail: error.message });
    }
    console.error('Create asset error:', error);
    res.status(500).json({ error: 'Failed to create asset' });
  } finally {
    client.release();
  }
}

async function updateAsset(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const body = req.body || {};
  const fields = body.user || {};
  const lifecycleEvent = body.lifecycle_event || {};

  const updates = [];
  const values = [];
  let idx = 1;
  const previousStatus = { value: null };

  try {
    const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    previousStatus.value = existing.rows[0].lifecycle_status;

    for (const field of WRITABLE_FIELDS) {
      if (fields[field] === undefined) continue;
      let value = fields[field];
      if (field === 'purchase_cost') value = toNumeric(value);
      if (['purchase_date', 'warranty_start', 'warranty_expiry', 'deployed_date', 'end_of_life_date', 'disposal_date'].includes(field)) {
        value = toDateOnly(value);
      }
      if (typeof value === 'string' && value.trim() === '') value = null;
      updates.push(`${field} = $${idx++}`);
      values.push(value);
    }

    // Disposal is only meaningful once a date exists, and the DB enforces
    // that; surface it as a field error rather than a 500.
    if (fields.lifecycle_status === 'disposed' && !fields.disposal_date && !existing.rows[0].disposal_date) {
      return res.status(400).json({ error: 'A disposal date is required when marking an asset as disposed' });
    }

    // A partial update still has to leave the record coherent, so validate the
    // merged result rather than only the fields in this request.
    const mergedDates = {
      purchase_date: fields.purchase_date ?? existing.rows[0].purchase_date,
      warranty_start: fields.warranty_start ?? existing.rows[0].warranty_start,
      warranty_expiry: fields.warranty_expiry ?? existing.rows[0].warranty_expiry,
      deployed_date: fields.deployed_date ?? existing.rows[0].deployed_date,
      end_of_life_date: fields.end_of_life_date ?? existing.rows[0].end_of_life_date,
      disposal_date: fields.disposal_date ?? existing.rows[0].disposal_date,
    };
    const dateError = lifecycleDateError(mergedDates);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (updates.length > 0) {
        values.push(id);
        await client.query(
          `UPDATE assets SET ${updates.join(', ')} WHERE id = $${values.length}`,
          values
        );
      }

      // A lifecycle transition is itself a lifecycle event, so the history is
      // always a faithful audit trail of status changes.
      const nextStatus = fields.lifecycle_status;
      if (nextStatus && nextStatus !== previousStatus.value) {
        await client.query(
          `INSERT INTO asset_events (asset_id, event_type, event_date, description, cost, performed_by, from_status, to_status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            nextStatus === 'disposed' ? 'disposal'
              : nextStatus === 'retired' ? 'retirement'
                : nextStatus === 'deployed' ? 'deployment'
                  : 'status_change',
            toDateOnly(lifecycleEvent.event_date) || new Date().toISOString().slice(0, 10),
            lifecycleEvent.description || `Status changed from ${previousStatus.value} to ${nextStatus}`,
            toNumeric(lifecycleEvent.cost),
            lifecycleEvent.performed_by || null,
            previousStatus.value,
            nextStatus,
            userId,
          ]
        );
      } else if (lifecycleEvent.event_type) {
        await client.query(
          `INSERT INTO asset_events (asset_id, event_type, event_date, description, cost, performed_by, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            EVENT_TYPES.includes(lifecycleEvent.event_type) ? lifecycleEvent.event_type : 'note',
            toDateOnly(lifecycleEvent.event_date) || new Date().toISOString().slice(0, 10),
            lifecycleEvent.description || null,
            toNumeric(lifecycleEvent.cost),
            lifecycleEvent.performed_by || null,
            userId,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const assetResult = await assetWithRelations(id);
    await logMaintenanceAudit(req, 'UPDATE_ASSET', 'asset', id, {
      lifecycle_status: fields.lifecycle_status,
    }, userId);

    res.json(assetResult.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: 'An asset with that identifier already exists' });
    }
    if (isForeignKeyViolation(error)) {
      return res.status(400).json({ error: 'Unknown asset type' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Check constraint failed', detail: error.message });
    }
    console.error('Update asset error:', error);
    res.status(500).json({ error: 'Failed to update asset' });
  }
}

async function deleteAsset(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT id, asset_identifier FROM assets WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Downtime windows cascade from the asset, but lifecycle history must be
      // preserved for audit, so detaching is the safer default than deleting.
      await client.query('UPDATE maintenance_schedules SET asset_id = NULL WHERE asset_id = $1', [id]);
      await client.query('UPDATE maintenance_recurrences SET asset_id = NULL WHERE asset_id = $1', [id]);
      await client.query('UPDATE service_records SET asset_id = NULL WHERE asset_id = $1', [id]);
      await client.query('UPDATE incidents SET asset_id = NULL WHERE asset_id = $1', [id]);
      await client.query('DELETE FROM asset_events WHERE asset_id = $1', [id]);
      await client.query('DELETE FROM assets WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    await logMaintenanceAudit(req, 'DELETE_ASSET', 'asset', id, {
      asset_identifier: existing.rows[0].asset_identifier,
    }, userId);
    res.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
}

async function getAssetEvents(req, res) {
  const { id } = req.params;
  const { event_type, from, to } = req.query;
  const conditions = ['e.asset_id = $1'];
  const params = [id];
  let idx = 2;

  if (event_type) { conditions.push(`e.event_type = $${idx++}`); params.push(event_type); }
  if (isValidInstant(from)) { conditions.push(`e.event_date >= $${idx++}::date`); params.push(new Date(from).toISOString().slice(0, 10)); }
  if (isValidInstant(to)) { conditions.push(`e.event_date <= $${idx++}::date`); params.push(new Date(to).toISOString().slice(0, 10)); }

  try {
    const result = await pool.query(
      `SELECT e.*, u.username AS created_by_name
       FROM asset_events e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.event_date DESC, e.id DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get asset events error:', error);
    res.status(500).json({ error: 'Failed to fetch asset lifecycle events' });
  }
}

async function createAssetEvent(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { event_type, event_date, description, cost, performed_by } = req.body || {};

  if (!EVENT_TYPES.includes(event_type)) {
    return res.status(400).json({ error: `Event type must be one of: ${EVENT_TYPES.join(', ')}` });
  }
  if (!event_date || !toDateOnly(event_date)) {
    return res.status(400).json({ error: 'A valid event date is required' });
  }

  try {
    const asset = await pool.query('SELECT * FROM assets WHERE id = $1', [id]);
    if (asset.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO asset_events (asset_id, event_type, event_date, description, cost, performed_by, to_status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          id,
          event_type,
          toDateOnly(event_date),
          description || null,
          toNumeric(cost),
          performed_by || null,
          ['retirement', 'disposal'].includes(event_type) ? asset.rows[0].lifecycle_status : null,
          userId,
        ]
      );
      await client.query('COMMIT');

      await logMaintenanceAudit(req, 'CREATE_ASSET_EVENT', 'asset', id, { event_type }, userId);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create asset event error:', error);
    res.status(500).json({ error: 'Failed to record lifecycle event' });
  }
}

async function updateLifecycleStatus(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { lifecycle_status, event_date, description, disposal_method, disposal_reference } = req.body || {};

  if (!LIFECYCLE_STATUSES.includes(lifecycle_status)) {
    return res.status(400).json({ error: `Lifecycle status must be one of: ${LIFECYCLE_STATUSES.join(', ')}` });
  }

  const updates = ['lifecycle_status = $1'];
  const values = [lifecycle_status];
  let idx = 2;

  if (lifecycle_status === 'deployed') {
    updates.push(`deployed_date = COALESCE(deployed_date, $${idx++})`);
    values.push(toDateOnly(event_date) || new Date().toISOString().slice(0, 10));
  }
  if (lifecycle_status === 'disposed') {
    if (disposal_method !== undefined) { updates.push(`disposal_method = $${idx++}`); values.push(disposal_method || null); }
    if (disposal_reference !== undefined) { updates.push(`disposal_reference = $${idx++}`); values.push(disposal_reference || null); }
  }

  try {
    const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (lifecycle_status === 'disposed' && !existing.rows[0].disposal_date) {
      const disposalDate = toDateOnly(event_date);
      if (!disposalDate) {
        return res.status(400).json({ error: 'A disposal date is required when disposing of an asset' });
      }
      updates.push(`disposal_date = $${idx++}`);
      values.push(disposalDate);
    }

    // A transition can supply the disposal or deployment date, so validate the
    // state the update is about to produce rather than trusting the event date.
    const proposedDates = {
      ...existing.rows[0],
      end_of_life_date: undefined,
      disposal_date: toDateOnly(event_date) || existing.rows[0].disposal_date,
    };
    if (lifecycle_status === 'deployed') {
      proposedDates.deployed_date = toDateOnly(event_date)
        || existing.rows[0].deployed_date
        || new Date().toISOString().slice(0, 10);
    }
    const dateError = lifecycleDateError(proposedDates);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      values.push(id);
      await client.query(`UPDATE assets SET ${updates.join(', ')} WHERE id = $${idx}`, values);

      await client.query(
        `INSERT INTO asset_events (asset_id, event_type, event_date, description, from_status, to_status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          lifecycle_status === 'disposed' ? 'disposal'
            : lifecycle_status === 'retired' ? 'retirement'
              : lifecycle_status === 'deployed' ? 'deployment'
                : 'status_change',
          toDateOnly(event_date) || new Date().toISOString().slice(0, 10),
          description || null,
          existing.rows[0].lifecycle_status,
          lifecycle_status,
          userId,
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const assetResult = await assetWithRelations(id);
    await logMaintenanceAudit(req, 'UPDATE_ASSET_STATUS', 'asset', id, {
      from: existing.rows[0].lifecycle_status,
      to: lifecycle_status,
    }, userId);

    res.json(assetResult.rows[0]);
  } catch (error) {
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Check constraint failed', detail: error.message });
    }
    console.error('Update lifecycle status error:', error);
    res.status(500).json({ error: 'Failed to update lifecycle status' });
  }
}

async function getAssetTypes(req, res) {
  try {
    const result = await pool.query(
      `SELECT t.code, t.label, t.is_active, t.sort_order,
              (SELECT count(*) FROM assets a WHERE a.asset_type = t.code) AS asset_count
       FROM asset_types t
       ORDER BY t.sort_order, t.label`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get asset types error:', error);
    res.status(500).json({ error: 'Failed to fetch asset types' });
  }
}

async function createAssetType(req, res) {
  const { code, label } = req.body || {};
  if (!code || !/^[a-z0-9_]{2,100}$/.test(code)) {
    return res.status(400).json({ error: 'Code must be 2-100 lowercase letters, numbers or underscores' });
  }
  if (!label) {
    return res.status(400).json({ error: 'Label is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO asset_types (code, label, sort_order)
       VALUES ($1, $2, COALESCE((SELECT max(sort_order) + 10 FROM asset_types), 100))
       RETURNING *`,
      [code, label]
    );
    await logMaintenanceAudit(req, 'CREATE_ASSET_TYPE', 'asset_type', null, { code, label }, req.user.id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: 'That asset type code already exists' });
    }
    console.error('Create asset type error:', error);
    res.status(500).json({ error: 'Failed to create asset type' });
  }
}

async function getAssetStats(req, res) {
  try {
    const result = await pool.query(
      `SELECT
          count(*)                                                             AS total,
          count(*) FILTER (WHERE lifecycle_status = 'procurement')             AS procurement,
          count(*) FILTER (WHERE lifecycle_status = 'deployed')                AS deployed,
          count(*) FILTER (WHERE lifecycle_status = 'in_service')              AS in_service,
          count(*) FILTER (WHERE lifecycle_status = 'maintenance')             AS maintenance,
          count(*) FILTER (WHERE lifecycle_status = 'retired')                 AS retired,
          count(*) FILTER (WHERE lifecycle_status = 'disposed')                AS disposed,
          count(*) FILTER (WHERE warranty_expiry < CURRENT_DATE)               AS warranty_expired,
          count(*) FILTER (WHERE warranty_expiry >= CURRENT_DATE
                             AND warranty_expiry <= CURRENT_DATE + 90)        AS warranty_expiring,
          count(*) FILTER (WHERE end_of_life_date <= CURRENT_DATE + 180)      AS end_of_life_soon,
          COALESCE(sum(purchase_cost), 0)                                      AS procurement_spend,
          COALESCE(avg(purchase_cost), 0)                                      AS avg_purchase_cost,
          -- "date - date" already yields days, so EXTRACT(DAY FROM ...) would
          -- have no interval operand to work with.
          round(COALESCE(avg(CURRENT_DATE - purchase_date)
            FILTER (WHERE purchase_date IS NOT NULL), 1), 1)                   AS avg_age_days
       FROM assets`
    );

    const byType = await pool.query(
      `SELECT t.code, t.label, t.sort_order,
              count(a.id)                                                     AS assets,
              count(a.id) FILTER (WHERE a.lifecycle_status IN ('deployed','in_service')) AS in_service,
              COALESCE(sum(a.purchase_cost), 0)                                AS procurement_spend
       FROM asset_types t
       LEFT JOIN assets a ON a.asset_type = t.code
       GROUP BY t.code, t.label, t.sort_order
       ORDER BY t.sort_order`
    );

    const stats = result.rows[0];
    res.json({
      totals: {
        total: Number(stats.total),
        procurement: Number(stats.procurement),
        deployed: Number(stats.deployed),
        in_service: Number(stats.in_service),
        maintenance: Number(stats.maintenance),
        retired: Number(stats.retired),
        disposed: Number(stats.disposed),
        warranty_expired: Number(stats.warranty_expired),
        warranty_expiring: Number(stats.warranty_expiring),
        end_of_life_soon: Number(stats.end_of_life_soon),
        procurement_spend: Number(stats.procurement_spend),
        avg_purchase_cost: Number(stats.avg_purchase_cost),
        avg_age_years: Number((Number(stats.avg_age_days) / 365).toFixed(1)),
      },
      by_type: byType.rows.map((row) => ({
        ...row,
        assets: Number(row.assets),
        in_service: Number(row.in_service),
        procurement_spend: Number(row.procurement_spend),
      })),
    });
  } catch (error) {
    console.error('Get asset stats error:', error);
    res.status(500).json({ error: 'Failed to fetch asset statistics' });
  }
}

module.exports = {
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetEvents,
  createAssetEvent,
  updateLifecycleStatus,
  getAssetTypes,
  createAssetType,
  getAssetStats,
  LIFECYCLE_STATUSES,
  EVENT_TYPES,
};
