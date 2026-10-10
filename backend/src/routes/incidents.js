const express = require('express');
const router = express.Router();
const {
  createIncident, getAllIncidents, getMyIncidents, getIncidentById, updateIncident, deleteIncident,
} = require('../controllers/incidentController');
const { exportIncidentPDF } = require('../controllers/pdfExportController');
const { authenticateToken, requirePermission, PERMISSIONS } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { incidentValidation, idParamValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/', requirePermission(PERMISSIONS.INCIDENT_READ), getAllIncidents);
// The `user` role needs their own history — they should only ever see the
// incidents they filed, not the whole queue.
router.get('/mine', requirePermission(PERMISSIONS.INCIDENT_READ), getMyIncidents);
router.get('/:id', requirePermission(PERMISSIONS.INCIDENT_READ), idParamValidation, getIncidentById);
// Reporting is reserved for the `user` role. The IT roles respond to and close
// incidents, which is the PUT below, so they cannot file requests themselves.
router.post('/', requirePermission(PERMISSIONS.INCIDENT_CREATE), incidentValidation, createIncident);
router.put('/:id', requirePermission(PERMISSIONS.INCIDENT_WRITE), idParamValidation, incidentValidation, updateIncident);
router.delete('/:id', requirePermission(PERMISSIONS.INCIDENT_DELETE), idParamValidation, deleteIncident);
router.get('/:id/export/pdf', requirePermission(PERMISSIONS.INCIDENT_READ), idParamValidation, exportIncidentPDF);

module.exports = router;
