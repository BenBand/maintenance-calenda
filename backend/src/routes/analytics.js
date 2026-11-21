const express = require('express');
const router = express.Router();
const {
  getOverview, getMaintenanceFrequency, getTechnicianWorkload,
  getOverdueTrend, getTimeByDepartment, getUptimeStats, getUserStats, getTechnicianReport,
} = require('../controllers/analyticsController');
const { exportTechnicianReportPDF } = require('../controllers/pdfExportController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { analyticsQueryValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/overview', requirePermission('analytics:read'), analyticsQueryValidation, getOverview);
router.get('/maintenance-frequency', requirePermission('analytics:read'), analyticsQueryValidation, getMaintenanceFrequency);
router.get('/technician-workload', requirePermission('analytics:read'), analyticsQueryValidation, getTechnicianWorkload);
router.get('/overdue-trend', requirePermission('analytics:read'), analyticsQueryValidation, getOverdueTrend);
router.get('/time-by-department', requirePermission('analytics:read'), analyticsQueryValidation, getTimeByDepartment);
router.get('/uptime', requirePermission('analytics:read'), analyticsQueryValidation, getUptimeStats);
// Personal stats for the signed-in user (no analytics permission required — every
// signed-in user can read their own reports, schedules and service records).
router.get('/user-stats', authenticateToken, analyticsQueryValidation, getUserStats);
// Staff can view any user's stats (used for the admin profile view).
router.get('/users/:userId/stats', requirePermission('analytics:read'), analyticsQueryValidation, getUserStats);
// Technician performance report: issues resolved and ratings by period.
router.get('/technician-report', requirePermission('analytics:read'), analyticsQueryValidation, getTechnicianReport);
router.get('/technician-report.pdf', requirePermission('analytics:read'), exportTechnicianReportPDF);

module.exports = router;
