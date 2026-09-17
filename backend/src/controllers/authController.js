const pool = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/bcrypt');
const jwt = require('jsonwebtoken');
const { logMaintenanceAudit } = require('../middleware/audit');

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
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    setImmediate(() => {
      logMaintenanceAudit(req, 'LOGIN', 'auth', user.id, { username: user.username, role: user.role }, user.id);
    });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
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
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
}

async function logout(req, res) {
  res.json({ message: 'Logged out successfully' });
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
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, email, role, created_at, updated_at`;
    const result = await pool.query(query, values);
    const updatedUser = result.rows[0];
    res.json({
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
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

module.exports = { login, me, logout, updateProfile };
