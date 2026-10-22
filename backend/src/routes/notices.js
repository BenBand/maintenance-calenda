const express = require('express');
const router = express.Router();
const { createNotice, getAllNotices, publishNotice, deleteNotice } = require('../controllers/noticeController');
const { authenticateToken, requirePermission, PERMISSIONS } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { idParamValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/', requirePermission(PERMISSIONS.INCIDENT_READ), getAllNotices);
router.post('/', requirePermission(PERMISSIONS.MAINTENANCE_WRITE), createNotice);
router.post('/:id/publish', requirePermission(PERMISSIONS.MAINTENANCE_WRITE), idParamValidation, publishNotice);
router.delete('/:id', requirePermission(PERMISSIONS.MAINTENANCE_DELETE), idParamValidation, deleteNotice);

module.exports = router;
