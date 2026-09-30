const express = require('express');
const router = express.Router();
const {
  createIncident, getAllIncidents, getIncidentById, updateIncident, deleteIncident,
} = require('../controllers/incidentController');
const { exportIncidentPDF } = require('../controllers/pdfExportController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { incidentValidation, idParamValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/', requirePermission('incident:read'), getAllIncidents);
router.get('/:id', requirePermission('incident:read'), idParamValidation, getIncidentById);
router.post('/', requirePermission('incident:write'), incidentValidation, createIncident);
router.put('/:id', requirePermission('incident:write'), idParamValidation, incidentValidation, updateIncident);
router.delete('/:id', requirePermission('incident:delete'), idParamValidation, deleteIncident);
router.get('/:id/export/pdf', requirePermission('incident:read'), idParamValidation, exportIncidentPDF);

module.exports = router;
