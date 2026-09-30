const express = require('express');
const router = express.Router();
const {
  getCommentsByIncident, createComment, updateComment, deleteComment,
} = require('../controllers/commentController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const {
  idParamValidation, incidentIdParamValidation, commentValidation,
} = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/incident/:incidentId',
  requirePermission('incident:read'),
  incidentIdParamValidation,
  getCommentsByIncident
);

router.post('/incident/:incidentId',
  requirePermission('incident:write'),
  incidentIdParamValidation,
  commentValidation,
  createComment
);

router.put('/:id',
  requirePermission('incident:write'),
  idParamValidation,
  commentValidation,
  updateComment
);

router.delete('/:id',
  requirePermission('incident:write'),
  idParamValidation,
  deleteComment
);

module.exports = router;