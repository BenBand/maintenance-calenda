const express = require('express');
const router = express.Router();
const { createIncident } = require('../controllers/incidentController');
const { getRatingsByIncident, upsertRating } = require('../controllers/ratingController');
const { incidentValidation, ratingValidation, incidentIdParamValidation } = require('../middleware/validate');
const { publicReportLimiter } = require('../middleware/rateLimits');

// Public, no-login fault reporting (e.g. QR code scans).
router.post('/incidents', publicReportLimiter, incidentValidation, createIncident);
// Public rating/feedback for a resolved or closed incident (no account needed).
router.get('/incidents/:incidentId/ratings', publicReportLimiter, incidentIdParamValidation, getRatingsByIncident);
router.post('/incidents/:incidentId/ratings', publicReportLimiter, incidentIdParamValidation, ratingValidation, upsertRating);

module.exports = router;
