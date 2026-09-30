const express = require('express');
const router = express.Router();
const { login, refresh, me, logout, updateProfile } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { loginLimiter } = require('../middleware/rateLimits');
const { loginValidation, profileUpdateValidation } = require('../middleware/validate');

router.post('/login', loginLimiter, loginValidation, login);
router.post('/refresh', loginLimiter, refresh);
// `/me` establishes *who the caller is*, so it is gated on authentication
// alone. Gating it on a role permission is circular: a role the permission
// map does not recognise would 403 here, and the client's session check
// treats that as an invalid session and signs the user straight back out.
router.get('/me', authenticateToken, csrfProtection, me);
router.post('/logout', authenticateToken, csrfProtection, logout);
router.put('/profile', authenticateToken, csrfProtection, profileUpdateValidation, updateProfile);

module.exports = router;
