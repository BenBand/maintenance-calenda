const express = require('express');
const router = express.Router();
const {
  createServiceRecord, getServiceRecords, getServiceRecordById, updateServiceRecord, deleteServiceRecord,
} = require('../controllers/serviceController');
const { exportServiceRecordPDF, exportCompletionCertificatePDF, exportComplianceReportPDF } = require('../controllers/pdfExportController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { serviceRecordValidation, idParamValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

// Static export paths must be registered before `/:id`, otherwise Express
// matches them as an :id param and the compliance report 400s.
router.get('/export/compliance', requirePermission('service:read'), exportComplianceReportPDF);

router.get('/', requirePermission('service:read'), getServiceRecords);
router.get('/:id', requirePermission('service:read'), idParamValidation, getServiceRecordById);
router.post('/', requirePermission('service:write'), serviceRecordValidation, createServiceRecord);
router.put('/:id', requirePermission('service:write'), idParamValidation, serviceRecordValidation, updateServiceRecord);
router.delete('/:id', requirePermission('service:delete'), idParamValidation, deleteServiceRecord);

router.get('/:id/export/pdf', requirePermission('service:read'), idParamValidation, exportServiceRecordPDF);
router.get('/:id/export/certificate', requirePermission('service:read'), idParamValidation, exportCompletionCertificatePDF);

module.exports = router;
