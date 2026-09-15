const express = require('express');
const router = express.Router();
const { createServiceRecord, getServiceRecords, getServiceRecordById, updateServiceRecord, deleteServiceRecord } = require('../controllers/serviceController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', getServiceRecords);
router.get('/:id', getServiceRecordById);
router.post('/', createServiceRecord);
router.put('/:id', updateServiceRecord);
router.delete('/:id', deleteServiceRecord);

module.exports = router;
