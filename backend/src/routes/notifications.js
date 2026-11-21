const express = require('express');
const router = express.Router();
const { getNotificationCount } = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');

router.use(authenticateToken, csrfProtection);

router.get('/count', getNotificationCount);

module.exports = router;
