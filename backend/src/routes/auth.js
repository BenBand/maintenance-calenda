const express = require('express');
const router = express.Router();
const { login, refresh, me, logout, updateProfile } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { loginLimiter } = require('../middleware/rateLimits');
const { loginValidation, profileUpdateValidation } = require('../middleware/validate');

router.post('/login', loginLimiter, loginValidation, login);
router.post('/refresh', loginLimiter, refresh);
router.get('/me', authenticateToken, csrfProtection, me);
router.post('/logout', authenticateToken, csrfProtection, logout);
router.put('/profile', authenticateToken, csrfProtection, profileUpdateValidation, updateProfile);

module.exports = router;
