const express = require('express');
const router = express.Router();
const { login, me, logout, updateProfile } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', authenticateToken, me);
router.post('/logout', authenticateToken, logout);
router.put('/profile', authenticateToken, updateProfile);

module.exports = router;
