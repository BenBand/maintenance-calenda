const express = require('express');
const router = express.Router();
const {
  createServiceRecord, getServiceRecords, getServiceRecordById, updateServiceRecord, deleteServiceRecord,
} = require('../controllers/serviceController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { serviceRecordValidation, idParamValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/', requirePermission('service:read'), getServiceRecords);
router.get('/:id', requirePermission('service:read'), idParamValidation, getServiceRecordById);
router.post('/', requirePermission('service:write'), serviceRecordValidation, createServiceRecord);
router.put('/:id', requirePermission('service:write'), idParamValidation, serviceRecordValidation, updateServiceRecord);
router.delete('/:id', requirePermission('service:delete'), idParamValidation, deleteServiceRecord);

module.exports = router;
