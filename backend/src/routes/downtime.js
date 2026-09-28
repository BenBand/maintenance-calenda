const express = require('express');
const router = express.Router();
const {
  getWindows, createWindow, updateWindow, deleteWindow, getAvailability,
} = require('../controllers/downtimeController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { idParamValidation, downtimeWindowValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/windows', requirePermission('maintenance:read'), getWindows);
router.post('/windows', requirePermission('maintenance:write'), downtimeWindowValidation, createWindow);
router.put('/windows/:id', requirePermission('maintenance:write'), idParamValidation, downtimeWindowValidation, updateWindow);
router.delete('/windows/:id', requirePermission('maintenance:delete'), idParamValidation, deleteWindow);

// Slot availability for a given day: bookings, conflicts and downtime.
router.get('/availability', requirePermission('maintenance:read'), getAvailability);

module.exports = router;
