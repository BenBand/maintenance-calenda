const express = require('express');
const router = express.Router();
const {
  getOverview, getMaintenanceFrequency, getTechnicianWorkload,
  getOverdueTrend, getCostByDepartment, getUptimeStats,
} = require('../controllers/analyticsController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { analyticsQueryValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/overview', requirePermission('analytics:read'), analyticsQueryValidation, getOverview);
router.get('/maintenance-frequency', requirePermission('analytics:read'), analyticsQueryValidation, getMaintenanceFrequency);
router.get('/technician-workload', requirePermission('analytics:read'), analyticsQueryValidation, getTechnicianWorkload);
router.get('/overdue-trend', requirePermission('analytics:read'), analyticsQueryValidation, getOverdueTrend);
router.get('/cost-by-department', requirePermission('analytics:read'), analyticsQueryValidation, getCostByDepartment);
router.get('/uptime', requirePermission('analytics:read'), analyticsQueryValidation, getUptimeStats);

module.exports = router;
