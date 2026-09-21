const express = require('express');
const router = express.Router();
const {
  createSchedule, getAllSchedules, getScheduleById, updateSchedule, deleteSchedule,
  getUpcoming, getOverdue, getSchedulesByDate, getDepartments,
} = require('../controllers/maintenanceController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const {
  maintenanceScheduleValidation,
  idParamValidation,
} = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/upcoming', requirePermission('maintenance:read'), getUpcoming);
router.get('/overdue', requirePermission('maintenance:read'), getOverdue);
router.get('/departments', requirePermission('maintenance:read'), getDepartments);
router.get('/date/:date', requirePermission('maintenance:read'), getSchedulesByDate);
router.get('/', requirePermission('maintenance:read'), getAllSchedules);
router.get('/:id', requirePermission('maintenance:read'), idParamValidation, getScheduleById);
router.post('/', requirePermission('maintenance:write'), maintenanceScheduleValidation, createSchedule);
router.put('/:id', requirePermission('maintenance:write'), idParamValidation, maintenanceScheduleValidation, updateSchedule);
router.delete('/:id', requirePermission('maintenance:delete'), idParamValidation, deleteSchedule);

module.exports = router;
