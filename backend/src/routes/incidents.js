const express = require('express');
const router = express.Router();
const {
  createIncident, getAllIncidents, getIncidentById, updateIncident, deleteIncident,
} = require('../controllers/incidentController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', getAllIncidents);
router.get('/:id', getIncidentById);
router.post('/', createIncident);
router.put('/:id', updateIncident);
router.delete('/:id', deleteIncident);

module.exports = router;
