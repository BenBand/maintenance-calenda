const pool = require('../config/database');
const { hashPassword } = require('../utils/bcrypt');
const { logMaintenanceAudit } = require('../middleware/audit');
const { ROLES } = require('../middleware/auth');
const { getPagination } = require('../utils/pagination');

const USER_COLUMNS = 'id, username, email, role, created_at, updated_at';

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function countAdmins(excludeUserId) {
  if (excludeUserId === undefined || excludeUserId === null) {
    const result = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', [ROLES.ADMIN]);
    return parseInt(result.rows[0].count, 10);
  }
  const result = await pool.query(
    'SELECT COUNT(*) FROM users WHERE role = $1 AND id <> $2',
    [ROLES.ADMIN, excludeUserId]
  );
  return parseInt(result.rows[0].count, 10);
}

async function listUsers(req, res) {
  const { search, role, page, limit } = req.query;
  const { limit: pageLimit, offset } = getPagination(req.query);
  const conditions = [];
  const params = [];
  let idx = 1;

  if (role) {
    conditions.push(`role = $${idx++}`);
    params.push(role);
  }
  if (search) {
    conditions.push(`(username ILIKE $${idx} OR email ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM users ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users ${whereClause} ORDER BY username ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageLimit, offset]
    );

    res.json({
      data: result.rows,
      pagination: { total, page: parseInt(page || 1, 10), limit: pageLimit },
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

async function getUserById(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

async function createUser(req, res) {
  const { username, email, password, role } = req.body;
  const assignedRole = role || ROLES.DEVELOPER;

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [username, email, passwordHash, assignedRole]
    );
    const user = result.rows[0];
    await logMaintenanceAudit(req, 'CREATE_USER', 'user', user.id, { username, role: assignedRole });
    res.status(201).json(user);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Invalid role' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { username, email, role, password } = req.body;
  const actingUserId = req.user.id;

  try {
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = existing.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (role && role !== user.role && user.role === ROLES.ADMIN) {
      const remainingAdmins = await countAdmins(user.id);
      if (remainingAdmins === 0) {
        return res.status(409).json({ error: 'Cannot demote the last remaining admin' });
      }
    }

    if (String(user.id) === String(actingUserId) && role && role !== user.role) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (username && username !== user.username) {
      updates.push(`username = $${idx++}`);
      values.push(username);
    }
    if (email && email !== user.email) {
      updates.push(`email = $${idx++}`);
      values.push(email);
    }
    if (password) {
      updates.push(`password_hash = $${idx++}`);
      values.push(await hashPassword(password));
    }

    const credentialsChanged = Boolean(password)
      || (role && role !== user.role)
      || (username && username !== user.username)
      || (email && email !== user.email);

    if (role && role !== user.role) {
      updates.push(`role = $${idx++}`);
      values.push(role);
    }

    if (updates.length === 0) {
      return res.json(publicUser(user));
    }

    // Force re-authentication so a revoked role or reset password cannot keep
    // riding on an existing refresh token.
    if (credentialsChanged) {
      updates.push('refresh_token = NULL', 'refresh_token_expires_at = NULL');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING ${USER_COLUMNS}`,
      values
    );

    await logMaintenanceAudit(req, 'UPDATE_USER', 'user', user.id, {
      username: username || user.username,
      previousRole: user.role,
      role: role || user.role,
      passwordReset: Boolean(password),
    });

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Invalid role' });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
}

async function deleteUser(req, res) {
  const { id } = req.params;
  const actingUserId = req.user.id;

  if (String(id) === String(actingUserId)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = existing.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === ROLES.ADMIN) {
      const remainingAdmins = await countAdmins(user.id);
      if (remainingAdmins === 0) {
        return res.status(409).json({ error: 'Cannot delete the last remaining admin' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await logMaintenanceAudit(req, 'DELETE_USER', 'user', user.id, { username: user.username, role: user.role });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
