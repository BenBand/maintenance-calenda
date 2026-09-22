const crypto = require('crypto');
const pool = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/bcrypt');
const jwt = require('jsonwebtoken');
const { logMaintenanceAudit } = require('../middleware/audit');
const { generateCSRFToken } = require('../middleware/csrf');

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function getRefreshTokenLifetimeMs() {
  const match = /^(\d+)(s|m|h|d)$/.exec(process.env.JWT_REFRESH_EXPIRES_IN || '30d');
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return Number(match[1]) * multipliers[match[2]];
}

function createAccessToken(user, csrfToken) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, csrfToken, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

async function issueSession(req, user) {
  const csrfToken = generateCSRFToken();
  const token = createAccessToken(user, csrfToken);
  const refreshToken = createRefreshToken();
  const refreshTokenExpiresAt = new Date(Date.now() + getRefreshTokenLifetimeMs());

  await pool.query(
    'UPDATE users SET refresh_token = $1, refresh_token_expires_at = $2 WHERE id = $3',
    [hashRefreshToken(refreshToken), refreshTokenExpiresAt, user.id]
  );

  if (req) {
    setImmediate(() => {
      logMaintenanceAudit(
        req,
        req.path.includes('/refresh') ? 'REFRESH_TOKEN' : 'LOGIN',
        'auth',
        user.id,
        { username: user.username, role: user.role },
        user.id
      );
    });
  }

  return {
    token,
    csrfToken,
    refreshToken,
    user: publicUser(user),
  };
}

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const session = await issueSession(req, user);
    res.json(session);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
}

async function refresh(req, res) {
  const refreshToken = req.body?.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    const result = await pool.query(
      `SELECT *
       FROM users
       WHERE refresh_token = $1
         AND refresh_token_expires_at > CURRENT_TIMESTAMP`,
      [hashRefreshToken(refreshToken)]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const session = await issueSession(req, user);
    res.json(session);
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Server error during session refresh' });
  }
}

async function me(req, res) {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT id, username, email, role FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    res.json({
      ...publicUser(user),
      csrfToken: req.user.csrfToken,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
}

async function logout(req, res) {
  try {
    await pool.query(
      'UPDATE users SET refresh_token = NULL, refresh_token_expires_at = NULL WHERE id = $1',
      [req.user.id]
    );
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Server error during logout' });
  }
}

async function updateProfile(req, res) {
  const userId = req.user.id;
  const { username, email, currentPassword, newPassword } = req.body;
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }
      const isValid = await comparePassword(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid current password' });
      }
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
    if (newPassword) {
      const hashed = await hashPassword(newPassword);
      updates.push(`password_hash = $${idx++}`);
      values.push(hashed);
    }
    if (updates.length === 0) {
      return res.json({
        user: {
          ...publicUser(user),
          csrfToken: req.user.csrfToken,
        },
      });
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, email, role, created_at, updated_at`;
    const result = await pool.query(query, values);
    const updatedUser = result.rows[0];
    res.json({
      user: {
        ...publicUser(updatedUser),
        csrfToken: req.user.csrfToken,
      },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

module.exports = { login, refresh, me, logout, updateProfile };
