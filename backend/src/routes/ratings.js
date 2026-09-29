const express = require('express');
const router = express.Router();
const {
  getRatingsByIncident, upsertRating, deleteRating,
} = require('../controllers/ratingController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const {
  idParamValidation, incidentIdParamValidation, ratingValidation,
} = require('../middleware/validate');

// Ratings are read by anyone who can read the parent incident.
router.use(authenticateToken, csrfProtection);

router.get('/incident/:incidentId',
  requirePermission('rating:read'),
  incidentIdParamValidation,
  getRatingsByIncident
);

router.post('/incident/:incidentId',
  requirePermission('rating:write'),
  incidentIdParamValidation,
  ratingValidation,
  upsertRating
);

router.delete('/:id',
  requirePermission('rating:write'),
  idParamValidation,
  deleteRating
);

module.exports = router;