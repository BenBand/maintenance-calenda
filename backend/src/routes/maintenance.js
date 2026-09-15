const express = require('express');
const router = express.Router();
const {
  createSchedule, getAllSchedules, getScheduleById, updateSchedule, deleteSchedule,
  getUpcoming, getOverdue, getSchedulesByDate, getDepartments,
} = require('../controllers/maintenanceController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/upcoming', getUpcoming);
router.get('/overdue', getOverdue);
router.get('/departments', getDepartments);
router.get('/date/:date', getSchedulesByDate);
router.get('/', getAllSchedules);
router.get('/:id', getScheduleById);
router.post('/', createSchedule);
router.put('/:id', updateSchedule);
router.delete('/:id', deleteSchedule);

module.exports = router;
